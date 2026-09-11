/**
 * Backing up goals and settings: the helpers behind their upload queue and their restore. A
 * change to a goal or a setting goes up to the account, and the account confirms what it holds;
 * these say whether what it holds is what the phone has now, which is what takes a change off
 * the queue. (Sessions need none of this: they never change once ended.)
 */
import type { Goal, Settings, State } from './state';

/** The settings as they travel to and from the account. */
export function settingsOf(state: State): Settings {
  return {
    displayName: state.displayName,
    petalColour: state.petalColour,
    notificationSwitches: { ...state.notificationSwitches },
  };
}

export function sameSettings(a: Settings, b: Settings): boolean {
  return (
    a.displayName === b.displayName &&
    a.petalColour === b.petalColour &&
    a.notificationSwitches.pauseWarnings === b.notificationSwitches.pauseWarnings &&
    a.notificationSwitches.streakReminder === b.notificationSwitches.streakReminder
  );
}

/** Whether two copies of a goal hold the same details and the same switch history. */
export function sameGoal(a: Goal, b: Goal): boolean {
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.target === b.target &&
    a.deadline === b.deadline &&
    a.timeZone === b.timeZone &&
    a.createdAt === b.createdAt &&
    a.celebratedAt === b.celebratedAt &&
    a.switches.length === b.switches.length &&
    a.switches.every((flick, i) => flick.at === b.switches[i].at && flick.active === b.switches[i].active)
  );
}

/**
 * Goals oldest first by creation, then by id, so that two phones holding the same goals list
 * them the same way. On one phone goals are created in order, so this is a plain append; goals
 * restored from another phone can slot in anywhere.
 */
export function sortGoals(goals: readonly Goal[]): Goal[] {
  return [...goals].sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
