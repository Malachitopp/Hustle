import { wallClock } from './days';
import type { Instant } from './state';

/** Formats a work time in milliseconds as "2h 14m", or "14m" under an hour. Whole minutes only. */
export function formatWorkTime(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours}h ${rest}m` : `${rest}m`;
}

/** Formats an instant as a time of day in `timeZone`, e.g. "11:40pm" or "12:05am". */
export function formatClockTime(at: Instant, timeZone: string): string {
  const { hour, minute } = wallClock(at, timeZone);
  const twelveHour = hour % 12 === 0 ? 12 : hour % 12;
  const suffix = hour < 12 ? 'am' : 'pm';
  return `${twelveHour}:${String(minute).padStart(2, '0')}${suffix}`;
}
