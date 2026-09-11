import { sameGoal, sameSettings, settingsOf, sortGoals } from './backup';
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
  Settings,
  State,
} from './state';

/** A session left paused this long ends by itself, as if the user had pressed End. */
export const AUTO_END_AFTER = 6 * 60 * 60_000;

/** Everything the account holds, as it comes down to the phone. */
export type AccountData = {
  /** Every session in the account's record. */
  sessions: EndedSession[];
  /** Every goal the account holds, deleted ones left out. */
  goals: Goal[];
  /** The ids of goals deleted on the account, which a phone may still show. */
  deletedGoalIds: string[];
  /** The account's settings, or null while it has none because nothing has been uploaded yet. */
  settings: Settings | null;
};

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
  /** Chooses the plant's petal colour in Settings, by its name in the app's list of colours. */
  | { type: 'set-petal-colour'; at: Instant; petalColour: string }
  /**
   * Turns the Pause warnings or Streak reminder switch on or off in Settings. A switch not
   * named stays as it is.
   */
  | { type: 'set-notification-switches'; at: Instant; switches: Partial<NotificationSwitches> }
  /**
   * The user has signed in, with Apple or with Google. From now on their ended sessions upload,
   * starting with any that waited on the phone while they were a guest, and so do their goals
   * and settings once the account's own have been restored.
   */
  | { type: 'sign-in'; at: Instant; userId: string; provider: Account['provider'] }
  /** Save your progress has been offered, so it never is again. */
  | { type: 'offer-save-progress'; at: Instant }
  /**
   * The user's sign-in is over, because the server no longer accepts it. They are a guest again
   * and their changes wait on the phone. (Signing out on purpose, which also clears the phone,
   * is a later ticket.)
   */
  | { type: 'sign-out'; at: Instant }
  /** The account has confirmed that it stored these sessions, so they leave the upload queue. */
  | { type: 'confirm-uploaded'; at: Instant; sessionIds: string[] }
  /**
   * The account has confirmed it holds these goals, exactly as sent. One the phone has changed
   * again since stays on the queue: the account holds it as it was, not as it is.
   */
  | { type: 'confirm-goals-uploaded'; at: Instant; goals: Goal[] }
  /** The account has confirmed it no longer holds these goals. */
  | { type: 'confirm-goals-deleted'; at: Instant; goalIds: string[] }
  /** The account has confirmed it holds these settings, exactly as sent. */
  | { type: 'confirm-settings-uploaded'; at: Instant; settings: Settings }
  /**
   * Everything the account holds has been downloaded. The sessions join the record as they do
   * for `add-downloaded` and the goals as they do for `add-downloaded-goals`. The account's
   * settings replace the phone's, so on a new phone the name chosen at first launch gives way
   * to the one the account knows; an account with no settings yet leaves the phone's alone, to
   * upload. The phone then no longer needs a restore for this sign-in. Ignored unless `userId`
   * is the account signed in now, so a download that outlives its sign-in changes nothing.
   */
  | ({ type: 'restore'; at: Instant; userId: string } & AccountData)
  /**
   * Some of the account's sessions have been downloaded (a month of them, say). One the phone
   * already has, by id, changes nothing; the rest join the record. None of them joins the upload
   * queue, because the account has them already, and one the phone was still waiting to upload
   * leaves the queue: the download proves the account stored it. Ignored unless `userId` is the
   * account signed in now.
   */
  | { type: 'add-downloaded'; at: Instant; userId: string; sessions: EndedSession[] }
  /**
   * The account's goals have been downloaded (on opening Goals, say). A goal the phone lacks
   * joins; one the phone has takes the account's details; one deleted on the account goes. But a
   * goal with a change here still to upload stands as it is, whatever the account holds, and a
   * goal deleted here is neither brought back nor deleted again. None of them joins the upload
   * queue, because the account has them already. Ignored unless `userId` is the account signed
   * in now.
   */
  | { type: 'add-downloaded-goals'; at: Instant; userId: string; goals: Goal[]; deletedGoalIds: string[] };

