/**
 * Backup tests for goals and settings: which changes the phone should send to the account and
 * when, what a confirmation takes off the queue, and how the account's goals and settings,
 * downloaded on a new phone or after another phone changed them, merge into this phone's. Like
 * the other core tests they reach the core only through its entry point, pass every time in
 * explicitly and write each one with its UTC offset.
 */
import { apply, initialState, view, type AccountData, type Goal, type Settings, type State } from '@/core';

const LONDON = 'Europe/London';
const HOUR = 60 * 60_000;

/** An instant from an ISO string with an explicit offset. */
const at = (iso: string): number => {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new Error(`Bad time in test: ${iso}`);
  return ms;
};

let nextId = 1;
const start = (state: State, when: string): State =>
  apply(state, { type: 'start', at: at(when), sessionId: `session-${nextId++}`, timeZone: LONDON });
const end = (state: State, when: string): State => apply(state, { type: 'end', at: at(when) });
const signIn = (state: State, when: string, userId = 'user-1'): State =>
  apply(state, { type: 'sign-in', at: at(when), userId, provider: 'apple' });
const signOut = (state: State, when: string): State => apply(state, { type: 'sign-out', at: at(when) });

type GoalDetails = Partial<{ name: string; target: number; deadline: string }>;

/** Creates a goal at `when`: "Finals", 100 hours by 24 October 2026 unless told otherwise. */
const addGoal = (state: State, when: string, goalId = 'finals', details: GoalDetails = {}): State =>
  apply(state, {
    type: 'create-goal',
    at: at(when),
    goalId,
    name: 'Finals',
    target: 100 * HOUR,
    deadline: '2026-10-24',
    timeZone: LONDON,
    ...details,
  });
const editGoal = (state: State, when: string, goalId: string, details: GoalDetails): State =>
  apply(state, { type: 'edit-goal', at: at(when), goalId, name: 'Finals', target: 100 * HOUR, deadline: '2026-10-24', ...details });
const switchGoal = (state: State, when: string, goalId: string, active: boolean): State =>
  apply(state, { type: 'switch-goal', at: at(when), goalId, active });
const celebrate = (state: State, when: string, goalId: string): State =>
  apply(state, { type: 'celebrate-goal', at: at(when), goalId });
const deleteGoal = (state: State, when: string, goalId: string): State =>
  apply(state, { type: 'delete-goal', at: at(when), goalId });

const setName = (state: State, when: string, displayName: string): State =>
  apply(state, { type: 'set-display-name', at: at(when), displayName });
const setColour = (state: State, when: string, petalColour: string): State =>
  apply(state, { type: 'set-petal-colour', at: at(when), petalColour });
const setSwitches = (state: State, when: string, switches: { pauseWarnings?: boolean; streakReminder?: boolean }): State =>
  apply(state, { type: 'set-notification-switches', at: at(when), switches });

const confirmGoals = (state: State, when: string, goals: Goal[]): State =>
  apply(state, { type: 'confirm-goals-uploaded', at: at(when), goals });
const confirmDeleted = (state: State, when: string, ...goalIds: string[]): State =>
  apply(state, { type: 'confirm-goals-deleted', at: at(when), goalIds });
const confirmSettings = (state: State, when: string, settings: Settings): State =>
  apply(state, { type: 'confirm-settings-uploaded', at: at(when), settings });

const restore = (state: State, when: string, data: Partial<AccountData> = {}, userId = 'user-1'): State =>
  apply(state, { type: 'restore', at: at(when), userId, sessions: [], goals: [], deletedGoalIds: [], settings: null, ...data });
const addDownloadedGoals = (
  state: State,
  when: string,
  data: Partial<Pick<AccountData, 'goals' | 'deletedGoalIds'>> = {},
  userId = 'user-1',
): State => apply(state, { type: 'add-downloaded-goals', at: at(when), userId, goals: [], deletedGoalIds: [], ...data });

const seenAt = (state: State, when: string) => view(state, at(when), LONDON);
const goalUploadsAt = (state: State, when: string): string[] => seenAt(state, when).goalUploads.map((goal) => goal.id);
const goalDeletionsAt = (state: State, when: string): string[] => seenAt(state, when).goalDeletions;
const settingsUploadAt = (state: State, when: string): Settings | null => seenAt(state, when).settingsUpload;
const goalIds = (state: State): string[] => state.goals.map((goal) => goal.id);

/** Signed in and restored, to an account with nothing in it. */
const signedIn = (state: State, when: string): State => restore(signIn(state, when), when);

/** An ended session from `from` to `to` on top of `state`. */
const worked = (state: State, from: string, to: string): State => end(start(state, from), to);

