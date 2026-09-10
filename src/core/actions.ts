import type { CurrentSession, EndedSession, Instant, State } from './state';

/** A session left paused this long ends by itself, as if the user had pressed End. */
export const AUTO_END_AFTER = 6 * 60 * 60_000;

/**
 * Everything the user can do to the stored history. Each action carries the instant it
 * happened (`at`), because the core never reads the clock.
 */
export type Action =
  | {
      type: 'start';
      at: Instant;
      /** Generated on the phone. */
      sessionId: string;
      /** The phone's IANA time zone when the session started. */
      timeZone: string;
    }
  | { type: 'pause'; at: Instant }
  | { type: 'resume'; at: Instant }
  | { type: 'end'; at: Instant };

/**
 * Applies an action to the stored history and returns the new history. Anything that happened
 * by itself before the action (an auto-end) is applied first. The input is never mutated. An
 * action that makes no sense in the current state (starting while a session is in progress,
 * pausing while paused, ending with none) changes nothing.
 */
export function apply(state: State, action: Action): State {
  const settled = settle(state, action.at);
  switch (action.type) {
    case 'start':
      return start(settled, action.at, action.sessionId, action.timeZone);
    case 'pause':
      return pause(settled, action.at);
    case 'resume':
      return resume(settled, action.at);
    case 'end':
      return end(settled, action.at);
  }
}

/**
 * Applies what happens by itself with the passing of time, as of `now`: a session paused for
 * 6 hours ends at the pause time plus 6 hours. Returns the same object when nothing happened.
 */
export function settle(state: State, now: Instant): State {
  const current = state.current;
  if (!current || current.runningSince !== null) return state;
  const autoEndsAt = pausedAt(current) + AUTO_END_AFTER;
  return now < autoEndsAt ? state : end(state, autoEndsAt);
}

/** When a paused session was paused: the end of its last running period. */
export function pausedAt(current: CurrentSession): Instant {
  const last = current.periods[current.periods.length - 1];
  return last ? last.to : current.startedAt;
}

/** The session's running periods with the open one, if any, closed at `at`. */
export function closePeriods(current: CurrentSession, at: Instant): EndedSession['periods'] {
  if (current.runningSince === null) return current.periods;
  // Clocks can be set backwards; a period never runs for a negative time.
  return [...current.periods, { from: current.runningSince, to: Math.max(at, current.runningSince) }];
}

function start(state: State, at: Instant, id: string, timeZone: string): State {
  if (state.current) return state;
  const current: CurrentSession = { id, timeZone, startedAt: at, periods: [], runningSince: at };
  return { ...state, current };
}

function pause(state: State, at: Instant): State {
  const current = state.current;
  if (!current || current.runningSince === null) return state;
  return { ...state, current: { ...current, periods: closePeriods(current, at), runningSince: null } };
}

function resume(state: State, at: Instant): State {
  const current = state.current;
  if (!current || current.runningSince !== null) return state;
  // Clocks can be set backwards; a running period never starts before the pause it follows.
  return { ...state, current: { ...current, runningSince: Math.max(at, pausedAt(current)) } };
}

function end(state: State, at: Instant): State {
  const current = state.current;
  if (!current) return state;
  const ended: EndedSession = {
    id: current.id,
    timeZone: current.timeZone,
    startedAt: current.startedAt,
    endedAt: Math.max(at, current.startedAt),
    periods: closePeriods(current, at),
  };
  return { ...state, current: null, record: [...state.record, ended] };
}
