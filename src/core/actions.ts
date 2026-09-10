import type { CurrentSession, EndedSession, Instant, State } from './state';

/**
 * Everything that can change the stored history. Each action carries the instant it happened
 * (`at`), because the core never reads the clock.
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
  | { type: 'end'; at: Instant };

/**
 * Applies an action to the stored history and returns the new history. The input is never
 * mutated. An action that makes no sense in the current state (starting while a session is
 * already in progress, ending with none) returns the same state object unchanged.
 */
export function apply(state: State, action: Action): State {
  switch (action.type) {
    case 'start':
      return start(state, action.at, action.sessionId, action.timeZone);
    case 'end':
      return end(state, action.at);
  }
}

function start(state: State, at: Instant, id: string, timeZone: string): State {
  if (state.current) return state;
  const current: CurrentSession = { id, timeZone, startedAt: at, periods: [], runningSince: at };
  return { ...state, current };
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

/** The session's running periods with the open one, if any, closed at `at`. */
export function closePeriods(current: CurrentSession, at: Instant): EndedSession['periods'] {
  if (current.runningSince === null) return current.periods;
  // Clocks can be set backwards; a period never runs for a negative time.
  return [...current.periods, { from: current.runningSince, to: Math.max(at, current.runningSince) }];
}
