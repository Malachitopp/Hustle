/**
 * Save your progress tests: when the pop-up offering a guest a sign-in is due, that it is
 * offered once, and that signing in with Google behaves as signing in with Apple does. Like the
 * other core tests they reach the core only through its entry point, pass every time in
 * explicitly and write each one with its UTC offset.
 */
import { apply, initialState, view, type Provider, type State } from '@/core';

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
const pause = (state: State, when: string): State => apply(state, { type: 'pause', at: at(when) });
const end = (state: State, when: string): State => apply(state, { type: 'end', at: at(when) });
const signIn = (state: State, when: string, provider: Provider = 'apple', userId = 'user-1'): State =>
  apply(state, { type: 'sign-in', at: at(when), userId, provider });
const signOut = (state: State, when: string): State => apply(state, { type: 'sign-out', at: at(when) });
const offer = (state: State, when: string): State => apply(state, { type: 'offer-save-progress', at: at(when) });
const seenAt = (state: State, when: string) => view(state, at(when), LONDON);

/** Whether Save your progress is due, seen at `when`. */
const dueAt = (state: State, when: string): boolean => seenAt(state, when).offerSaveProgress;

/** An ended session from `from` to `to` on top of `state`. */
const worked = (state: State, from: string, to: string): State => end(start(state, from), to);

/** An hour of work on the morning of `date`, on top of `state`. */
const workedOn = (state: State, date: string): State =>
  worked(state, `${date}T09:00:00+01:00`, `${date}T10:00:00+01:00`);

const T0 = '2026-09-10T08:00:00+01:00';

describe('Save your progress', () => {
  it('is not due before any session has ended', () => {
    expect(dueAt(initialState, T0)).toBe(false);
    const running = start(initialState, T0);
    expect(dueAt(running, '2026-09-10T09:00:00+01:00')).toBe(false);
  });

  it("is due once a guest's first session has ended", () => {
    const state = workedOn(initialState, '2026-09-10');
    expect(dueAt(state, '2026-09-10T10:00:00+01:00')).toBe(true);
  });

  it('is due after a session that ended by itself, so the next pop-up catches up on it', () => {
    const paused = pause(start(initialState, T0), '2026-09-10T09:00:00+01:00');
    expect(dueAt(paused, '2026-09-10T14:00:00+01:00')).toBe(false);
    expect(dueAt(paused, '2026-09-10T15:00:00+01:00')).toBe(true);
  });

  it('is never due while signed in, whichever way', () => {
    for (const provider of ['apple', 'google'] as const) {
      const state = workedOn(signIn(initialState, T0, provider), '2026-09-10');
      expect(dueAt(state, '2026-09-10T10:00:00+01:00')).toBe(false);
    }
  });

  it('is due for a guest again once their sign-in is over, if it was never offered', () => {
    let state = workedOn(signIn(initialState, T0), '2026-09-10');
    state = signOut(state, '2026-09-10T11:00:00+01:00');
    expect(dueAt(state, '2026-09-10T11:00:00+01:00')).toBe(true);
  });

  it('is offered once, however many sessions follow', () => {
    let state = workedOn(initialState, '2026-09-10');
    state = offer(state, '2026-09-10T10:00:00+01:00');
    expect(state.saveProgressOfferedAt).toBe(at('2026-09-10T10:00:00+01:00'));
    expect(dueAt(state, '2026-09-10T10:00:00+01:00')).toBe(false);
    state = workedOn(state, '2026-09-11');
    expect(dueAt(state, '2026-09-11T10:00:00+01:00')).toBe(false);
    expect(offer(state, '2026-09-11T10:00:00+01:00')).toBe(state);
  });

  it('is not offered again to a guest who signed in from it and was later dropped', () => {
    let state = offer(workedOn(initialState, '2026-09-10'), '2026-09-10T10:00:00+01:00');
    state = signIn(state, '2026-09-10T10:01:00+01:00');
    state = signOut(state, '2026-09-10T12:00:00+01:00');
    expect(dueAt(state, '2026-09-10T12:00:00+01:00')).toBe(false);
  });
});

describe('signing in with Google', () => {
  it('uploads the sessions that waited and wants a restore, as signing in with Apple does', () => {
    const guest = workedOn(initialState, '2026-09-10');
    const state = signIn(guest, '2026-09-10T11:00:00+01:00', 'google');
    expect(state.account).toEqual({ userId: 'user-1', provider: 'google', restored: false });
    const seen = seenAt(state, '2026-09-10T11:00:00+01:00');
    expect(seen.uploads.map((session) => session.id)).toEqual(guest.record.map((session) => session.id));
    expect(seen.restoreWanted).toBe(true);
    expect(seen.uploads[0].periods[0].to - seen.uploads[0].periods[0].from).toBe(HOUR);
  });

  it('as the account already signed in changes nothing, whichever way it names', () => {
    const apple = signIn(initialState, T0, 'apple');
    expect(signIn(apple, '2026-09-10T09:00:00+01:00', 'google')).toBe(apple);
    const google = signIn(initialState, T0, 'google');
    expect(signIn(google, '2026-09-10T09:00:00+01:00', 'apple')).toBe(google);
  });

  it('as another account replaces the one signed in and wants its record', () => {
    const apple = signIn(initialState, T0, 'apple');
    const other = signIn(apple, '2026-09-10T09:00:00+01:00', 'google', 'user-2');
    expect(other.account).toEqual({ userId: 'user-2', provider: 'google', restored: false });
  });
});
