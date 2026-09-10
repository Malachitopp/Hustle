/**
 * Plant tests: growth, wilting, death and replanting, and the look for each band of life. Like
 * the other core tests they reach the core only through its entry point, pass every time in
 * explicitly and write each one with its UTC offset.
 */
import { apply, initialState, lookFor, view, type Look, type State } from '@/core';

const LONDON = 'Europe/London';
const MINUTE = 60_000;

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
const resume = (state: State, when: string): State => apply(state, { type: 'resume', at: at(when) });
const end = (state: State, when: string): State => apply(state, { type: 'end', at: at(when) });
const plantAt = (state: State, when: string) => view(state, at(when), LONDON).plant;

/** An ended session from `from` to `to` on top of `state`. */
const worked = (state: State, from: string, to: string): State => end(start(state, from), to);

describe('before the first session', () => {
  it('there is no plant, only dirt', () => {
    expect(plantAt(initialState, '2026-09-10T09:00:00+01:00')).toEqual({ state: 'none' });
  });
});

describe('growth', () => {
  const running = start(initialState, '2026-09-10T09:00:00+01:00');

  it('plants a new rose at 0% the moment the first session starts', () => {
    expect(plantAt(running, '2026-09-10T09:00:00+01:00')).toEqual({
      state: 'alive',
      life: 0,
      look: 'wilting',
      plantedAt: at('2026-09-10T09:00:00+01:00'),
      diesAt: null,
    });
  });

  it('adds 10% life per hour of work', () => {
    expect(plantAt(running, '2026-09-10T10:00:00+01:00')).toMatchObject({ life: 10 });
    expect(plantAt(running, '2026-09-10T11:30:00+01:00')).toMatchObject({ life: 25 });
    expect(plantAt(running, '2026-09-10T15:24:00+01:00')).toMatchObject({ life: 64 });
  });

  it('reaches full bloom at 10 hours and never goes above 100%', () => {
    expect(plantAt(running, '2026-09-10T19:00:00+01:00')).toMatchObject({ life: 100, look: 'full-bloom' });
    expect(plantAt(running, '2026-09-11T03:00:00+01:00')).toMatchObject({ life: 100, look: 'full-bloom' });
  });

  it('has no death time while a session is running', () => {
    expect(plantAt(running, '2026-09-10T12:00:00+01:00')).toMatchObject({ diesAt: null });
  });

  it('carries life over from one session to the next', () => {
    let state = worked(initialState, '2026-09-10T09:00:00+01:00', '2026-09-10T13:00:00+01:00');
    state = start(state, '2026-09-10T14:00:00+01:00');
    // 40% at 1pm, wilted for an hour of the six to 33.33%, then two more hours of work.
    expect(plantAt(state, '2026-09-10T16:00:00+01:00').state).toBe('alive');
    expect((plantAt(state, '2026-09-10T16:00:00+01:00') as { life: number }).life).toBeCloseTo(53.333, 3);
  });
});