/**
 * Applies an action to the stored history and returns the new history. Anything that happened
 * by itself before the action (an auto-end) is applied first. The input is never mutated. An
 * action that makes no sense in the current state (starting while a session is in progress,
 * pausing while paused, ending with none, switching a goal to where it already is, editing a
 * goal to what it already is, deleting a goal that does not exist, choosing an empty display
 * name or petal colour, setting a notification switch to where it already is, signing in as the
 * account already signed in, signing out as a guest, confirming an upload the queue does not
 * hold or that has changed since, adding downloaded sessions or goals the phone already has or
 * that belong to another account, offering Save your progress a second time) changes nothing.
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
    case 'set-petal-colour':
      return setPetalColour(settled, action.petalColour);
    case 'set-notification-switches':
      return setNotificationSwitches(settled, action.switches);
    case 'sign-in':
      return signIn(settled, { userId: action.userId, provider: action.provider });
    case 'offer-save-progress':
      return offerSaveProgress(settled, action.at);
    case 'sign-out':
      return signOut(settled);
    case 'confirm-uploaded':
      return confirmUploaded(settled, action.sessionIds);
    case 'confirm-goals-uploaded':
      return confirmGoalsUploaded(settled, action.goals);
    case 'confirm-goals-deleted':
      return confirmGoalsDeleted(settled, action.goalIds);
    case 'confirm-settings-uploaded':
      return confirmSettingsUploaded(settled, action.settings);
    case 'restore':
      return restore(settled, action.userId, action);
    case 'add-downloaded':
      return addDownloaded(settled, action.userId, action.sessions);
    case 'add-downloaded-goals':
      return addDownloadedGoals(settled, action.userId, action.goals, action.deletedGoalIds);
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
    record: addToRecord(state.record, [ended]),
    // Every ended session waits to upload, whether or not anyone is signed in yet.
    pendingUploads: [...state.pendingUploads, ended.id],
  };
}

/**
 * The record with `sessions` added, kept oldest first by start. On one phone a session always
 * starts after the last one ended, so this is a plain append; sessions restored from another
 * phone can slot in anywhere.
 */
