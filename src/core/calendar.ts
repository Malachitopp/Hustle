/**
 * The calendar: work time on every date, the sessions on each date, and the totals for the
 * week, month and year that contain today. Ended sessions carry their split by date already;
 * the session in progress is split live at `now`.
 */
import { closePeriods } from './actions';
import {
  addDays,
  dateKey,
  daysInMonth,
  endOfMonth,
  endOfYear,
  makeDateKey,
  parseDateKey,
  sessionDays,
  startOfMonth,
  startOfWeek,
  startOfYear,
  weekday,
} from './days';
import { formatMonth } from './format';
import type { CurrentSession, DateKey, EndedSession, Instant, SessionDay, State } from './state';

/** The spans the totals toggle offers. */
export type Span = 'week' | 'month' | 'year';

/** A session as listed on one date of the calendar. */
export type DaySessionView = {
  id: string;
  /** The zone the session started in. Its clock times are shown in this zone. */
  timeZone: string;
  startedAt: Instant;
  /** Null while the session is in progress. */
  endedAt: Instant | null;
  status: 'ended' | 'running' | 'paused';
  /** The session's work time on this date only. Milliseconds. */
  workTime: number;
};

export type DayView = {
  date: DateKey;
  /** Work time on this date across every session, including one in progress. Milliseconds. */
  workTime: number;
  /** The sessions that ran on this date, earliest first. */
  sessions: DaySessionView[];
};

export type CalendarView = {
  /** Today's date in the phone's zone. */
  today: DateKey;
  /** The earliest date with a session, or today. There is nothing to browse before its month. */
  firstDate: DateKey;
  /** Every date with a session, keyed by date. */
  days: Partial<Record<DateKey, DayView>>;
  /** Work time over the week (Monday to Sunday), month and year that contain today. Milliseconds. */
  totals: Record<Span, number>;
};

export function calendarView(state: State, now: Instant, timeZone: string): CalendarView {
  const today = dateKey(now, timeZone);
  const days: CalendarView['days'] = {};

  for (const session of state.record) {
    place(days, endedRow(session), session.days);
  }
  if (state.current) {
    const current = state.current;
    place(days, currentRow(current), sessionDays(closePeriods(current, now), current.timeZone));
  }

  const dates = Object.keys(days).sort();
  const weekStart = startOfWeek(today);
  return {
    today,
    firstDate: dates[0] ?? today,
    days,
    totals: {
      week: total(days, weekStart, addDays(weekStart, 6)),
      month: total(days, startOfMonth(today), endOfMonth(today)),
      year: total(days, startOfYear(today), endOfYear(today)),
    },
  };
}

type Row = Omit<DaySessionView, 'workTime'>;

function endedRow(session: EndedSession): Row {
  return {
    id: session.id,
    timeZone: session.timeZone,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    status: 'ended',
  };
}

function currentRow(current: CurrentSession): Row {
  return {
    id: current.id,
    timeZone: current.timeZone,
    startedAt: current.startedAt,
    endedAt: null,
    status: current.runningSince === null ? 'paused' : 'running',
  };
}

/** Adds a session to each date it ran on. */
function place(days: CalendarView['days'], row: Row, shares: SessionDay[]): void {
  for (const { date, workTime } of shares) {
    const day = days[date] ?? { date, workTime: 0, sessions: [] };
    day.workTime += workTime;
    day.sessions.push({ ...row, workTime });
    days[date] = day;
  }
}

/** Work time on every date from `from` to `to`, inclusive. */
function total(days: CalendarView['days'], from: DateKey, to: DateKey): number {
  let sum = 0;
  for (const day of Object.values(days)) {
    if (day && day.date >= from && day.date <= to) sum += day.workTime;
  }
  return sum;
}

/** One month laid out for the calendar grid. */
export type MonthView = {
  /** The month's first date, which identifies the month. */
  first: DateKey;
  /** e.g. "September 2026". */
  title: string;
  /** The month's dates in rows of seven, Monday to Sunday, with null where a row leaves the month. */
  weeks: (DateKey | null)[][];
  /** The first dates of the months either side, for browsing. */
  previous: DateKey;
  next: DateKey;
};

/** The month that contains `date`, laid out for the grid. */
export function monthOf(date: DateKey): MonthView {
  const first = startOfMonth(date);
  const { year, month } = parseDateKey(first);
  const count = daysInMonth(year, month);

  const cells: (DateKey | null)[] = Array<DateKey | null>(weekday(first)).fill(null);
  for (let day = 1; day <= count; day++) cells.push(makeDateKey(year, month, day));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (DateKey | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return {
    first,
    title: formatMonth(first),
    weeks,
    previous: startOfMonth(addDays(first, -1)),
    next: addDays(first, count),
  };
}
