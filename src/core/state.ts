/**
 * The core's stored history. Plain data, so the phone can save it as JSON.
 * Everything the screens show is derived from this by `view`; nothing derived is stored.
 */

/** Milliseconds since the Unix epoch. The core never reads the clock: every instant is passed in. */
export type Instant = number;

/** A stretch of a session during which the timer was running. Paused time falls between periods. */
export type RunningPeriod = {
  from: Instant;
  to: Instant;
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

export type State = {
  current: CurrentSession | null;
  /** The record: every ended session, oldest first. */
  record: EndedSession[];
};

export const initialState: State = {
  current: null,
  record: [],
};
