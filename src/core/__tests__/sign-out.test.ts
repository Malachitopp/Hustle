/**
 * Sign-out tests: signing out on purpose (or having the account deleted) leaves the phone as on
 * first launch whatever it held, while losing the sign-in, when the server no longer accepts it,
 * takes only the account. Like the other core tests they reach the core only through its entry
 * point, pass every time in explicitly and write each one with its UTC offset.
 */
import { apply, initialState, view, type State } from '@/core';

const LONDON = 'Europe/London';
const HOUR = 60 * 60_000;

/** An instant from an ISO string with an explicit offset. */
const at = (iso: string): number => {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new Error(`Bad time in test: ${iso}`);
  return ms;
};

const T0 = '2026-09-10T08:00:00+01:00';
const T1 = '2026-09-10T12:00:00+01:00';

let nextId = 1;
const start = (state: State, when: string): State =>
  apply(state, { type: 'start', at: at(when), sessionId: `session-${nextId++}`, timeZone: LONDON });
const end = (state: State, when: string): State => apply(state, { type: 'end', at: at(when) });
const signIn = (state: State, when: string, userId = 'user-1'): State =>
  apply(state, { type: 'sign-in', at: at(when), userId, provider: 'apple' });
const signOut = (state: State, when: string): State => apply(state, { type: 'sign-out', at: at(when) });
const loseSignIn = (state: State, when: string): State => apply(state, { type: 'lose-sign-in', at: at(when) });
const seenAt = (state: State, when: string) => view(state, at(when), LONDON);

/**
 * A phone with something of every kind on it: a name, a colour, a switch turned off, a goal, an
 * ended session, Save your progress offered, a sign-in, and a session in progress. Everything
 * but the sign-in is still waiting to upload.
 */
function busyPhone(): State {
  let state = apply(initialState, { type: 'set-display-name', at: at(T0), displayName: 'Sam' });
  state = apply(state, { type: 'set-petal-colour', at: at(T0), petalColour: 'blue' });
  state = apply(state, { type: 'set-notification-switches', at: at(T0), switches: { streakReminder: false } });
  state = apply(state, {
    type: 'create-goal',
    at: at(T0),
    goalId: 'finals',
    name: 'Finals',
    target: 100 * HOUR,
    deadline: '2026-10-24',
    timeZone: LONDON,
  });
  state = end(start(state, '2026-09-10T09:00:00+01:00'), '2026-09-10T10:00:00+01:00');
  state = apply(state, { type: 'offer-save-progress', at: at('2026-09-10T10:00:00+01:00') });
  state = signIn(state, '2026-09-10T10:30:00+01:00');
  return start(state, '2026-09-10T11:00:00+01:00');
}

describe('signing out', () => {
  it('leaves the phone as on first launch, whatever it held', () => {
    const before = busyPhone();
    // The phone really did hold something of each kind.
    expect(before.displayName).toBe('Sam');
    expect(before.petalColour).toBe('blue');
    expect(before.notificationSwitches.streakReminder).toBe(false);
    expect(before.goals).toHaveLength(1);
    expect(before.record).toHaveLength(1);
    expect(before.current).not.toBeNull();
    expect(before.account).not.toBeNull();
    expect(before.pendingUploads).toHaveLength(1);
    expect(before.pendingGoalUploads).toEqual(['finals']);
    expect(before.pendingSettingsUpload).toBe(true);
    expect(before.saveProgressOfferedAt).not.toBeNull();

    expect(signOut(before, T1)).toEqual(initialState);
  });

  it('shows a first launch afterwards: nothing to see, upload, restore or say', () => {
    const seen = seenAt(signOut(busyPhone(), T1), T1);
    expect(seen.header.situation).toBe('first-session');
    expect(seen.session).toEqual({ state: 'idle' });
    expect(seen.plant.state).toBe('none');
    expect(seen.goals).toEqual([]);
    expect(seen.streak).toBe(0);
    expect(seen.uploads).toEqual([]);
    expect(seen.goalUploads).toEqual([]);
    expect(seen.goalDeletions).toEqual([]);
    expect(seen.settingsUpload).toBeNull();
    expect(seen.restoreWanted).toBe(false);
    expect(seen.offerSaveProgress).toBe(false);
    expect(seen.notifications).toEqual([]);
  });

  it('clears the phone even once the server has already ended the sign-in', () => {
    const lost = loseSignIn(busyPhone(), T1);
    expect(lost.account).toBeNull();
    expect(lost.record).toHaveLength(1);
    expect(signOut(lost, T1)).toEqual(initialState);
  });

  it('leaves a fresh phone fresh', () => {
    expect(signOut(initialState, T1)).toEqual(initialState);
  });

  it('is followed by a sign-in that wants a full restore and has nothing to upload, as on a new phone', () => {
    const again = signIn(signOut(busyPhone(), T1), T1);
    expect(again.account).toEqual({ userId: 'user-1', provider: 'apple', restored: false });
    expect(seenAt(again, T1).restoreWanted).toBe(true);
    expect(seenAt(again, T1).uploads).toEqual([]);
  });
});

describe('losing the sign-in', () => {
  it('makes the user a guest and keeps everything else on the phone', () => {
    const before = busyPhone();
    const after = loseSignIn(before, T1);
    expect(after).toEqual({ ...before, account: null });
    expect(seenAt(after, T1).uploads).toEqual([]);
    expect(seenAt(after, T1).restoreWanted).toBe(false);
  });

  it('changes nothing for a guest', () => {
    expect(loseSignIn(initialState, T1)).toBe(initialState);
  });
});
