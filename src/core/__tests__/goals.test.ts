/**
 * Goal tests: creating goals, counting work only while a goal is active and before its deadline
 * ends, achieved and missed, and the celebration. Like the other core tests they reach the core
 * only through its entry point, pass every time in explicitly and write each one with its UTC
 * offset.
 */
import { apply, formatShortDate, initialState, view, type Action, type GoalView, type State } from '@/core';

const LONDON = 'Europe/London';
const TOKYO = 'Asia/Tokyo';
const HOUR = 60 * 60_000;
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

/** An ended session from `from` to `to` on top of `state`. */
const worked = (state: State, from: string, to: string): State => end(start(state, from), to);

type GoalDetails = Partial<Omit<Extract<Action, { type: 'create-goal' }>, 'type' | 'at'>>;

/** Creates a goal at `when`: "Finals", 100 hours by 24 October 2026 unless told otherwise. */
const addGoal = (state: State, when: string, details: GoalDetails = {}): State =>
  apply(state, {
    type: 'create-goal',
    at: at(when),
    goalId: 'finals',
    name: 'Finals',
    target: 100 * HOUR,
    deadline: '2026-10-24',
    timeZone: LONDON,
    ...details,
  });
const switchOff = (state: State, when: string, goalId = 'finals'): State =>
  apply(state, { type: 'switch-goal', at: at(when), goalId, active: false });
const switchOn = (state: State, when: string, goalId = 'finals'): State =>
  apply(state, { type: 'switch-goal', at: at(when), goalId, active: true });
const celebrate = (state: State, when: string, goalId = 'finals'): State =>
  apply(state, { type: 'celebrate-goal', at: at(when), goalId });

const goalsAt = (state: State, when: string): GoalView[] => view(state, at(when), LONDON).goals;
const goalAt = (state: State, when: string, goalId = 'finals'): GoalView => {
  const goal = goalsAt(state, when).find((candidate) => candidate.id === goalId);
  if (!goal) throw new Error(`No goal ${goalId} in the view.`);
  return goal;
};

describe('creating a goal', () => {
  it('stores the name, target and deadline, active from its creation time, and shows it fresh', () => {
    const state = addGoal(initialState, '2026-09-10T09:00:00+01:00');
    expect(state.goals).toEqual([
      {
        id: 'finals',
        name: 'Finals',
        target: 100 * HOUR,
        deadline: '2026-10-24',
        timeZone: LONDON,
        createdAt: at('2026-09-10T09:00:00+01:00'),
        switches: [],
        celebratedAt: null,
      },
    ]);
    expect(goalAt(state, '2026-09-10T09:00:00+01:00')).toEqual({
      id: 'finals',
      name: 'Finals',
      target: 100 * HOUR,
      deadline: '2026-10-24',
      endsAt: at('2026-10-25T00:00:00+01:00'),
      createdAt: at('2026-09-10T09:00:00+01:00'),
      workTime: 0,
      status: 'active',
      achievedAt: null,
      achievesAt: null,
      celebratedAt: null,
    });
  });

  it('ends at the midnight that closes the deadline date, in the zone it was created in', () => {
    const state = addGoal(initialState, '2026-09-10T09:00:00+01:00', { deadline: '2026-10-26', timeZone: TOKYO });
    expect(goalAt(state, '2026-09-10T09:00:00+01:00').endsAt).toBe(at('2026-10-27T00:00:00+09:00'));
  });

  it('trims the name and lists goals oldest first', () => {
    let state = addGoal(initialState, '2026-09-10T09:00:00+01:00', { name: '  Finals ' });
    state = addGoal(state, '2026-09-10T10:00:00+01:00', { goalId: 'side', name: 'Side project' });
    expect(goalsAt(state, '2026-09-10T11:00:00+01:00').map((goal) => goal.name)).toEqual(['Finals', 'Side project']);
  });

  it('ignores a goal with no name, no target or a deadline that is not a date', () => {
    expect(addGoal(initialState, '2026-09-10T09:00:00+01:00', { name: '   ' })).toBe(initialState);
    expect(addGoal(initialState, '2026-09-10T09:00:00+01:00', { target: 0 })).toBe(initialState);
    expect(addGoal(initialState, '2026-09-10T09:00:00+01:00', { target: -HOUR })).toBe(initialState);
    expect(addGoal(initialState, '2026-09-10T09:00:00+01:00', { deadline: '24 Oct' })).toBe(initialState);
    expect(addGoal(initialState, '2026-09-10T09:00:00+01:00', { deadline: '2026-02-30' })).toBe(initialState);
  });

  it('does not create the same goal twice when the action is retried', () => {
    const once = addGoal(initialState, '2026-09-10T09:00:00+01:00');
    expect(addGoal(once, '2026-09-10T09:00:01+01:00')).toBe(once);
  });
});

