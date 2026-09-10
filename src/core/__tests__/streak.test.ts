/**
 * Streak tests: days in a row with any work, however little. Like the other core tests they
 * reach the core only through its entry point, pass every time in explicitly and write each one
 * with its UTC offset.
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
const end = (state: State, when: string): State => apply(state, { type: 'end', at: at(when) });
const streakAt = (state: State, when: string): number => view(state, at(when), LONDON).streak;

/** An ended session from `from` to `to` on top of `state`. */
const worked = (state: State, from: string, to: string): State => end(start(state, from), to);

/** An hour of work on the morning of `date`, on top of `state`. */
const workedOn = (state: State, date: string): State =>
  worked(state, `${date}T09:00:00+01:00`, `${date}T10:00:00+01:00`);

describe('the streak', () => {
  it('is 0 before any work', () => {
    expect(streakAt(initialState, '2026-09-10T09:00:00+01:00')).toBe(0);
  });

  it('is never stored', () => {
    const state = workedOn(initialState, '2026-09-10');
    expect(JSON.stringify(state)).not.toContain('streak');
  });

  it('builds over consecutive days', () => {
    const one = workedOn(initialState, '2026-09-08');
    expect(streakAt(one, '2026-09-08T12:00:00+01:00')).toBe(1);
    const two = workedOn(one, '2026-09-09');
    expect(streakAt(two, '2026-09-09T12:00:00+01:00')).toBe(2);
    const three = workedOn(two, '2026-09-10');
    expect(streakAt(three, '2026-09-10T12:00:00+01:00')).toBe(3);
  });

  it('breaks when a whole day passes with no work', () => {
    const state = workedOn(workedOn(initialState, '2026-09-08'), '2026-09-09');
    // Nothing on the 10th. By the 11th the streak is gone...
    expect(streakAt(state, '2026-09-11T09:00:00+01:00')).toBe(0);
    // ...and working on the 11th starts a new one from 1.
    expect(streakAt(workedOn(state, '2026-09-11'), '2026-09-11T12:00:00+01:00')).toBe(1);
  });

  it('counts a 2-minute session', () => {
    const state = worked(
      workedOn(initialState, '2026-09-09'),
      '2026-09-10T23:50:00+01:00',
      '2026-09-10T23:52:00+01:00',
    );
    expect(streakAt(state, '2026-09-10T23:55:00+01:00')).toBe(2);
  });

  it('counts a session that crosses midnight for both days', () => {
    const state = worked(initialState, '2026-09-10T23:00:00+01:00', '2026-09-11T01:00:00+01:00');
    expect(streakAt(state, '2026-09-11T09:00:00+01:00')).toBe(2);
  });

  it('counts today as soon as a running session crosses midnight', () => {
    const state = start(initialState, '2026-09-10T23:30:00+01:00');
    expect(streakAt(state, '2026-09-10T23:59:00+01:00')).toBe(1);
    expect(streakAt(state, '2026-09-11T00:30:00+01:00')).toBe(2);
  });

  it('keeps going through a day that has no work yet', () => {
    const state = workedOn(workedOn(initialState, '2026-09-09'), '2026-09-10');
    // Worked yesterday, not yet today: the streak stands until midnight.
    expect(streakAt(state, '2026-09-11T09:00:00+01:00')).toBe(2);
    expect(streakAt(state, '2026-09-11T23:59:00+01:00')).toBe(2);
    // Working today extends it.
    expect(streakAt(workedOn(state, '2026-09-11'), '2026-09-11T12:00:00+01:00')).toBe(3);
  });

  it('counts today once there is any work today, including in a running session', () => {
    const yesterday = workedOn(initialState, '2026-09-09');
    const running = start(yesterday, '2026-09-10T09:00:00+01:00');
    expect(streakAt(running, '2026-09-10T09:00:00+01:00')).toBe(1);
    expect(streakAt(running, '2026-09-10T09:01:00+01:00')).toBe(2);
  });

  it('does not count a session that measured no time', () => {
    // The clock was set back between Start and End, so the day has a session but no work.
    const state = worked(initialState, '2026-09-10T09:00:00+01:00', '2026-09-10T08:00:00+01:00');
    expect(streakAt(state, '2026-09-10T12:00:00+01:00')).toBe(0);
  });
});
