import { isDateKey, sessionDays } from './days';
import type { CurrentSession, DateKey, EndedSession, Goal, Instant, RunningPeriod, State } from './state';

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
  | { type: 'end'; at: Instant }
  | {
      type: 'create-goal';
      at: Instant;
      /** Generated on the phone. */
      goalId: string;
      name: string;
      /** The work time to reach, in milliseconds. */
      target: number;
      /** The last date that counts. */
      deadline: DateKey;
      /** The phone's IANA time zone when the goal was created. */
      timeZone: string;
    }
  /** Switches a goal on (active) or off (dormant). */
  | { type: 'switch-goal'; at: Instant; goalId: string; active: boolean }
  /** Records that the user has seen the celebration for an achieved goal. */
  | { type: 'celebrate-goal'; at: Instant; goalId: string }
  /** Chooses the display name at first launch, or changes it in Settings. */
  | { type: 'set-display-name'; at: Instant; displayName: string };

/**
 * Applies an action to the stored history and returns the new history. Anything that happened
 * by itself before the action (an auto-end) is applied first. The input is never mutated. An
 * action that makes no sense in the current state (starting while a session is in progress,
 * pausing while paused, ending with none, switching a goal to where it already is, choosing an
 * empty display name) changes nothing.
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
    case 'create-goal':
      return createGoal(settled, action);
    case 'switch-goal':
      return switchGoal(settled, action.at, action.goalId, action.active);
    case 'celebrate-goal':
      return celebrateGoal(settled, action.at, action.goalId);
    case 'set-display-name':
      return setDisplayName(settled, action.displayName);
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

/** Every running period there has ever been, oldest first, with the open one closed at `now`. */
export function allPeriods(state: State, now: Instant): RunningPeriod[] {
  const periods = state.record.flatMap((session) => session.periods);
  return state.current ? [...periods, ...closePeriods(state.current, now)] : periods;
}

/** Whether a goal's switch is on: its last flick, or on since creation if it was never flicked. */
export function isSwitchedOn(goal: Goal): boolean {
  const last = goal.switches[goal.switches.length - 1];
  return last ? last.active : true;
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
  const periods = closePeriods(current, at);
  const ended: EndedSession = {
    id: current.id,
    timeZone: current.timeZone,
    startedAt: current.startedAt,
    endedAt: Math.max(at, current.startedAt),
    periods,
    // The split at midnight happens once, here, and stays with the session.
    days: sessionDays(periods, current.timeZone),
  };
  return { ...state, current: null, record: [...state.record, ended] };
}

type CreateGoal = Extract<Action, { type: 'create-goal' }>;

function createGoal(state: State, action: CreateGoal): State {
  const name = action.name.trim();
  if (name === '' || !(action.target > 0) || !isDateKey(action.deadline)) return state;
  // A retried action must not create the goal twice.
  if (state.goals.some((goal) => goal.id === action.goalId)) return state;
  const goal: Goal = {
    id: action.goalId,
    name,
    target: action.target,
    deadline: action.deadline,
    timeZone: action.timeZone,
    createdAt: action.at,
    switches: [],
    celebratedAt: null,
  };
  return { ...state, goals: [...state.goals, goal] };
}

function switchGoal(state: State, at: Instant, goalId: string, active: boolean): State {
  const goal = state.goals.find((candidate) => candidate.id === goalId);
  if (!goal || isSwitchedOn(goal) === active) return state;
  // Clocks can be set backwards; a flick never comes before the one before it.
  const last = goal.switches[goal.switches.length - 1];
  const flickAt = Math.max(at, last ? last.at : goal.createdAt);
  return replaceGoal(state, { ...goal, switches: [...goal.switches, { at: flickAt, active }] });
}

function celebrateGoal(state: State, at: Instant, goalId: string): State {
  const goal = state.goals.find((candidate) => candidate.id === goalId);
  if (!goal || goal.celebratedAt !== null) return state;
  return replaceGoal(state, { ...goal, celebratedAt: at });
}

function replaceGoal(state: State, goal: Goal): State {
  return { ...state, goals: state.goals.map((existing) => (existing.id === goal.id ? goal : existing)) };
}

/** The name is kept trimmed and never empty, so the header never addresses nobody. */
function setDisplayName(state: State, displayName: string): State {
  const name = displayName.trim();
  if (name === '' || name === state.displayName) return state;
  return { ...state, displayName: name };
}