/** A goal or a record as it comes off the wire: a copy. */
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const goalOf = (state: State, id: string): Goal => {
  const goal = state.goals.find((candidate) => candidate.id === id);
  if (!goal) throw new Error(`No goal ${id}`);
  return goal;
};

const switchesOn = { pauseWarnings: true, streakReminder: true };

const T0 = '2026-09-10T08:00:00+01:00';
const T1 = '2026-09-10T09:00:00+01:00';
const T2 = '2026-09-10T10:00:00+01:00';
const T3 = '2026-09-10T11:00:00+01:00';
const T4 = '2026-09-10T12:00:00+01:00';

describe('changing goals', () => {
  it('queues a new goal for upload, which goes once the user is signed in and restored', () => {
    const guest = addGoal(initialState, T0);
    expect(guest.pendingGoalUploads).toEqual(['finals']);
    expect(goalUploadsAt(guest, T0)).toEqual([]);
    const notRestored = signIn(guest, T1);
    expect(goalUploadsAt(notRestored, T1)).toEqual([]);
    const restored = restore(notRestored, T1);
    expect(goalUploadsAt(restored, T1)).toEqual(['finals']);
    expect(seenAt(restored, T1).goalUploads[0]).toBe(restored.goals[0]);
  });

  it('queues an edited or switched goal once, however many times it changes', () => {
    let state = addGoal(signedIn(initialState, T0), T0);
    state = confirmGoals(state, T1, [goalOf(state, 'finals')]);
    expect(goalUploadsAt(state, T1)).toEqual([]);

    state = editGoal(state, T1, 'finals', { name: 'Exams' });
    expect(goalUploadsAt(state, T1)).toEqual(['finals']);
    state = switchGoal(state, T2, 'finals', false);
    state = switchGoal(state, T3, 'finals', true);
    expect(goalUploadsAt(state, T3)).toEqual(['finals']);
    // Sent exactly as it is now, switch history included.
    expect(seenAt(state, T3).goalUploads[0]).toMatchObject({
      name: 'Exams',
      switches: [
        { at: at(T2), active: false },
        { at: at(T3), active: true },
      ],
    });
  });

  it('queues a celebrated goal, so no other phone celebrates it again', () => {
    let state = addGoal(signedIn(initialState, T0), T0, 'finals', { target: HOUR });
    state = confirmGoals(state, T0, [goalOf(state, 'finals')]);
    state = worked(state, T1, T2);
    state = celebrate(state, T2, 'finals');
    expect(goalUploadsAt(state, T2)).toEqual(['finals']);
    expect(seenAt(state, T2).goalUploads[0].celebratedAt).toBe(at(T2));
  });

  it('uploads goals in the order they first changed', () => {
    let state = addGoal(signedIn(initialState, T0), T0, 'a');
    state = addGoal(state, T1, 'b');
    state = confirmGoals(state, T1, [goalOf(state, 'a'), goalOf(state, 'b')]);
    state = editGoal(state, T2, 'b', { name: 'B' });
    state = editGoal(state, T3, 'a', { name: 'A' });
    state = editGoal(state, T4, 'b', { name: 'Bee' });
    expect(goalUploadsAt(state, T4)).toEqual(['b', 'a']);
  });

  it('takes a goal off the queue when the account confirms it exactly as it is', () => {
    const state = addGoal(signedIn(initialState, T0), T0);
    const confirmed = confirmGoals(state, T1, [copy(goalOf(state, 'finals'))]);
    expect(goalUploadsAt(confirmed, T1)).toEqual([]);
    expect(confirmed.goals).toBe(state.goals);
  });

  it('keeps a goal on the queue when the account confirms an older version of it', () => {
    let state = addGoal(signedIn(initialState, T0), T0);
    const sent = copy(goalOf(state, 'finals'));
    state = editGoal(state, T1, 'finals', { target: 50 * HOUR });
    expect(confirmGoals(state, T2, [sent])).toBe(state);
    expect(goalUploadsAt(state, T2)).toEqual(['finals']);
    const confirmed = confirmGoals(state, T2, [copy(goalOf(state, 'finals'))]);
    expect(goalUploadsAt(confirmed, T2)).toEqual([]);
  });

  it('is unmoved by a confirmation for a goal it is not waiting on', () => {
    const state = addGoal(signedIn(initialState, T0), T0);
    const stranger: Goal = { ...goalOf(state, 'finals'), id: 'no-such-goal' };
    expect(confirmGoals(state, T1, [stranger])).toBe(state);
    const confirmed = confirmGoals(state, T1, [goalOf(state, 'finals')]);
    expect(confirmGoals(confirmed, T2, [goalOf(state, 'finals')])).toBe(confirmed);
    expect(confirmDeleted(confirmed, T2, 'finals')).toBe(confirmed);
  });

  it('queues a deletion in place of the goal, until the account confirms it', () => {
    let state = addGoal(signedIn(initialState, T0), T0);
    state = deleteGoal(state, T1, 'finals');
    expect(goalIds(state)).toEqual([]);
    expect(goalUploadsAt(state, T1)).toEqual([]);
    expect(goalDeletionsAt(state, T1)).toEqual(['finals']);
    // Deleting it again, or one that never existed, changes nothing.
    expect(deleteGoal(state, T2, 'finals')).toBe(state);
    expect(deleteGoal(state, T2, 'other')).toBe(state);

    const confirmed = confirmDeleted(state, T2, 'finals');
    expect(goalDeletionsAt(confirmed, T2)).toEqual([]);
    expect(confirmDeleted(confirmed, T3, 'finals')).toBe(confirmed);
  });

  it("holds a guest's changes and deletions until they sign in, then sends them all", () => {
    let state = addGoal(initialState, T0, 'a');
    state = addGoal(state, T0, 'b');
    state = deleteGoal(state, T1, 'b');
    expect(goalUploadsAt(state, T1)).toEqual([]);
    expect(goalDeletionsAt(state, T1)).toEqual([]);
    state = signedIn(state, T2);
    expect(goalUploadsAt(state, T2)).toEqual(['a']);
    expect(goalDeletionsAt(state, T2)).toEqual(['b']);
    // A sign-out puts them on hold again.
    state = signOut(state, T3);
    expect(goalUploadsAt(state, T3)).toEqual([]);
    expect(goalDeletionsAt(state, T3)).toEqual([]);
  });
});

