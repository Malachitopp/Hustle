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

/**
 * The three preferences that are backed up with the account, so a new phone picks them up along
 * with the record and the goals: what the app calls the user, the plant's petal colour and the
 * notification switches. They live as separate fields of the state; this is how they travel.
 */
export type Settings = {
  displayName: string | null;
  petalColour: string | null;
  notificationSwitches: NotificationSwitches;
};

/** A way of signing in: with Apple or with Google. Either leads to the same account behaviour. */
export type Provider = 'apple' | 'google';

/** Who the user is signed in as. A guest has no account: their record lives only on the phone. */
export type Account = {
  /** The user's id in Supabase Auth, which is what their rows in the database belong to. */
  userId: string;
  /** How they signed in. */
  provider: Provider;
  /**
   * Whether the account's record, goals and settings have been restored to this phone since this
   * sign-in: false from the sign-in until the phone has downloaded them and merged them in, so a
   * new phone or a fresh install picks up where the account left off.
   */
  restored: boolean;
};

export type State = {
  /**
   * What the app calls the user in its messages, chosen at first launch and changeable in
   * Settings. Null until it has been chosen, which is what makes the app show onboarding.
   */
  displayName: string | null;
  /**
   * The name of the petal colour the plant is drawn in, from the app's own list of colours, or
   * null for the default. The core keeps it only so that it is backed up and restored with the
   * other settings: it never checks the name, so one from a newer version of the app restores
   * harmlessly, and the plant falls back to its default colour when it is drawn.
   */
  petalColour: string | null;
  current: CurrentSession | null;
  /**
   * The record: every ended session, oldest first by start. Sessions end here on this phone, and
   * arrive here from the account when it is restored, so two phones can each hold the whole record.
   */
  record: EndedSession[];
  /** Every goal, oldest first by creation. */
  goals: Goal[];
  notificationSwitches: NotificationSwitches;
  /** Who is signed in, or null for a guest. */
  account: Account | null;
  /**
   * The upload queue: the ids of ended sessions the account has not yet confirmed it stored,
   * in the order they ended. Every session joins it when it ends, guest or not, and leaves it
   * when its upload is confirmed. Which of them may upload right now is `view`'s business.
   */
  pendingUploads: string[];
  /**
   * The goals changed on this phone (created, edited, switched or celebrated) that the account
   * has not yet confirmed it holds exactly as they are now, in the order they first changed. A
   * goal joins when it changes, guest or not, and leaves when the account confirms the very
   * details it holds, so a goal changed again while its upload was on its way stays.
   */
  pendingGoalUploads: string[];
  /** The ids of goals deleted on this phone that the account may still hold, oldest first. */
  pendingGoalDeletions: string[];
  /** Whether the settings have changed since the account last confirmed it holds them as they are. */
  pendingSettingsUpload: boolean;
  /**
   * When Save your progress was offered, or null until it has been. It is offered once, after
   * the session-complete pop-up, to a guest whose record holds a session; whatever they choose,
   * it never comes back. Whether it is due now is `view`'s business.
   */
  saveProgressOfferedAt: Instant | null;
};

export const initialState: State = {
  displayName: null,
  petalColour: null,
  current: null,
  record: [],
  goals: [],
  notificationSwitches: { pauseWarnings: true, streakReminder: true },
  account: null,
  pendingUploads: [],
  pendingGoalUploads: [],
  pendingGoalDeletions: [],
  pendingSettingsUpload: false,
  saveProgressOfferedAt: null,
};
