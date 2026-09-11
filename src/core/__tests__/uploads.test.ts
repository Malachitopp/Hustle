/**
 * Upload queue tests: which ended sessions the phone should upload, and when. Like the other
 * core tests they reach the core only through its entry point, pass every time in explicitly
 * and write each one with its UTC offset.
 */
import { apply, initialState, view, type State } from '@/core';

const LONDON = 'Europe/London';

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
const signIn = (state: State, when: string, userId = 'user-1'): State =>
  apply(state, { type: 'sign-in', at: at(when), userId, provider: 'apple' });
const loseSignIn = (state: State, when: string): State => apply(state, { type: 'lose-sign-in', at: at(when) });
const confirm = (state: State, when: string, ...sessionIds: string[]): State =>
  apply(state, { type: 'confirm-uploaded', at: at(when), sessionIds });

/** The ids of the sessions the phone should upload, seen at `when`. */
const uploadsAt = (state: State, when: string): string[] =>
  view(state, at(when), LONDON).uploads.map((session) => session.id);

/** An ended session from `from` to `to` on top of `state`. */
const worked = (state: State, from: string, to: string): State => end(start(state, from), to);

/** An hour of work on the morning of `date`, on top of `state`. */
const workedOn = (state: State, date: string): State =>
  worked(state, `${date}T09:00:00+01:00`, `${date}T10:00:00+01:00`);

describe('a signed-in user', () => {
  const signedIn = signIn(initialState, '2026-09-10T08:00:00+01:00');

  it('has nothing to upload before any session has ended, even with one running', () => {
    expect(uploadsAt(signedIn, '2026-09-10T08:00:00+01:00')).toEqual([]);
    const running = start(signedIn, '2026-09-10T09:00:00+01:00');
    expect(uploadsAt(running, '2026-09-10T09:30:00+01:00')).toEqual([]);
  });

  it('has a session to upload the moment it ends, exactly as it entered the record', () => {
    const state = worked(signedIn, '2026-09-10T09:00:00+01:00', '2026-09-10T10:00:00+01:00');
    const v = view(state, at('2026-09-10T10:00:00+01:00'), LONDON);
    expect(v.uploads).toEqual([state.record[0]]);
    expect(v.uploads[0].days).toEqual([{ date: '2026-09-10', workTime: 60 * 60_000 }]);
  });

  it('uploads sessions in the order they ended', () => {
    let state = workedOn(signedIn, '2026-09-10');
    state = workedOn(state, '2026-09-11');
    state = workedOn(state, '2026-09-12');
    expect(uploadsAt(state, '2026-09-12T12:00:00+01:00')).toEqual(state.record.map((session) => session.id));
  });

  it('takes a session off the queue once its upload is confirmed and leaves the rest', () => {
    let state = workedOn(signedIn, '2026-09-10');
    state = workedOn(state, '2026-09-11');
    const [first, second] = state.record.map((session) => session.id);

    state = confirm(state, '2026-09-11T10:00:01+01:00', first);
    expect(uploadsAt(state, '2026-09-11T10:00:01+01:00')).toEqual([second]);
    expect(state.record).toHaveLength(2);

    state = confirm(state, '2026-09-11T10:00:02+01:00', second);
    expect(uploadsAt(state, '2026-09-11T10:00:02+01:00')).toEqual([]);
  });

  it('can confirm several sessions at once', () => {
    let state = workedOn(signedIn, '2026-09-10');
    state = workedOn(state, '2026-09-11');
    state = confirm(state, '2026-09-11T10:00:01+01:00', ...state.record.map((session) => session.id));
    expect(uploadsAt(state, '2026-09-11T10:00:01+01:00')).toEqual([]);
  });

  it('is unmoved by a confirmation for a session it is not waiting on', () => {
    const state = workedOn(signedIn, '2026-09-10');
    const [id] = state.record.map((session) => session.id);
    expect(confirm(state, '2026-09-10T10:00:01+01:00', 'no-such-session')).toBe(state);
    // A retried confirmation, after the first one already went through.
    const confirmed = confirm(state, '2026-09-10T10:00:01+01:00', id);
    expect(confirm(confirmed, '2026-09-10T10:00:02+01:00', id)).toBe(confirmed);
  });

  it('queues a session that ended by itself, from the moment it did', () => {
    const paused = pause(start(signedIn, '2026-09-10T09:00:00+01:00'), '2026-09-10T10:00:00+01:00');
    expect(uploadsAt(paused, '2026-09-10T15:59:00+01:00')).toEqual([]);

    const v = view(paused, at('2026-09-10T16:00:00+01:00'), LONDON);
    expect(v.uploads).toHaveLength(1);
    expect(v.uploads[0]).toMatchObject({ endedAt: at('2026-09-10T16:00:00+01:00') });

    // Confirming it is the next thing a phone would do, and puts it in the record for good.
    const confirmed = confirm(paused, '2026-09-10T17:00:00+01:00', v.uploads[0].id);
    expect(confirmed.record).toEqual([v.uploads[0]]);
    expect(uploadsAt(confirmed, '2026-09-10T17:00:00+01:00')).toEqual([]);
  });

  it('is unchanged by signing in again as the same account', () => {
    expect(signIn(signedIn, '2026-09-10T09:00:00+01:00')).toBe(signedIn);
  });
});

