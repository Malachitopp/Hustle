import { parseDateKey, wallClock, weekday } from './days';
import type { DateKey, Instant } from './state';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** Formats a work time in milliseconds as "2h 14m", or "14m" under an hour. Whole minutes only. */
export function formatWorkTime(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours}h ${rest}m` : `${rest}m`;
}

/** Formats a work time as briefly as possible, for a calendar cell: "45m", "2h" or "2h 14m". */
export function formatWorkTimeShort(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/** Formats an instant as a time of day in `timeZone`, e.g. "11:40pm" or "12:05am". */
export function formatClockTime(at: Instant, timeZone: string): string {
  const { hour, minute } = wallClock(at, timeZone);
  const twelveHour = hour % 12 === 0 ? 12 : hour % 12;
  const suffix = hour < 12 ? 'am' : 'pm';
  return `${twelveHour}:${String(minute).padStart(2, '0')}${suffix}`;
}

/** Formats a date as "Thursday 10 September". */
export function formatDate(date: DateKey): string {
  const { day, month } = parseDateKey(date);
  return `${WEEKDAYS[weekday(date)]} ${day} ${MONTHS[month - 1]}`;
}

/** Formats the month a date falls in as "September 2026". */
export function formatMonth(date: DateKey): string {
  const { year, month } = parseDateKey(date);
  return `${MONTHS[month - 1]} ${year}`;
}