describe('counting work', () => {
  it("gains 5h from a session that had already run 5h when the goal was added (the spec's example)", () => {
    let state = start(initialState, '2026-09-10T09:00:00+01:00');
    state = addGoal(state, '2026-09-10T14:00:00+01:00');
    expect(goalAt(state, '2026-09-10T19:00:00+01:00').workTime).toBe(5 * HOUR);
    expect(view(state, at('2026-09-10T19:00:00+01:00'), LONDON).todayWorkTime).toBe(10 * HOUR);
  });

  it('counts the running session live, minute by minute', () => {
    let state = addGoal(initialState, '2026-09-10T09:00:00+01:00');
    state = start(state, '2026-09-10T09:00:00+01:00');
    expect(goalAt(state, '2026-09-10T09:01:00+01:00').workTime).toBe(MINUTE);
    expect(goalAt(state, '2026-09-10T11:30:00+01:00').workTime).toBe(2.5 * HOUR);
  });

  it('does not count paused time', () => {
    let state = addGoal(initialState, '2026-09-10T09:00:00+01:00');
    state = start(state, '2026-09-10T09:00:00+01:00');
    state = pause(state, '2026-09-10T10:00:00+01:00');
    state = resume(state, '2026-09-10T11:00:00+01:00');
    expect(goalAt(state, '2026-09-10T12:00:00+01:00').workTime).toBe(2 * HOUR);
  });

  it('adds up ended sessions and the running one', () => {
    let state = addGoal(initialState, '2026-09-10T08:00:00+01:00');
    state = worked(state, '2026-09-10T09:00:00+01:00', '2026-09-10T11:00:00+01:00');
    state = worked(state, '2026-09-11T09:00:00+01:00', '2026-09-11T10:30:00+01:00');
    state = start(state, '2026-09-12T09:00:00+01:00');
    expect(goalAt(state, '2026-09-12T10:00:00+01:00').workTime).toBe(4.5 * HOUR);
  });

  it('counts a session that was auto-ended only up to the auto-end', () => {
    let state = addGoal(initialState, '2026-09-10T08:00:00+01:00');
    state = start(state, '2026-09-10T09:00:00+01:00');
    state = pause(state, '2026-09-10T10:00:00+01:00');
    expect(goalAt(state, '2026-09-10T20:00:00+01:00').workTime).toBe(HOUR);
  });
});