describe('changing settings', () => {
  it('queues the settings when the name, the petal colour or a switch changes', () => {
    let state = signedIn(initialState, T0);
    expect(settingsUploadAt(state, T0)).toBeNull();

    state = setName(state, T1, 'Sam');
    expect(settingsUploadAt(state, T1)).toEqual({ displayName: 'Sam', petalColour: null, notificationSwitches: switchesOn });
    state = confirmSettings(state, T1, settingsUploadAt(state, T1)!);
    expect(settingsUploadAt(state, T1)).toBeNull();

    state = setColour(state, T2, 'blue');
    expect(settingsUploadAt(state, T2)).toEqual({ displayName: 'Sam', petalColour: 'blue', notificationSwitches: switchesOn });
    state = confirmSettings(state, T2, settingsUploadAt(state, T2)!);

    state = setSwitches(state, T3, { pauseWarnings: false });
    expect(settingsUploadAt(state, T3)).toEqual({
      displayName: 'Sam',
      petalColour: 'blue',
      notificationSwitches: { pauseWarnings: false, streakReminder: true },
    });
  });

  it('ignores a name or colour that changes nothing', () => {
    const state = setColour(setName(signedIn(initialState, T0), T0, 'Sam'), T0, 'blue');
    expect(setName(state, T1, ' Sam ')).toBe(state);
    expect(setName(state, T1, '  ')).toBe(state);
    expect(setColour(state, T1, 'blue')).toBe(state);
    expect(setColour(state, T1, '')).toBe(state);
    expect(setSwitches(state, T1, { pauseWarnings: true })).toBe(state);
  });

  it('keeps the settings on the queue when the account confirms older ones', () => {
    let state = setName(signedIn(initialState, T0), T0, 'Sam');
    const sent = settingsUploadAt(state, T0)!;
    state = setName(state, T1, 'Samuel');
    expect(confirmSettings(state, T2, sent)).toBe(state);
    const confirmed = confirmSettings(state, T2, settingsUploadAt(state, T2)!);
    expect(settingsUploadAt(confirmed, T2)).toBeNull();
    expect(confirmSettings(confirmed, T3, sent)).toBe(confirmed);
  });

  it("holds a guest's settings until they sign in and are restored", () => {
    let state = setName(initialState, T0, 'Sam');
    expect(state.pendingSettingsUpload).toBe(true);
    expect(settingsUploadAt(state, T0)).toBeNull();
    state = signIn(state, T1);
    expect(settingsUploadAt(state, T1)).toBeNull();
    state = restore(state, T1);
    expect(settingsUploadAt(state, T1)).toEqual({ displayName: 'Sam', petalColour: null, notificationSwitches: switchesOn });
  });
});

