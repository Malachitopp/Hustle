/**
 * Days in a time zone. A day runs midnight to midnight in the zone a session started in,
 * so work that runs past midnight is split between the two days it touches.
 *
 * Uses Intl.DateTimeFormat, the only zone-aware clock arithmetic available without a
 * time zone database of our own.
 */
import type { Instant, RunningPeriod } from './state';

/** A calendar date as "YYYY-MM-DD". Sorts correctly as a string. */
export type DateKey = string;

const MINUTE = 60_000;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      hourCycle: 'h23',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

type WallClock = { year: number; month: number; day: number; hour: number; minute: number; second: number };

/** The wall-clock reading in `timeZone` at instant `at`. */
function wallClock(at: Instant, timeZone: string): WallClock {
  const parts = formatterFor(timeZone).formatToParts(new Date(at));
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    // Some engines print midnight as "24" when hour12 is false.
    hour: value('hour') % 24,
    minute: value('minute'),
    second: value('second'),
  };
}

function keyOf(clock: WallClock): DateKey {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${clock.year}-${pad(clock.month)}-${pad(clock.day)}`;
}

/** The date that contains `at`, in `timeZone`. */
export function dateKey(at: Instant, timeZone: string): DateKey {
  return keyOf(wallClock(at, timeZone));
}

/** How far `timeZone` is ahead of UTC at instant `at`, in milliseconds. */
function offsetAt(at: Instant, timeZone: string): number {
  const c = wallClock(at, timeZone);
  const asIfUtc = Date.UTC(c.year, c.month - 1, c.day, c.hour, c.minute, c.second);
  return asIfUtc - Math.floor(at / 1000) * 1000;
}

const dayStarts = new Map<string, Instant>();

/**
 * The first instant of the day that contains `at`, in `timeZone`: local midnight, or the
 * first moment that exists after it where clocks jump forward over midnight.
 */
export function startOfDay(at: Instant, timeZone: string): Instant {
  const target = dateKey(at, timeZone);
  const cacheKey = `${timeZone}|${target}`;
  const cached = dayStarts.get(cacheKey);
  if (cached !== undefined) return cached;

  // Treat local midnight as if it were UTC, then undo the zone's offset. That is exact unless a
  // daylight-saving change sits between midnight and `at`, so walk to the true boundary from there.
  const c = wallClock(at, timeZone);
  const STEP = 15 * MINUTE;
  let t = Date.UTC(c.year, c.month - 1, c.day) - offsetAt(at, timeZone);
  while (dateKey(t, timeZone) < target) t += STEP;
  while (dateKey(t, timeZone) > target) t -= STEP;
  while (dateKey(t - STEP, timeZone) === target) t -= STEP;

  // The boundary is now within (t - STEP, t]. Narrow it to the minute.
  let before = t - STEP;
  let onOrAfter = t;
  while (onOrAfter - before > MINUTE) {
    const mid = before + Math.floor((onOrAfter - before) / 2 / MINUTE) * MINUTE;
    if (dateKey(mid, timeZone) === target) onOrAfter = mid;
    else before = mid;
  }

  dayStarts.set(cacheKey, onOrAfter);
  return onOrAfter;
}

/** The first instant of the day after the one that starts at `dayStart`. */
export function nextDayStart(dayStart: Instant, timeZone: string): Instant {
  // Days last between 23 and 25 hours, so 36 hours on is always inside the next day.
  return startOfDay(dayStart + 36 * 60 * MINUTE, timeZone);
}

/** Work time per date for some running periods, split at midnight in `timeZone`. */
export function workTimeByDay(periods: readonly RunningPeriod[], timeZone: string): Map<DateKey, number> {
  const byDay = new Map<DateKey, number>();
  for (const period of periods) {
    let cursor = period.from;
    while (cursor < period.to) {
      const date = dateKey(cursor, timeZone);
      const dayEnd = nextDayStart(startOfDay(cursor, timeZone), timeZone);
      const sliceEnd = Math.min(period.to, dayEnd);
      byDay.set(date, (byDay.get(date) ?? 0) + (sliceEnd - cursor));
      cursor = sliceEnd;
    }
  }
  return byDay;
}