describe('wilting', () => {
  it('falls in a straight line to 0% exactly 6 hours after End, from full bloom', () => {
    const state = worked(initialState, '2026-09-10T08:00:00+01:00', '2026-09-10T18:00:00+01:00');
    expect(plantAt(state, '2026-09-10T18:00:00+01:00')).toEqual({
      state: 'alive',
      life: 100,
      look: 'full-bloom',
      plantedAt: at('2026-09-10T08:00:00+01:00'),
      diesAt: at('2026-09-11T00:00:00+01:00'),
    });
    expect(plantAt(state, '2026-09-10T21:00:00+01:00')).toMatchObject({ life: 50, look: 'bud' });
    expect(plantAt(state, '2026-09-10T23:59:00+01:00')).toMatchObject({ state: 'alive', look: 'wilting' });
    expect(plantAt(state, '2026-09-11T00:00:00+01:00')).toMatchObject({ state: 'dead' });
  });

  it('takes the same 6 hours from any level', () => {
    // 3 hours of work: 30%.
    const fromThirty = worked(initialState, '2026-09-10T09:00:00+01:00', '2026-09-10T12:00:00+01:00');
    expect(plantAt(fromThirty, '2026-09-10T15:00:00+01:00')).toMatchObject({ life: 15 });
    expect(plantAt(fromThirty, '2026-09-10T17:59:00+01:00')).toMatchObject({ state: 'alive' });
    expect(plantAt(fromThirty, '2026-09-10T18:00:00+01:00')).toMatchObject({ state: 'dead' });

    // 45 minutes of work: 7.5%.
    const fromSeven = worked(initialState, '2026-09-10T09:00:00+01:00', '2026-09-10T09:45:00+01:00');
    expect(plantAt(fromSeven, '2026-09-10T12:45:00+01:00')).toMatchObject({ life: 3.75 });
    expect(plantAt(fromSeven, '2026-09-10T15:44:00+01:00')).toMatchObject({ state: 'alive' });
    expect(plantAt(fromSeven, '2026-09-10T15:45:00+01:00')).toMatchObject({ state: 'dead' });

    // A few seconds of work: barely any life, and still 6 hours.
    const fromNothing = worked(initialState, '2026-09-10T09:00:00+01:00', '2026-09-10T09:00:03+01:00');
    expect(plantAt(fromNothing, '2026-09-10T12:00:00+01:00')).toMatchObject({
      state: 'alive',
      diesAt: at('2026-09-10T15:00:03+01:00'),
    });
    expect(plantAt(fromNothing, '2026-09-10T15:00:03+01:00')).toMatchObject({ state: 'dead' });
  });

  it('starts at a pause, not just at End', () => {
    const state = pause(start(initialState, '2026-09-10T09:00:00+01:00'), '2026-09-10T13:00:00+01:00');
    expect(plantAt(state, '2026-09-10T13:00:00+01:00')).toMatchObject({
      life: 40,
      diesAt: at('2026-09-10T19:00:00+01:00'),
    });
    expect(plantAt(state, '2026-09-10T16:00:00+01:00')).toMatchObject({ life: 20 });
  });

  it('counts from the end of the last running period when End is pressed while paused', () => {
    let state = pause(start(initialState, '2026-09-10T09:00:00+01:00'), '2026-09-10T13:00:00+01:00');
    state = end(state, '2026-09-10T14:00:00+01:00');
    const plant = plantAt(state, '2026-09-10T14:00:00+01:00');
    expect(plant).toMatchObject({ state: 'alive', diesAt: at('2026-09-10T19:00:00+01:00') });
    expect((plant as { life: number }).life).toBeCloseTo(33.333, 3);
  });

  it('dies at the same instant a paused session ends by itself', () => {
    const state = pause(start(initialState, '2026-09-10T09:00:00+01:00'), '2026-09-10T14:00:00+01:00');
    const v = view(state, at('2026-09-10T20:00:00+01:00'), LONDON);
    expect(v.session).toEqual({ state: 'idle' });
    expect(v.plant).toMatchObject({ state: 'dead', diedAt: at('2026-09-10T20:00:00+01:00') });
    const before = view(state, at('2026-09-10T19:59:00+01:00'), LONDON);
    expect(before.session).toMatchObject({ state: 'paused', autoEndsAt: at('2026-09-10T20:00:00+01:00') });
    expect(before.plant).toMatchObject({ state: 'alive', diesAt: at('2026-09-10T20:00:00+01:00') });
  });
});