describe('a guest', () => {
  it('has nothing to upload, however many sessions have ended', () => {
    let state = workedOn(initialState, '2026-09-10');
    state = workedOn(state, '2026-09-11');
    expect(state.record).toHaveLength(2);
    expect(uploadsAt(state, '2026-09-11T12:00:00+01:00')).toEqual([]);
  });

  it('has every session that waited on the phone uploaded once they sign in, oldest first', () => {
    let state = workedOn(initialState, '2026-09-10');
    state = workedOn(state, '2026-09-11');
    state = signIn(state, '2026-09-11T12:00:00+01:00');
    expect(uploadsAt(state, '2026-09-11T12:00:00+01:00')).toEqual(state.record.map((session) => session.id));
  });

  it('is what a user whose sign-in is lost becomes: their sessions wait again until the next sign-in', () => {
    let state = signIn(initialState, '2026-09-10T08:00:00+01:00');
    state = workedOn(state, '2026-09-10');
    const [uploaded] = state.record.map((session) => session.id);
    state = confirm(state, '2026-09-10T10:00:01+01:00', uploaded);
    state = workedOn(state, '2026-09-11');
    const [, waiting] = state.record.map((session) => session.id);

    state = loseSignIn(state, '2026-09-11T11:00:00+01:00');
    expect(state.account).toBeNull();
    expect(uploadsAt(state, '2026-09-11T11:00:00+01:00')).toEqual([]);

    state = workedOn(state, '2026-09-12');
    const [, , asGuest] = state.record.map((session) => session.id);
    state = signIn(state, '2026-09-12T11:00:00+01:00');
    expect(uploadsAt(state, '2026-09-12T11:00:00+01:00')).toEqual([waiting, asGuest]);
  });

  it('is unchanged by losing a sign-in it never had', () => {
    expect(loseSignIn(initialState, '2026-09-10T08:00:00+01:00')).toBe(initialState);
  });
});

describe('the stored history', () => {
  it('keeps the account and the upload queue through a trip through JSON', () => {
    let state = signIn(initialState, '2026-09-10T08:00:00+01:00');
    state = workedOn(state, '2026-09-10');
    const restored = JSON.parse(JSON.stringify(state)) as State;
    expect(restored).toEqual(state);
    expect(uploadsAt(restored, '2026-09-10T12:00:00+01:00')).toEqual(uploadsAt(state, '2026-09-10T12:00:00+01:00'));
  });
});