describe('switching a goal off and on', () => {
  it('keeps what it earned when switched off mid-session, and gains nothing while dormant', () => {
    let state = addGoal(initialState, '2026-09-10T09:00:00+01:00');
    state = start(state, '2026-09-10T09:00:00+01:00');
    state = switchOff(state, '2026-09-10T11:00:00+01:00');
    const dormant = goalAt(state, '2026-09-10T13:00:00+01:00');
    expect(dormant.workTime).toBe(2 * HOUR);
    expect(dormant.status).toBe('dormant');
    expect(dormant.achievesAt).toBeNull();
  });

  it('gains nothing from work done while it was switched off', () => {
    let state = addGoal(initialState, '2026-09-10T08:00:00+01:00');
    state = switchOff(state, '2026-09-10T08:30:00+01:00');
    state = worked(state, '2026-09-10T09:00:00+01:00', '2026-09-10T12:00:00+01:00');
    expect(goalAt(state, '2026-09-10T13:00:00+01:00')).toMatchObject({ workTime: 0, status: 'dormant' });
  });

  it('counts again from the moment it is switched back on', () => {
    let state = addGoal(initialState, '2026-09-10T08:00:00+01:00');
    state = start(state, '2026-09-10T09:00:00+01:00');
    state = switchOff(state, '2026-09-10T10:00:00+01:00');
    state = switchOn(state, '2026-09-10T12:00:00+01:00');
    const goal = goalAt(state, '2026-09-10T13:00:00+01:00');
    expect(goal.workTime).toBe(2 * HOUR);
    expect(goal.status).toBe('active');
    expect(state.goals[0].switches).toEqual([
      { at: at('2026-09-10T10:00:00+01:00'), active: false },
      { at: at('2026-09-10T12:00:00+01:00'), active: true },
    ]);
  });

  it('changes nothing when switched to where it already is, or when the goal does not exist', () => {
    const state = addGoal(initialState, '2026-09-10T08:00:00+01:00');
    expect(switchOn(state, '2026-09-10T09:00:00+01:00')).toBe(state);
    const off = switchOff(state, '2026-09-10T09:00:00+01:00');
    expect(switchOff(off, '2026-09-10T10:00:00+01:00')).toBe(off);
    expect(switchOff(state, '2026-09-10T09:00:00+01:00', 'nope')).toBe(state);
  });

  it('never puts a flick before the one before it when the clock is set back', () => {
    let state = addGoal(initialState, '2026-09-10T09:00:00+01:00');
    state = switchOff(state, '2026-09-10T10:00:00+01:00');
    state = switchOn(state, '2026-09-10T09:30:00+01:00');
    expect(state.goals[0].switches[1].at).toBe(at('2026-09-10T10:00:00+01:00'));
  });

  it('lets two active goals both gain from the same work', () => {
    let state = addGoal(initialState, '2026-09-10T08:00:00+01:00');
    state = addGoal(state, '2026-09-10T08:00:00+01:00', { goalId: 'side', name: 'Side project', target: 20 * HOUR });
    state = worked(state, '2026-09-10T09:00:00+01:00', '2026-09-10T12:00:00+01:00');
    const goals = goalsAt(state, '2026-09-10T13:00:00+01:00');
    expect(goals.map((goal) => goal.workTime)).toEqual([3 * HOUR, 3 * HOUR]);
  });

  it('switches one goal without touching another', () => {
    let state = addGoal(initialState, '2026-09-10T08:00:00+01:00');
    state = addGoal(state, '2026-09-10T08:00:00+01:00', { goalId: 'side', name: 'Side project' });
    state = switchOff(state, '2026-09-10T08:30:00+01:00', 'side');
    state = worked(state, '2026-09-10T09:00:00+01:00', '2026-09-10T12:00:00+01:00');
    const goals = goalsAt(state, '2026-09-10T13:00:00+01:00');
    expect(goals.map((goal) => [goal.status, goal.workTime])).toEqual([
      ['active', 3 * HOUR],
      ['dormant', 0],
    ]);
  });
});

describe('achieved', () => {
  it('is achieved at the exact moment the running session reaches the target', () => {
    let state = addGoal(initialState, '2026-09-10T08:00:00+01:00', { target: 2 * HOUR });
    state = start(state, '2026-09-10T09:00:00+01:00');
    expect(goalAt(state, '2026-09-10T10:59:00+01:00')).toMatchObject({
      status: 'active',
      achievedAt: null,
      achievesAt: at('2026-09-10T11:00:00+01:00'),
    });
    expect(goalAt(state, '2026-09-10T11:00:00+01:00')).toMatchObject({
      status: 'achieved',
      workTime: 2 * HOUR,
      achievedAt: at('2026-09-10T11:00:00+01:00'),
      achievesAt: null,
    });
  });

  it('pins the moment inside an earlier session once the target is passed', () => {
    let state = addGoal(initialState, '2026-09-10T08:00:00+01:00', { target: 3 * HOUR });
    state = worked(state, '2026-09-10T09:00:00+01:00', '2026-09-10T11:00:00+01:00');
    state = worked(state, '2026-09-11T09:00:00+01:00', '2026-09-11T13:00:00+01:00');
    expect(goalAt(state, '2026-09-12T09:00:00+01:00')).toMatchObject({
      status: 'achieved',
      workTime: 6 * HOUR,
      achievedAt: at('2026-09-11T10:00:00+01:00'),
    });
  });

  it('stays achieved after the deadline passes', () => {
    let state = addGoal(initialState, '2026-09-10T08:00:00+01:00', { target: HOUR, deadline: '2026-09-10' });
    state = worked(state, '2026-09-10T09:00:00+01:00', '2026-09-10T10:00:00+01:00');
    expect(goalAt(state, '2026-09-20T09:00:00+01:00').status).toBe('achieved');
  });

  it('gives no achievement time while paused, and one that the deadline would cut off is left out', () => {
    let state = addGoal(initialState, '2026-09-10T08:00:00+01:00', { target: 10 * HOUR, deadline: '2026-09-10' });
    state = start(state, '2026-09-10T20:00:00+01:00');
    expect(goalAt(state, '2026-09-10T21:00:00+01:00').achievesAt).toBeNull();
    state = pause(state, '2026-09-10T21:00:00+01:00');
    expect(goalAt(state, '2026-09-10T21:30:00+01:00').achievesAt).toBeNull();
  });
});