describe('working again before 0%', () => {
  it('keeps the same plant and grows it from where the wilt left it', () => {
    // 40% at the pause; 3 of the 6 hours later it is at 20%; an hour of work takes it to 30%.
    let state = pause(start(initialState, '2026-09-10T09:00:00+01:00'), '2026-09-10T13:00:00+01:00');
    state = resume(state, '2026-09-10T16:00:00+01:00');
    expect(plantAt(state, '2026-09-10T16:00:00+01:00')).toEqual({
      state: 'alive',
      life: 20,
      look: 'drooping',
      plantedAt: at('2026-09-10T09:00:00+01:00'),
      diesAt: null,
    });
    expect(plantAt(state, '2026-09-10T17:00:00+01:00')).toMatchObject({ life: 30 });
  });

  it('keeps the same plant across a new session started before it died', () => {
    let state = worked(initialState, '2026-09-10T09:00:00+01:00', '2026-09-10T12:00:00+01:00');
    state = start(state, '2026-09-10T17:59:00+01:00');
    expect(plantAt(state, '2026-09-10T17:59:00+01:00')).toMatchObject({
      state: 'alive',
      plantedAt: at('2026-09-10T09:00:00+01:00'),
    });
    expect((plantAt(state, '2026-09-10T17:59:00+01:00') as { life: number }).life).toBeCloseTo(30 / 360, 6);
  });

  it('keeps the plant when a pause is resumed just before the auto-end', () => {
    let state = pause(start(initialState, '2026-09-10T09:00:00+01:00'), '2026-09-10T14:00:00+01:00');
    state = resume(state, '2026-09-10T19:59:00+01:00');
    expect(plantAt(state, '2026-09-10T20:30:00+01:00')).toMatchObject({
      state: 'alive',
      plantedAt: at('2026-09-10T09:00:00+01:00'),
    });
  });
});

describe('death and a new plant', () => {
  const ended = worked(initialState, '2026-09-10T09:00:00+01:00', '2026-09-10T13:00:00+01:00');

  it('leaves the dead plant on screen with the moment it died', () => {
    expect(plantAt(ended, '2026-09-11T09:00:00+01:00')).toEqual({
      state: 'dead',
      life: 0,
      look: 'dead',
      plantedAt: at('2026-09-10T09:00:00+01:00'),
      diedAt: at('2026-09-10T19:00:00+01:00'),
    });
  });

  it('plants a new one at 0% the moment the next session starts', () => {
    const state = start(ended, '2026-09-11T09:00:00+01:00');
    expect(plantAt(state, '2026-09-11T09:00:00+01:00')).toEqual({
      state: 'alive',
      life: 0,
      look: 'wilting',
      plantedAt: at('2026-09-11T09:00:00+01:00'),
      diesAt: null,
    });
    expect(plantAt(state, '2026-09-11T10:00:00+01:00')).toMatchObject({ life: 10 });
  });

  it('is killed by a pause left for 6 hours, and the next session plants a new one', () => {
    let state = pause(start(initialState, '2026-09-10T09:00:00+01:00'), '2026-09-10T14:00:00+01:00');
    expect(plantAt(state, '2026-09-10T20:00:00+01:00')).toMatchObject({
      state: 'dead',
      diedAt: at('2026-09-10T20:00:00+01:00'),
    });
    // The session ended by itself at 8pm, so Resume does nothing and Start plants afresh.
    expect(resume(state, '2026-09-10T21:00:00+01:00').current).toBeNull();
    state = start(state, '2026-09-10T21:00:00+01:00');
    expect(plantAt(state, '2026-09-10T21:00:00+01:00')).toMatchObject({
      state: 'alive',
      life: 0,
      plantedAt: at('2026-09-10T21:00:00+01:00'),
    });
  });

  it('replays several lives from the record to find the current plant', () => {
    let state = worked(initialState, '2026-09-08T09:00:00+01:00', '2026-09-08T19:00:00+01:00');
    state = worked(state, '2026-09-09T09:00:00+01:00', '2026-09-09T10:00:00+01:00');
    state = worked(state, '2026-09-09T12:00:00+01:00', '2026-09-09T13:00:00+01:00');
    // The plant from the 8th died at 1am on the 9th. The one planted at 9am on the 9th reached
    // 10%, wilted to 6.67% by noon, and reached 16.67% at 1pm.
    const plant = plantAt(state, '2026-09-09T13:00:00+01:00');
    expect(plant).toMatchObject({ state: 'alive', plantedAt: at('2026-09-09T09:00:00+01:00') });
    expect((plant as { life: number }).life).toBeCloseTo(16.667, 3);
  });
});