function addToRecord(record: readonly EndedSession[], sessions: readonly EndedSession[]): EndedSession[] {
  return [...record, ...sessions].sort(
    (a, b) => a.startedAt - b.startedAt || a.endedAt - b.endedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
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
  return {
    ...state,
    goals: sortGoals([...state.goals, goal]),
    // Every changed goal waits to upload, whether or not anyone is signed in yet.
    pendingGoalUploads: queued(state.pendingGoalUploads, goal.id),
  };
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
  if (goals.length === state.goals.length) return state;
  return {
    ...state,
    goals,
    pendingGoalUploads: state.pendingGoalUploads.filter((id) => id !== goalId),
    // The account may hold the goal, so the deletion waits to go up. Deleting there a goal the
    // account never had is harmless, so no one needs to know whether it did.
    pendingGoalDeletions: queued(state.pendingGoalDeletions, goalId),
  };
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

/** Puts a changed goal in place of its old self, and on the upload queue. */
function replaceGoal(state: State, goal: Goal): State {
  return {
    ...state,
    goals: state.goals.map((existing) => (existing.id === goal.id ? goal : existing)),
    pendingGoalUploads: queued(state.pendingGoalUploads, goal.id),
  };
}

/** `ids` with `id` at the end, unless it is there already. */
function queued(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids : [...ids, id];
}

/** The name is kept trimmed and never empty, so the header never addresses nobody. */
function setDisplayName(state: State, displayName: string): State {
  const name = displayName.trim();
  if (name === '' || name === state.displayName) return state;
  return { ...state, displayName: name, pendingSettingsUpload: true };
}

function setPetalColour(state: State, petalColour: string): State {
  if (petalColour === '' || petalColour === state.petalColour) return state;
  return { ...state, petalColour, pendingSettingsUpload: true };
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
  return { ...state, notificationSwitches: next, pendingSettingsUpload: true };
}

/**
 * The upload queues are left alone: what waited as a guest is now the first to upload. The
 * account's record, goals and settings are still to be restored to this phone. Signing in as
 * the account already signed in changes nothing, whichever way it names: it is the same account,
 * with the same record, and its restore stands.
 */
function signIn(state: State, who: Pick<Account, 'userId' | 'provider'>): State {
  if (state.account && state.account.userId === who.userId) return state;
  return { ...state, account: { userId: who.userId, provider: who.provider, restored: false } };
}

function signOut(state: State): State {
  return state.account === null ? state : { ...state, account: null };
}

/** Noted once: the first offer is the only one, so a second changes nothing. */
function offerSaveProgress(state: State, at: Instant): State {
  return state.saveProgressOfferedAt === null ? { ...state, saveProgressOfferedAt: at } : state;
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

/**
 * Takes off the queue each confirmed goal that the phone still holds exactly as it was sent. A
 * goal changed again since, or deleted, stays where it is: the account has yet to hear of that.
 */
function confirmGoalsUploaded(state: State, uploaded: readonly Goal[]): State {
  const byId = new Map(state.goals.map((goal) => [goal.id, goal]));
  const confirmed = new Set<string>();
  for (const goal of uploaded) {
    const current = byId.get(goal.id);
    if (current && sameGoal(current, goal)) confirmed.add(goal.id);
  }
  const pendingGoalUploads = state.pendingGoalUploads.filter((id) => !confirmed.has(id));
  return pendingGoalUploads.length === state.pendingGoalUploads.length ? state : { ...state, pendingGoalUploads };
}

function confirmGoalsDeleted(state: State, goalIds: readonly string[]): State {
  const confirmed = new Set(goalIds);
  const pendingGoalDeletions = state.pendingGoalDeletions.filter((id) => !confirmed.has(id));
  return pendingGoalDeletions.length === state.pendingGoalDeletions.length
    ? state
    : { ...state, pendingGoalDeletions };
}

/** The settings leave the queue only if the account holds them exactly as they are now. */
function confirmSettingsUploaded(state: State, settings: Settings): State {
  if (!state.pendingSettingsUpload || !sameSettings(settingsOf(state), settings)) return state;
  return { ...state, pendingSettingsUpload: false };
}

/** Everything the account holds, downloaded: merge it in and note that this sign-in's restore is done. */
function restore(state: State, userId: string, data: AccountData): State {
  const account = state.account;
  if (!account || account.userId !== userId) return state;
  let merged = addDownloaded(state, userId, data.sessions);
  merged = addDownloadedGoals(merged, userId, data.goals, data.deletedGoalIds);
  merged = restoreSettings(merged, data.settings);
  return account.restored ? merged : { ...merged, account: { ...account, restored: true } };
}

/**
 * Downloaded sessions join the record by id, so one the phone already has is never doubled, and
 * leave the upload queue if they were on it, since the account plainly has them. Nothing about a
 * session the phone already holds changes: the record is what the timer measured first.
 */
function addDownloaded(state: State, userId: string, sessions: readonly EndedSession[]): State {
  if (!state.account || state.account.userId !== userId) return state;

  const known = new Set(state.record.map((session) => session.id));
  const added: EndedSession[] = [];
  for (const session of sessions) {
    if (known.has(session.id)) continue;
    known.add(session.id);
    added.push(session);
  }

  const downloaded = new Set(sessions.map((session) => session.id));
  const pendingUploads = state.pendingUploads.filter((id) => !downloaded.has(id));

  if (added.length === 0 && pendingUploads.length === state.pendingUploads.length) return state;
  return {
    ...state,
    record: added.length === 0 ? state.record : addToRecord(state.record, added),
    pendingUploads,
  };
}

/**
 * Downloaded goals join by id. Unlike a session, a goal changes, so the account's copy of a goal
 * the phone already has replaces the phone's, and a goal deleted on the account goes from the
 * phone: another phone made those changes, and this one catches up. The exception is a goal with
 * a change here still to upload, which stands as it is until that change has gone up. A goal
 * deleted here, but not yet on the account, is not brought back by the account's copy of it, and
 * one the account has deleted already needs no deleting from here.
 */
function addDownloadedGoals(
  state: State,
  userId: string,
  goals: readonly Goal[],
  deletedGoalIds: readonly string[],
): State {
  if (!state.account || state.account.userId !== userId) return state;

  const pendingUploads = new Set(state.pendingGoalUploads);
  const pendingDeletions = new Set(state.pendingGoalDeletions);
  const deleted = new Set(deletedGoalIds);
  const downloaded = new Map(goals.map((goal) => [goal.id, goal]));

  let changed = false;
  const kept: Goal[] = [];
  for (const goal of state.goals) {
    if (pendingUploads.has(goal.id)) {
      kept.push(goal);
      continue;
    }
    if (deleted.has(goal.id)) {
      changed = true;
      continue;
    }
    const theirs = downloaded.get(goal.id);
    if (theirs && !sameGoal(goal, theirs)) {
      kept.push(theirs);
      changed = true;
    } else {
      kept.push(goal);
    }
  }

  const known = new Set(state.goals.map((goal) => goal.id));
  const added = goals.filter((goal) => !known.has(goal.id) && !pendingDeletions.has(goal.id));
  const pendingGoalDeletions = state.pendingGoalDeletions.filter((id) => !deleted.has(id));

  if (!changed && added.length === 0 && pendingGoalDeletions.length === state.pendingGoalDeletions.length) {
    return state;
  }
  return {
    ...state,
    goals: !changed && added.length === 0 ? state.goals : sortGoals([...kept, ...added]),
    pendingGoalDeletions,
  };
}

/**
 * The account's settings replace the phone's, so a new phone picks up the name, colour and
 * switches the account knows. The settings then need no upload, unless the account's copy had a
 * gap the phone's own filled in: the name is never blanked, because onboarding chose one and the
 * header should never address nobody. An account with no settings yet leaves the phone's as they
 * are, still to upload.
 */
function restoreSettings(state: State, settings: Settings | null): State {
  if (!settings) return state;
  const name = settings.displayName?.trim() ?? '';
  const next: State = {
    ...state,
    displayName: name === '' ? state.displayName : name,
    petalColour: settings.petalColour,
    notificationSwitches: { ...settings.notificationSwitches },
  };
  next.pendingSettingsUpload = !sameSettings(settingsOf(next), settings);
  if (sameSettings(settingsOf(state), settingsOf(next)) && next.pendingSettingsUpload === state.pendingSettingsUpload) {
    return state;
  }
  return next;
}
