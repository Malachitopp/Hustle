/**
 * The notification schedule: what the phone should say, and when, if nothing else happens. A
 * running session keeps running and a paused one auto-ends, so the schedule describes the
 * world as it stands; any action that changes the world changes the schedule, and the phone
 * replaces its pending notifications with the new one. Everything is local. There is no push
 * server, and the core never sends anything itself.
 */
import { AUTO_END_AFTER } from './actions';
import type { CalendarView } from './calendar';
import { addDays, atHour, wallClock } from './days';
import { pausedAt } from './periods';
import type { Instant, State } from './state';
import { streakOn } from './streak';

const HOUR = 60 * 60_000;

/** The pause warning comes this long into a pause: an hour before the auto-end. */
export const PAUSE_WARNING_AFTER = 5 * HOUR;

/** The streak reminder comes at this hour (9pm) of a day with no work yet, in the phone's zone. */
export const STREAK_REMINDER_HOUR = 21;

/** Quiet hours: anything due from 10pm up to 8am, in the phone's zone, is dropped. */
export const QUIET_FROM_HOUR = 22;
export const QUIET_UNTIL_HOUR = 8;

export type NotificationKind = 'pause-warning' | 'auto-end' | 'streak-reminder';

export type ScheduledNotification = {
  kind: NotificationKind;
  /** When the phone should show it. Always after the `now` the schedule was asked for. */
  at: Instant;
  text: string;
};

/**
 * Everything still to come at `now`, in time order: the pause warning and the auto-end notice
 * while a session is paused, and the streak reminder while there is a streak to keep. Each
 * Settings switch takes its notifications off the schedule, and anything due in quiet hours is
 * dropped. Expects a settled state and the calendar at `now`, which `view` provides.
 */
export function notificationSchedule(
  state: State,
  now: Instant,
  timeZone: string,
  calendar: CalendarView,
): ScheduledNotification[] {
  const due: ScheduledNotification[] = [];
  if (state.notificationSwitches.pauseWarnings) due.push(...pauseNotifications(state));
  if (state.notificationSwitches.streakReminder) {
    const reminder = streakReminder(state, calendar, timeZone);
    if (reminder) due.push(reminder);
  }
  return due
    .filter((notification) => notification.at > now && !inQuietHours(notification.at, timeZone))
    .sort((a, b) => a.at - b.at);
}

/** The warning 5 hours into a pause and the notice at the auto-end an hour later. */
function pauseNotifications(state: State): ScheduledNotification[] {
  const current = state.current;
  if (!current || current.runningSince !== null) return [];
  const paused = pausedAt(current);
  return [
    {
      kind: 'pause-warning',
      at: paused + PAUSE_WARNING_AFTER,
      text: 'Your session ends in 1 hour and your rose will die. Resume to save it.',
    },
    {
      kind: 'auto-end',
      at: paused + AUTO_END_AFTER,
      text: 'Your session ended automatically. Your rose has died.',
    },
  ];
}

/**
 * The reminder at 9pm on a day with no work yet, while there is a streak to keep. If nothing
 * else happens there is no more work, so the only day that can qualify is today, or tomorrow
 * once today has some work. A running session is work, and if nothing else happens it runs on
 * through midnight, so there is nothing to remind about; pausing or ending it brings the
 * reminder back.
 */
function streakReminder(state: State, calendar: CalendarView, timeZone: string): ScheduledNotification | null {
  if (state.current && state.current.runningSince !== null) return null;
  const today = calendar.today;
  const workedToday = (calendar.days[today]?.workTime ?? 0) > 0;
  const date = workedToday ? addDays(today, 1) : today;
  const streak = streakOn(calendar.days, date);
  if (streak === 0) return null;
  return {
    kind: 'streak-reminder',
    at: atHour(date, STREAK_REMINDER_HOUR, timeZone),
    text: `Your ${streak}-day streak ends at midnight. Start a session to keep it.`,
  };
}

function inQuietHours(at: Instant, timeZone: string): boolean {
  const { hour } = wallClock(at, timeZone);
  return hour >= QUIET_FROM_HOUR || hour < QUIET_UNTIL_HOUR;
}