describe('missed', () => {
  it('is missed once the deadline date has ended, and work after that does not count', () => {
    let state = addGoal(initialState, '2026-09-10T08:00:00+01:00', { target: 5 * HOUR, deadline: '2026-09-10' });
    state = worked(state, '2026-09-10T09:00:00+01:00', '2026-09-10T11:00:00+01:00');
    expect(goalAt(state, '2026-09-10T23:59:00+01:00')).toMatchObject({ status: 'active', workTime: 2 * HOUR });
    expect(goalAt(state, '2026-09-11T00:00:00+01:00')).toMatchObject({ status: 'missed', workTime: 2 * HOUR });
    state = worked(state, '2026-09-11T09:00:00+01:00', '2026-09-11T13:00:00+01:00');
    expect(goalAt(state, '2026-09-11T14:00:00+01:00')).toMatchObject({ status: 'missed', workTime: 2 * HOUR });
  });

  it('counts a session that crosses the deadline midnight only up to midnight', () => {
    let state = addGoal(initialState, '2026-09-10T08:00:00+01:00', { target: 5 * HOUR, deadline: '2026-09-10' });
    state = start(state, '2026-09-10T22:00:00+01:00');
    expect(goalAt(state, '2026-09-11T02:00:00+01:00')).toMatchObject({ status: 'missed', workTime: 2 * HOUR });
  });

  it('is missed rather than dormant when switched off at the deadline', () => {
    let state = addGoal(initialState, '2026-09-10T08:00:00+01:00', { deadline: '2026-09-10' });
    state = switchOff(state, '2026-09-10T09:00:00+01:00');
    expect(goalAt(state, '2026-09-11T09:00:00+01:00').status).toBe('missed');
  });
});

describe('the celebration', () => {
  it('is recorded once, and never for a goal that does not exist', () => {
    let state = addGoal(initialState, '2026-09-10T08:00:00+01:00', { target: HOUR });
    state = worked(state, '2026-09-10T09:00:00+01:00', '2026-09-10T10:00:00+01:00');
    expect(goalAt(state, '2026-09-10T10:00:00+01:00').celebratedAt).toBeNull();
    const celebrated = celebrate(state, '2026-09-10T10:05:00+01:00');
    expect(goalAt(celebrated, '2026-09-10T10:06:00+01:00').celebratedAt).toBe(at('2026-09-10T10:05:00+01:00'));
    expect(celebrate(celebrated, '2026-09-10T10:07:00+01:00')).toBe(celebrated);
    expect(celebrate(state, '2026-09-10T10:05:00+01:00', 'nope')).toBe(state);
  });
});

describe('goals and the rest of the app', () => {
  it('leave the plant and the calendar exactly as they were', () => {
    let state = worked(initialState, '2026-09-10T09:00:00+01:00', '2026-09-10T12:00:00+01:00');
    const before = view(state, at('2026-09-10T13:00:00+01:00'), LONDON);
    state = addGoal(state, '2026-09-10T08:00:00+01:00');
    state = switchOff(state, '2026-09-10T12:30:00+01:00');
    const after = view(state, at('2026-09-10T13:00:00+01:00'), LONDON);
    expect(after.plant).toEqual(before.plant);
    expect(after.calendar).toEqual(before.calendar);
    expect(after.header).toEqual(before.header);
    expect(before.goals).toEqual([]);
  });
});

describe('formatting a deadline', () => {
  it('leaves the year out when it is this year', () => {
    expect(formatShortDate('2026-10-24', '2026-09-10')).toBe('24 Oct');
    expect(formatShortDate('2027-01-05', '2026-09-10')).toBe('5 Jan 2027');
  });
});
