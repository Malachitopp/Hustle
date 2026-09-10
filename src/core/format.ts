/** Formats a work time in milliseconds as "2h 14m", or "14m" under an hour. Whole minutes only. */
export function formatWorkTime(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours}h ${rest}m` : `${rest}m`;
}
