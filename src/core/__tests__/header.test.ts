/**
 * Header tests: the yellow line above the plant, in every situation, addressed to the user by
 * their display name. Like the other core tests they reach the core only through its entry
 * point, pass every time in explicitly and write each one with its UTC offset.
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
const named = (state: State, displayName: string): State =>
  apply(state, { type: 'set-display-name', at: at('2026-09-01T09:00:00+01:00'), displayName });
const headerAt = (state: State, when: string) => view(state, at(when), LONDON).header;

/** An ended session from `from` to `to` on top of `state`. */
const worked = (state: State, from: string, to: string): State => end(start(state, from), to);

/** Sam, who has chosen a name but not worked yet. */
const sam = named(initialState, 'Sam');

describe('the header', () => {
  it('invites the first session before any work', () => {
    expect(headerAt(sam, '2026-09-10T09:00:00+01:00')).toEqual({
      situation: 'first-session',
      text: 'Welcome, Sam. Start a session to plant your first rose.',
    });
  });

  it("counts today's work while a session is running", () => {
    const running = start(sam, '2026-09-10T09:00:00+01:00');
    expect(headerAt(running, '2026-09-10T11:14:00+01:00')).toEqual({
      situation: 'worked-today',
      text: 'Sam, you have worked 2h 14m today',
    });
  });

  it('keeps counting today while a session is paused, with the count frozen', () => {
    const paused = pause(start(sam, '2026-09-10T09:00:00+01:00'), '2026-09-10T11:14:00+01:00');
    expect(headerAt(paused, '2026-09-10T12:00:00+01:00')).toEqual({
      situation: 'worked-today',
      text: 'Sam, you have worked 2h 14m today',
    });
  });

  it('congratulates once today reaches 5 hours of work, and not a minute before', () => {
    const running = start(sam, '2026-09-10T08:00:00+01:00');
    expect(headerAt(running, '2026-09-10T12:59:00+01:00').text).toBe('Sam, you have worked 4h 59m today');
    expect(headerAt(running, '2026-09-10T13:00:00+01:00').text).toBe(
      'Congratulations Sam, you have worked 5h 0m today',
    );
    expect(headerAt(running, '2026-09-10T14:40:00+01:00')).toEqual({
      situation: 'worked-today',
      text: 'Congratulations Sam, you have worked 6h 40m today',
    });
  });

  it("keeps counting today's work after the session has ended, while the rose is alive", () => {
    const state = worked(sam, '2026-09-10T09:00:00+01:00', '2026-09-10T13:00:00+01:00');
    expect(headerAt(state, '2026-09-10T15:00:00+01:00')).toEqual({
      situation: 'worked-today',
      text: 'Sam, you have worked 4h 0m today',
    });
  });

  it('says the rose has died when it dies after work today', () => {
    // 4 hours of work, so the rose dies 6 hours after the stop, at 7pm.
    const state = worked(sam, '2026-09-10T09:00:00+01:00', '2026-09-10T13:00:00+01:00');
    expect(headerAt(state, '2026-09-10T18:59:00+01:00').situation).toBe('worked-today');
    expect(headerAt(state, '2026-09-10T19:00:00+01:00')).toEqual({
      situation: 'plant-died',
      text: 'Your rose has died, Sam. Start working to plant a new one.',
    });
    expect(headerAt(state, '2026-09-10T23:59:00+01:00').situation).toBe('plant-died');
  });

  it('welcomes back just after midnight while the rose is still alive and there is no work yet today', () => {
    // Worked until 10pm, so the rose is alive until 4am.
    const state = worked(sam, '2026-09-09T09:00:00+01:00', '2026-09-09T22:00:00+01:00');
    expect(headerAt(state, '2026-09-10T00:30:00+01:00')).toEqual({
      situation: 'no-work-yet-today',
      text: 'Welcome back, Sam. Your rose is waiting.',
    });
    expect(headerAt(state, '2026-09-10T03:59:00+01:00').situation).toBe('no-work-yet-today');
  });

  it('announces a new day once the rose has died overnight', () => {
    const state = worked(sam, '2026-09-09T09:00:00+01:00', '2026-09-09T22:00:00+01:00');
    expect(headerAt(state, '2026-09-10T04:00:00+01:00')).toEqual({
      situation: 'new-day',
      text: 'New day, Sam. Start a session to plant a new rose.',
    });
    expect(headerAt(state, '2026-09-10T09:00:00+01:00').situation).toBe('new-day');
  });

  it('announces a new day when the rose died the evening before', () => {
    // 4 hours of work, so the rose died at 7pm yesterday.
    const state = worked(sam, '2026-09-09T09:00:00+01:00', '2026-09-09T13:00:00+01:00');
    expect(headerAt(state, '2026-09-09T20:00:00+01:00').situation).toBe('plant-died');
    expect(headerAt(state, '2026-09-10T00:01:00+01:00')).toEqual({
      situation: 'new-day',
      text: 'New day, Sam. Start a session to plant a new rose.',
    });
  });

  it("counts today's share just after midnight while a session runs across it", () => {
    const running = start(sam, '2026-09-09T23:00:00+01:00');
    expect(headerAt(running, '2026-09-09T23:30:00+01:00').text).toBe('Sam, you have worked 30m today');
    expect(headerAt(running, '2026-09-10T00:30:00+01:00')).toEqual({
      situation: 'worked-today',
      text: 'Sam, you have worked 30m today',
    });
  });

  it('shows the count from the moment a session starts, whatever happened before it', () => {
    // Worked this morning and the rose died this afternoon; a new session has just started.
    let state = worked(sam, '2026-09-10T06:00:00+01:00', '2026-09-10T08:00:00+01:00');
    expect(headerAt(state, '2026-09-10T15:00:00+01:00').situation).toBe('plant-died');
    state = start(state, '2026-09-10T15:00:00+01:00');
    expect(headerAt(state, '2026-09-10T15:00:00+01:00')).toEqual({
      situation: 'worked-today',
      text: 'Sam, you have worked 2h 0m today',
    });
  });

  it('reads without a gap when no name has been chosen yet', () => {
    expect(headerAt(initialState, '2026-09-10T09:00:00+01:00').text).toBe(
      'Welcome. Start a session to plant your first rose.',
    );
    const running = start(initialState, '2026-09-10T09:00:00+01:00');
    expect(headerAt(running, '2026-09-10T11:14:00+01:00').text).toBe('You have worked 2h 14m today');
    expect(headerAt(running, '2026-09-10T14:40:00+01:00').text).toBe(
      'Congratulations, you have worked 5h 40m today',
    );
    const died = worked(initialState, '2026-09-09T09:00:00+01:00', '2026-09-09T13:00:00+01:00');
    expect(headerAt(died, '2026-09-09T20:00:00+01:00').text).toBe(
      'Your rose has died. Start working to plant a new one.',
    );
    expect(headerAt(died, '2026-09-10T09:00:00+01:00').text).toBe('New day. Start a session to plant a new rose.');
    const alive = worked(initialState, '2026-09-09T09:00:00+01:00', '2026-09-09T22:00:00+01:00');
    expect(headerAt(alive, '2026-09-10T00:30:00+01:00').text).toBe('Welcome back. Your rose is waiting.');
  });
});

describe('the display name', () => {
  it('is null until it is chosen, which is how the app knows to show onboarding', () => {
    expect(initialState.displayName).toBeNull();
    expect(sam.displayName).toBe('Sam');
  });

  it('is kept trimmed', () => {
    expect(named(initialState, '  Sam ').displayName).toBe('Sam');
  });

  it('can never be empty', () => {
    expect(named(initialState, '   ')).toBe(initialState);
    expect(named(sam, '')).toBe(sam);
  });

  it('can be changed later, and the header follows', () => {
    const renamed = named(sam, 'Samantha');
    expect(renamed.displayName).toBe('Samantha');
    expect(headerAt(renamed, '2026-09-10T09:00:00+01:00').text).toBe(
      'Welcome, Samantha. Start a session to plant your first rose.',
    );
  });

  it('changes nothing when set to what it already is', () => {
    expect(named(sam, 'Sam')).toBe(sam);
  });

  it('is saved with the history', () => {
    const restored = JSON.parse(JSON.stringify(sam)) as State;
    expect(restored.displayName).toBe('Sam');
    expect(headerAt(restored, '2026-09-10T09:00:00+01:00')).toEqual(headerAt(sam, '2026-09-10T09:00:00+01:00'));
  });
});
