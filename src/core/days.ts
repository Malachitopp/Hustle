/**
 * Days in a time zone. A day runs midnight to midnight in the zone a session started in,
 * so work that runs past midnight is split between the two days it touches.
 *
 * Placing an instant on a date needs the zone, and uses Intl.DateTimeFormat, the only
 * zone-aware clock arithmetic available without a time zone database of our own. Once
 * everything is on dates, weeks, months and years are plain date arithmetic with no zone.
 */
import type { DateKey, Instant, RunningPeriod, SessionDay } from './state';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

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
export function wallClock(at: Instant, timeZone: string): WallClock {
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

/** The date that contains `at`, in `timeZone`. */
export function dateKey(at: Instant, timeZone: string): DateKey {
  const c = wallClock(at, timeZone);
  return makeDateKey(c.year, c.month, c.day);
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
  return startOfDay(dayStart + 36 * HOUR, timeZone);
}

/** The first instant of the date `key` in `timeZone`. */
export function startOfDate(key: DateKey, timeZone: string): Instant {
  const { year, month, day } = parseDateKey(key);
  // Noon UTC falls on the date itself or the one either side in every zone (UTC-12 to UTC+14).
  let t = Date.UTC(year, month - 1, day, 12);
  if (dateKey(t, timeZone) < key) t += 24 * HOUR;
  else if (dateKey(t, timeZone) > key) t -= 24 * HOUR;
  return startOfDay(t, timeZone);
}

/** The first instant after the date `key` in `timeZone`: the midnight that closes it. */
export function endOfDate(key: DateKey, timeZone: string): Instant {
  return nextDayStart(startOfDate(key, timeZone), timeZone);
}

/**
 * The instant at `hour` o'clock (0 to 23) on the date `key` in `timeZone`. Counting on from
 * the start of the day is right unless a daylight-saving change falls in between, in which
 * case the wall clock says by how much the guess is out. The hours a change can swallow (one
 * to three in the morning) are never asked for.
 */
export function atHour(key: DateKey, hour: number, timeZone: string): Instant {
  const guess = startOfDate(key, timeZone) + hour * HOUR;
  const c = wallClock(guess, timeZone);
  // A guess that has crossed midnight reads as a small hour, not as one past 23.
  let hoursOut = hour - c.hour;
  if (hoursOut > 12) hoursOut -= 24;
  if (hoursOut < -12) hoursOut += 24;
  return guess + hoursOut * HOUR - c.minute * MINUTE - c.second * 1000;
}

/**
 * The work time of some running periods split by date at midnight in `timeZone`, earliest
 * date first. The date a period starts on always appears, even when the period measured no
 * time (which happens when the clock was set back), so every session has at least one day.
 */
export function sessionDays(periods: readonly RunningPeriod[], timeZone: string): SessionDay[] {
  const byDay = new Map<DateKey, number>();
  for (const period of periods) {
    const startDate = dateKey(period.from, timeZone);
    byDay.set(startDate, byDay.get(startDate) ?? 0);
    let cursor = period.from;
    while (cursor < period.to) {
      const date = dateKey(cursor, timeZone);
      const dayEnd = nextDayStart(startOfDay(cursor, timeZone), timeZone);
      const sliceEnd = Math.min(period.to, dayEnd);
      byDay.set(date, (byDay.get(date) ?? 0) + (sliceEnd - cursor));
      cursor = sliceEnd;
    }
  }
  return [...byDay]
    .map(([date, workTime]) => ({ date, workTime }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

// Date arithmetic. No zone is involved: a date key is treated as a plain calendar date.

export function makeDateKey(year: number, month: number, day: number): DateKey {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function parseDateKey(key: DateKey): { year: number; month: number; day: number } {
  const [year, month, day] = key.split('-').map(Number);
  return { year, month, day };
}

/** Whether `value` is a well-formed date key naming a real date. */
export function isDateKey(value: unknown): value is DateKey {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const { year, month, day } = parseDateKey(value);
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

/** The date `days` days after `key`, or before it when `days` is negative. */
export function addDays(key: DateKey, days: number): DateKey {
  const { year, month, day } = parseDateKey(key);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return makeDateKey(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

/** The day of the week, 0 for Monday through 6 for Sunday. Weeks start on Monday. */
export function weekday(key: DateKey): number {
  const { year, month, day } = parseDateKey(key);
  return (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
}

/** The Monday that starts the week containing `key`. */
export function startOfWeek(key: DateKey): DateKey {
  return addDays(key, -weekday(key));
}

export function startOfMonth(key: DateKey): DateKey {
  const { year, month } = parseDateKey(key);
  return makeDateKey(year, month, 1);
}

export function endOfMonth(key: DateKey): DateKey {
  const { year, month } = parseDateKey(key);
  return makeDateKey(year, month, daysInMonth(year, month));
}

export function startOfYear(key: DateKey): DateKey {
  return makeDateKey(parseDateKey(key).year, 1, 1);
}

export function endOfYear(key: DateKey): DateKey {
  return makeDateKey(parseDateKey(key).year, 12, 31);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}