describe('the look', () => {
  it('covers a band of life for each alive look', () => {
    const cases: [number, Look][] = [
      [0, 'wilting'],
      [19.99, 'wilting'],
      [20, 'drooping'],
      [39.99, 'drooping'],
      [40, 'bud'],
      [59.99, 'bud'],
      [60, 'opening'],
      [79.99, 'opening'],
      [80, 'full-bloom'],
      [100, 'full-bloom'],
    ];
    for (const [life, look] of cases) expect(lookFor(life)).toBe(look);
  });

  it('changes as the plant grows and again as it wilts', () => {
    const running = start(initialState, '2026-09-10T09:00:00+01:00');
    expect(plantAt(running, '2026-09-10T10:59:00+01:00')).toMatchObject({ look: 'wilting' });
    expect(plantAt(running, '2026-09-10T11:00:00+01:00')).toMatchObject({ look: 'drooping' });
    expect(plantAt(running, '2026-09-10T13:00:00+01:00')).toMatchObject({ look: 'bud' });
    expect(plantAt(running, '2026-09-10T15:00:00+01:00')).toMatchObject({ look: 'opening' });
    expect(plantAt(running, '2026-09-10T17:00:00+01:00')).toMatchObject({ look: 'full-bloom' });

    const ended = end(running, '2026-09-10T17:00:00+01:00');
    expect(plantAt(ended, '2026-09-10T18:30:00+01:00')).toMatchObject({ life: 60, look: 'opening' });
    expect(plantAt(ended, '2026-09-10T20:00:00+01:00')).toMatchObject({ life: 40, look: 'bud' });
    expect(plantAt(ended, '2026-09-10T21:30:00+01:00')).toMatchObject({ life: 20, look: 'drooping' });
    expect(plantAt(ended, '2026-09-10T22:00:00+01:00')).toMatchObject({ look: 'wilting' });
    expect(plantAt(ended, '2026-09-10T23:00:00+01:00')).toMatchObject({ look: 'dead' });
  });
});

describe('odd clocks', () => {
  it('treats a session that measured no time as a plant at 0% that still lives 6 hours', () => {
    // The clock was set back between Start and End.
    const state = worked(initialState, '2026-09-10T09:00:00+01:00', '2026-09-10T08:00:00+01:00');
    expect(plantAt(state, '2026-09-10T08:30:00+01:00')).toMatchObject({
      state: 'alive',
      life: 0,
      diesAt: at('2026-09-10T15:00:00+01:00'),
    });
  });

  it('never gives negative life or a plant that dies before its stop', () => {
    const state = worked(initialState, '2026-09-10T09:00:00+01:00', '2026-09-10T12:00:00+01:00');
    // Looked at from before the stop, as if the clock had gone back.
    const plant = plantAt(state, '2026-09-10T11:00:00+01:00');
    expect(plant).toMatchObject({ state: 'alive', life: 30 });
    expect(view(state, at('2026-09-10T11:00:00+01:00') - 40 * MINUTE, LONDON).plant).toMatchObject({
      state: 'alive',
      life: 30,
    });
  });

  it('is unaffected by the phone changing time zone', () => {
    const state = worked(initialState, '2026-09-10T09:00:00+01:00', '2026-09-10T12:00:00+01:00');
    expect(view(state, at('2026-09-10T15:00:00+01:00'), 'Asia/Tokyo').plant).toMatchObject({
      life: 15,
      diesAt: at('2026-09-10T18:00:00+01:00'),
    });
  });
});

describe('nothing about the plant is stored', () => {
  it('the history holds only the sessions and goals, and the plant is the same after a trip through JSON', () => {
    const state = pause(start(initialState, '2026-09-10T09:00:00+01:00'), '2026-09-10T13:00:00+01:00');
    expect(Object.keys(state).sort()).toEqual(['current', 'displayName', 'goals', 'notificationSwitches', 'record']);
    const restored = JSON.parse(JSON.stringify(state)) as State;
    expect(plantAt(restored, '2026-09-10T16:00:00+01:00')).toEqual(plantAt(state, '2026-09-10T16:00:00+01:00'));
  });
});
