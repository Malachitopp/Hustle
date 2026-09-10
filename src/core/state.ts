/**
 * The core's stored history. Plain data, so the phone can save it as JSON.
 * Everything the screens show is derived from this by `view`; nothing derived is stored.
 */

/** Milliseconds since the Unix epoch. The core never reads the clock: every instant is passed in. */
export type Instant = number;

/** A calendar date as "YYYY-MM-DD". Sorts correctly as a string. */
export type DateKey = string;

/** A stretch of a session during which the timer was running. Paused time falls between periods. */
export type RunningPeriod = {
  from: Instant;
  to: Instant;
};

/** A session's work time on one date, in the zone the session started in. */
export type SessionDay = {
  date: DateKey;
  /** Milliseconds of work on this date. */
  workTime: number;
};

/** A session that has ended and entered the record. Never edited or deleted. */
export type EndedSession = {
  /** Generated on the phone when the session starts. */
  id: string;
  /** IANA time zone the session started in, e.g. "Europe/London". Days are split in this zone. */
  timeZone: string;
  startedAt: Instant;
  endedAt: Instant;
  /** The session's running periods, in order. Work time is their total length. */
  periods: RunningPeriod[];
  /**
   * The work time split by date at midnight in `timeZone`, worked out once when the session
   * ended. Every date the session ran on appears, earliest first.
   */
  days: SessionDay[];
};

/** The session in progress. It exists only on the phone until it ends. */
export type CurrentSession = {
  id: string;
  timeZone: string;
  startedAt: Instant;
  /** Running periods that have already closed (each one ends at a pause). */
  periods: RunningPeriod[];
  /** When the open running period began, or null while the session is paused. */
  runningSince: Instant | null;
};

/** One flick of a goal's switch: on (active) or off (dormant). */
export type GoalSwitch = {
  at: Instant;
  active: boolean;
};

/**
 * A goal: an amount of work time to reach by a deadline. Only work done while the goal is
 * active counts toward it. Its work time and status are never stored; `view` replays them.
 */
export type Goal = {
  /** Generated on the phone when the goal is created. */
  id: string;
  name: string;
  /** The work time to reach, in milliseconds. */
  target: number;
  /** The last date that counts. The goal ends at the midnight that closes this date. */
  deadline: DateKey;
  /** IANA time zone the goal was created in. The deadline date ends at midnight in this zone. */
  timeZone: string;
  createdAt: Instant;
  /** Every time the goal was switched off or on, in order. A new goal is active from creation. */
  switches: GoalSwitch[];
  /** When the user saw the celebration for reaching the target, or null until they have. */
  celebratedAt: Instant | null;
};

/**
 * The two Settings switches that decide which notifications go on the schedule. Both start on.
 * Whether the phone is allowed to show notifications at all is the phone's own permission,
 * which the core never sees: the app works the same either way.
 */
export type NotificationSwitches = {
  /** The warning 5 hours into a pause and the notice when a paused session auto-ends. */
  pauseWarnings: boolean;
  /** The reminder at 9pm on a day with no work yet, while there is a streak to keep. */
  streakReminder: boolean;
};

export type State = {
  /**
   * What the app calls the user in its messages, chosen at first launch and changeable in
   * Settings. Null until it has been chosen, which is what makes the app show onboarding.
   */
  displayName: string | null;
  current: CurrentSession | null;
  /** The record: every ended session, oldest first. */
  record: EndedSession[];
  /** Every goal, oldest first. */
  goals: Goal[];
  notificationSwitches: NotificationSwitches;
};

export const initialState: State = {
  displayName: null,
  current: null,
  record: [],
  goals: [],
  notificationSwitches: { pauseWarnings: true, streakReminder: true },
};
