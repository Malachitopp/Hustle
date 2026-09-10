import { isDateKey, sessionDays } from './days';
import { isAchieved, isSwitchedOn } from './goals';
import { allPeriods, closePeriods, pausedAt } from './periods';
import type {
  Account,
  CurrentSession,
  DateKey,
  EndedSession,
  Goal,
  Instant,
  NotificationSwitches,
  State,
} from './state';

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
  /**
   * Changes a goal's name, target and deadline. Everything else about the goal (its creation
   * time, its switches, the zone its deadline ends in) stays as it was.
   */
  | {
      type: 'edit-goal';
      at: Instant;
      goalId: string;
      name: string;
      /** The work time to reach, in milliseconds. */
      target: number;
      /** The last date that counts. */
      deadline: DateKey;
    }
  /** Removes a goal for good. The work that counted toward it stays in the record. */
  | { type: 'delete-goal'; at: Instant; goalId: string }
  /** Switches a goal on (active) or off (dormant). */
  | { type: 'switch-goal'; at: Instant; goalId: string; active: boolean }
  /** Records that the user has seen the celebration for an achieved goal. */
  | { type: 'celebrate-goal'; at: Instant; goalId: string }
  /** Chooses the display name at first launch, or changes it in Settings. */
  | { type: 'set-display-name'; at: Instant; displayName: string }
  /**
   * Turns the Pause warnings or Streak reminder switch on or off in Settings. A switch not
   * named stays as it is.
   */
  | { type: 'set-notification-switches'; at: Instant; switches: Partial<NotificationSwitches> }
  /**
   * The user has signed in. From now on their ended sessions upload, starting with any that
   * waited on the phone while they were a guest.
   */
  | { type: 'sign-in'; at: Instant; userId: string; provider: Account['provider'] }
  /**
   * The user's sign-in is over, because the server no longer accepts it. They are a guest again
   * and their sessions wait on the phone. (Signing out on purpose, which also clears the phone,
   * is a later ticket.)
   */
  | { type: 'sign-out'; at: Instant }
  /** The account has confirmed that it stored these sessions, so they leave the upload queue. */
  | { type: 'confirm-uploaded'; at: Instant; sessionIds: string[] };

/**
 * Applies an action to the stored history and returns the new history. Anything that happened
 * by itself before the action (an auto-end) is applied first. The input is never mutated. An
 * action that makes no sense in the current state (starting while a session is in progress,
 * pausing while paused, ending with none, switching a goal to where it already is, editing a
 * goal to what it already is, deleting a goal that does not exist, choosing an empty display
 * name, setting a notification switch to where it already is, signing in as the account already
 * signed in, signing out as a guest, confirming an upload the queue does not hold) changes
 * nothing.
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
    case 'edit-goal':
      return editGoal(settled, action);
    case 'delete-goal':
      return deleteGoal(settled, action.goalId);
    case 'switch-goal':
      return switchGoal(settled, action.at, action.goalId, action.active);
    case 'celebrate-goal':
      return celebrateGoal(settled, action.at, action.goalId);
    case 'set-display-name':
      return setDisplayName(settled, action.displayName);
    case 'set-notification-switches':
      return setNotificationSwitches(settled, action.switches);
    case 'sign-in':
      return signIn(settled, { userId: action.userId, provider: action.provider });
    case 'sign-out':
      return signOut(settled);
    case 'confirm-uploaded':
      return confirmUploaded(settled, action.sessionIds);
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
  return {
    ...state,
    current: null,
    record: [...state.record, ended],
    // Every ended session waits to upload, whether or not anyone is signed in yet.
    pendingUploads: [...state.pendingUploads, ended.id],
  };
}

/** A goal's name, target and deadline, as the user typed them. */
type GoalDetails = { name: string; target: number; deadline: DateKey };

/** The details with the name trimmed, or null if any of them could not make a goal. */
function validDetails(details: GoalDetails): GoalDetails | null {
  const name = details.name.trim();
  if (name === '' || !(details.target > 0) || !isDateKey(details.deadline)) return null;
  return { name, target: details.target, deadline: details.deadline };
}

type CreateGoal = Extract<Action, { type: 'create-goal' }>;

function createGoal(state: State, action: CreateGoal): State {
  const details = validDetails(action);
  if (!details) return state;
  // A retried action must not create the goal twice.
  if (state.goals.some((goal) => goal.id === action.goalId)) return state;
  const goal: Goal = {
    id: action.goalId,
    ...details,
    timeZone: action.timeZone,
    createdAt: action.at,
    switches: [],
    celebratedAt: null,
  };
  return { ...state, goals: [...state.goals, goal] };
}

type EditGoal = Extract<Action, { type: 'edit-goal' }>;

function editGoal(state: State, action: EditGoal): State {
  const goal = state.goals.find((candidate) => candidate.id === action.goalId);
  const details = validDetails(action);
  if (!goal || !details) return state;
  if (details.name === goal.name && details.target === goal.target && details.deadline === goal.deadline) {
    return state;
  }
  const edited: Goal = { ...goal, ...details };
  // A celebration was for the target as it stood. If the edit takes the goal back below its
  // target, reaching the new one deserves a celebration of its own.
  if (edited.celebratedAt !== null && !isAchieved(edited, allPeriods(state, action.at))) {
    edited.celebratedAt = null;
  }
  return replaceGoal(state, edited);
}

function deleteGoal(state: State, goalId: string): State {
  const goals = state.goals.filter((goal) => goal.id !== goalId);
  return goals.length === state.goals.length ? state : { ...state, goals };
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

function setNotificationSwitches(state: State, changes: Partial<NotificationSwitches>): State {
  const current = state.notificationSwitches;
  const next: NotificationSwitches = {
    pauseWarnings: changes.pauseWarnings ?? current.pauseWarnings,
    streakReminder: changes.streakReminder ?? current.streakReminder,
  };
  if (next.pauseWarnings === current.pauseWarnings && next.streakReminder === current.streakReminder) {
    return state;
  }
  return { ...state, notificationSwitches: next };
}

/** The upload queue is left alone: sessions that waited as a guest are now the first to upload. */
function signIn(state: State, account: Account): State {
  const current = state.account;
  if (current && current.userId === account.userId && current.provider === account.provider) return state;
  return { ...state, account };
}

function signOut(state: State): State {
  return state.account === null ? state : { ...state, account: null };
}

/**
 * Takes the confirmed sessions off the upload queue. Confirming a session the queue does not
 * hold (one confirmed already, or one the phone never had) changes nothing, so a retried
 * confirmation is harmless.
 */
function confirmUploaded(state: State, sessionIds: readonly string[]): State {
  const confirmed = new Set(sessionIds);
  const pendingUploads = state.pendingUploads.filter((id) => !confirmed.has(id));
  return pendingUploads.length === state.pendingUploads.length ? state : { ...state, pendingUploads };
}