describe('restoring goals', () => {
  it("gives a new phone the account's goals, oldest first, with nothing to upload", () => {
    let phoneA = addGoal(initialState, T1, 'later');
    phoneA = addGoal(phoneA, T0, 'earlier');
    expect(goalIds(phoneA)).toEqual(['earlier', 'later']);

    const newPhone = restore(signIn(initialState, T2), T2, { goals: [copy(goalOf(phoneA, 'later')), copy(goalOf(phoneA, 'earlier'))] });
    expect(goalIds(newPhone)).toEqual(['earlier', 'later']);
    expect(newPhone.goals).toEqual(phoneA.goals);
    expect(goalUploadsAt(newPhone, T2)).toEqual([]);
    expect(seenAt(newPhone, T2).restoreWanted).toBe(false);
    expect(seenAt(newPhone, T2).goals.map((goal) => goal.status)).toEqual(['active', 'active']);
  });

  it("adds a guest's goals to an account that has goals of its own", () => {
    const theirs = copy(goalOf(addGoal(initialState, T0, 'theirs'), 'theirs'));
    let phone = addGoal(initialState, T1, 'mine');
    phone = restore(signIn(phone, T2), T2, { goals: [theirs] });
    expect(goalIds(phone)).toEqual(['theirs', 'mine']);
    expect(goalUploadsAt(phone, T2)).toEqual(['mine']);
  });

  it("takes the account's copy of a goal the phone has, unless a change here is still to upload", () => {
    let phone = addGoal(signedIn(initialState, T0), T0);
    phone = confirmGoals(phone, T0, [goalOf(phone, 'finals')]);
    // Another phone renamed it and switched it off.
    const theirs: Goal = { ...copy(goalOf(phone, 'finals')), name: 'Exams', switches: [{ at: at(T1), active: false }] };

    const caughtUp = addDownloadedGoals(phone, T2, { goals: [theirs] });
    expect(goalOf(caughtUp, 'finals')).toEqual(theirs);
    expect(goalUploadsAt(caughtUp, T2)).toEqual([]);

    // But an edit made here first, still to upload, stands until it has gone up.
    const edited = editGoal(phone, T1, 'finals', { target: 50 * HOUR });
    const kept = addDownloadedGoals(edited, T2, { goals: [theirs] });
    expect(goalOf(kept, 'finals')).toBe(goalOf(edited, 'finals'));
    expect(goalUploadsAt(kept, T2)).toEqual(['finals']);
  });

  it('removes a goal deleted on the account, unless a change here is still to upload', () => {
    let phone = addGoal(signedIn(initialState, T0), T0);
    phone = confirmGoals(phone, T0, [goalOf(phone, 'finals')]);

    const gone = addDownloadedGoals(phone, T2, { deletedGoalIds: ['finals'] });
    expect(goalIds(gone)).toEqual([]);
    expect(goalDeletionsAt(gone, T2)).toEqual([]);

    const edited = editGoal(phone, T1, 'finals', { name: 'Exams' });
    const kept = addDownloadedGoals(edited, T2, { deletedGoalIds: ['finals'] });
    expect(goalIds(kept)).toEqual(['finals']);
    expect(goalUploadsAt(kept, T2)).toEqual(['finals']);
  });

  it('neither brings back nor deletes again a goal deleted here', () => {
    let phone = addGoal(signedIn(initialState, T0), T0);
    const theirs = copy(goalOf(phone, 'finals'));
    phone = confirmGoals(phone, T0, [goalOf(phone, 'finals')]);
    phone = deleteGoal(phone, T1, 'finals');

    // The account still holds it: the deletion has not gone up yet.
    const stillThere = addDownloadedGoals(phone, T2, { goals: [theirs] });
    expect(stillThere).toBe(phone);
    expect(goalDeletionsAt(stillThere, T2)).toEqual(['finals']);

    // The account has it deleted already (from another phone, say), so nothing is left to do.
    const alreadyGone = addDownloadedGoals(phone, T2, { deletedGoalIds: ['finals'] });
    expect(goalIds(alreadyGone)).toEqual([]);
    expect(goalDeletionsAt(alreadyGone, T2)).toEqual([]);
  });

  it('changes nothing when the download holds nothing new', () => {
    let phone = addGoal(signedIn(initialState, T0), T0);
    phone = confirmGoals(phone, T0, [goalOf(phone, 'finals')]);
    expect(addDownloadedGoals(phone, T1, { goals: [copy(goalOf(phone, 'finals'))] })).toBe(phone);
    expect(addDownloadedGoals(phone, T1)).toBe(phone);
    expect(restore(phone, T1, { goals: [copy(goalOf(phone, 'finals'))] })).toBe(phone);
  });

  it('ignores a download for a guest, or for an account other than the one signed in', () => {
    const theirs = copy(goalOf(addGoal(initialState, T0), 'finals'));
    const guest = setName(initialState, T0, 'Sam');
    expect(addDownloadedGoals(guest, T1, { goals: [theirs] })).toBe(guest);
    expect(restore(guest, T1, { goals: [theirs] })).toBe(guest);
    const signedInAsOther = signIn(guest, T1);
    expect(addDownloadedGoals(signedInAsOther, T1, { goals: [theirs] }, 'user-2')).toBe(signedInAsOther);
    expect(restore(signedInAsOther, T1, { goals: [theirs] }, 'user-2')).toBe(signedInAsOther);
  });

  it("shows a restored goal's progress from the restored record", () => {
    let phoneA = addGoal(initialState, T0, 'finals', { target: 2 * HOUR });
    phoneA = worked(phoneA, T1, T2);
    const newPhone = restore(signIn(initialState, T3), T3, { sessions: copy(phoneA.record), goals: copy(phoneA.goals) });
    const goal = seenAt(newPhone, T3).goals[0];
    expect(goal).toMatchObject({ id: 'finals', workTime: HOUR, status: 'active' });
    expect(seenAt(newPhone, T3).goals).toEqual(seenAt(phoneA, T3).goals);
  });

  it("keeps a restored goal's celebration, so a new phone does not celebrate it again", () => {
    let phoneA = addGoal(initialState, T0, 'finals', { target: HOUR });
    phoneA = worked(phoneA, T1, T2);
    phoneA = celebrate(phoneA, T2, 'finals');
    const newPhone = restore(signIn(initialState, T3), T3, { sessions: copy(phoneA.record), goals: copy(phoneA.goals) });
    expect(seenAt(newPhone, T3).goals[0]).toMatchObject({ status: 'achieved', celebratedAt: at(T2) });
  });
});

