/**
 * The streak: how many days in a row the user has done any work, however little. It is worked
 * out from the calendar's day totals and never stored. Today counts once it has any work; until
 * then a streak that ran up to yesterday still stands. It breaks once a whole day has passed
 * with no work.
 */
import type { CalendarView } from './calendar';
import { addDays } from './days';
import type { DateKey } from './state';

/** The number of days in a row with work, ending today or yesterday. 0 when there is no streak. */
export function streakOn(days: CalendarView['days'], today: DateKey): number {
  const worked = (date: DateKey) => (days[date]?.workTime ?? 0) > 0;
  let date = worked(today) ? today : addDays(today, -1);
  let count = 0;
  while (worked(date)) {
    count++;
    date = addDays(date, -1);
  }
  return count;
}