describe('restoring settings', () => {
  const account: Settings = {
    displayName: 'Sam',
    petalColour: 'violet',
    notificationSwitches: { pauseWarnings: false, streakReminder: true },
  };

  /** A new phone, where onboarding chose a name and Settings a colour before signing in. */
  const newPhone = signIn(setColour(setName(initialState, T0, 'Samuel'), T0, 'blue'), T1);

  it("gives a new phone the account's settings, in place of the ones chosen at first launch", () => {
    const restored = restore(newPhone, T1, { settings: account });
    expect(restored.displayName).toBe('Sam');
    expect(restored.petalColour).toBe('violet');
    expect(restored.notificationSwitches).toEqual({ pauseWarnings: false, streakReminder: true });
    expect(settingsUploadAt(restored, T1)).toBeNull();
    expect(seenAt(restored, T1).header.text).toContain('Sam');
  });

  it("keeps the phone's settings, still to upload, when the account has none yet", () => {
    const restored = restore(newPhone, T1, { settings: null });
    expect(restored.displayName).toBe('Samuel');
    expect(restored.petalColour).toBe('blue');
    expect(settingsUploadAt(restored, T1)).toEqual({ displayName: 'Samuel', petalColour: 'blue', notificationSwitches: switchesOn });
  });

  it("never blanks the name: an account with no name keeps the phone's, and sends it up", () => {
    const restored = restore(newPhone, T1, { settings: { ...account, displayName: null } });
    expect(restored.displayName).toBe('Samuel');
    expect(restored.petalColour).toBe('violet');
    expect(settingsUploadAt(restored, T1)).toEqual({ ...account, displayName: 'Samuel' });
  });

  it('changes nothing when the account holds the same settings', () => {
    const restored = restore(newPhone, T1, { settings: account });
    expect(restore(restored, T2, { settings: copy(account) })).toBe(restored);
  });
});

describe('the stored history', () => {
  it('keeps the queues and the petal colour through a trip through JSON', () => {
    let state = setColour(setName(signedIn(initialState, T0), T0, 'Sam'), T0, 'pink');
    state = addGoal(state, T1, 'a');
    state = addGoal(state, T1, 'b');
    state = deleteGoal(state, T2, 'b');
    const saved = JSON.parse(JSON.stringify(state)) as State;
    expect(saved).toEqual(state);
    expect(goalUploadsAt(saved, T2)).toEqual(['a']);
    expect(goalDeletionsAt(saved, T2)).toEqual(['b']);
    expect(settingsUploadAt(saved, T2)).toEqual({ displayName: 'Sam', petalColour: 'pink', notificationSwitches: switchesOn });
  });
});
