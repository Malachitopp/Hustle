import { initialState, type State } from '@/core';
import { migrate, VERSION } from '@/storage/migrations';

const HOUR = 60 * 60_000;
const at = (iso: string): number => Date.parse(iso);

const session = {
  id: 'abc-123',
  timeZone: 'Europe/London',
  startedAt: at('2026-09-10T22:00:00+01:00'),
  endedAt: at('2026-09-11T02:00:00+01:00'),
  periods: [{ from: at('2026-09-10T22:00:00+01:00'), to: at('2026-09-11T02:00:00+01:00') }],
};

const days = [
  { date: '2026-09-10', workTime: 2 * HOUR },
  { date: '2026-09-11', workTime: 2 * HOUR },
];

const switchesOn = { pauseWarnings: true, streakReminder: true };

/**
 * What every older history ends up as: a guest whose one session, and whose settings, are still
 * to upload, with the default petal colour until the storage carries the chosen one over.
 */
const current: State = {
  displayName: null,
  petalColour: null,
  current: null,
  record: [{ ...session, days }],
  goals: [],
  notificationSwitches: switchesOn,
  account: null,
  pendingUploads: ['abc-123'],
  pendingGoalUploads: [],
  pendingGoalDeletions: [],
  pendingSettingsUpload: true,
  saveProgressOfferedAt: null,
};

const without = (state: object, ...keys: string[]) =>
  Object.fromEntries(Object.entries(state).filter(([key]) => !keys.includes(key)));

/** The same history as a version 8 one, from before goals and settings were backed up. */
const v8 = without(current, 'petalColour', 'pendingGoalUploads', 'pendingGoalDeletions', 'pendingSettingsUpload');

/** As a version 7 one, from before Save your progress had a note in it. */
const v7 = without(v8, 'saveProgressOfferedAt');

describe('migrating a saved history', () => {
  it('adds the split by date, no goals, no display name, the switches on and the upload queues to a version 1 history', () => {
    expect(migrate(1, { current: null, record: [session] })).toEqual(current);
  });

  it('adds no goals, no display name, the switches on and the upload queues to a version 2 history', () => {
    expect(migrate(2, { current: null, record: [{ ...session, days }] })).toEqual(current);
  });

  it('adds no display name, the switches on and the upload queues to a version 3 history, so onboarding asks for a name', () => {
    expect(migrate(3, { current: null, record: [{ ...session, days }], goals: [] })).toEqual(current);
  });

  it('turns both notification switches on and adds the upload queues for a version 4 history', () => {
    const v4 = { displayName: 'Sam', current: null, record: [{ ...session, days }], goals: [] };
    expect(migrate(4, v4)).toEqual({ ...current, displayName: 'Sam' });
  });

  it('makes a version 5 history a guest with every session still to upload', () => {
    const v5 = {
      displayName: 'Sam',
      current: null,
      record: [
        { ...session, days },
        { ...session, id: 'def-456', days },
      ],
      goals: [],
      notificationSwitches: { pauseWarnings: false, streakReminder: true },
    };
    expect(migrate(5, v5)).toEqual({
      ...v5,
      account: null,
      pendingUploads: ['abc-123', 'def-456'],
      saveProgressOfferedAt: null,
      petalColour: null,
      pendingGoalUploads: [],
      pendingGoalDeletions: [],
      pendingSettingsUpload: true,
    });
  });

  it('marks a version 6 account as still to restore, and leaves a guest alone', () => {
    const signedIn = { ...v7, account: { userId: 'user-1', provider: 'apple' } };
    expect(migrate(6, signedIn)).toEqual({
      ...current,
      account: { userId: 'user-1', provider: 'apple', restored: false },
    });
    expect(migrate(6, v7)).toEqual(current);
  });

  it('leaves Save your progress still to be offered for a version 7 history', () => {
    expect(migrate(7, v7)).toEqual(current);
  });

  it('puts every goal and the settings of a version 8 history on the upload queues', () => {
    const goal = {
      id: 'finals',
      name: 'Finals',
      target: 100 * HOUR,
      deadline: '2026-10-24',
      timeZone: 'Europe/London',
      createdAt: at('2026-09-10T08:00:00+01:00'),
      switches: [],
      celebratedAt: null,
    };
    const withGoals = { ...v8, displayName: 'Sam', goals: [goal, { ...goal, id: 'exams' }] };
    expect(migrate(8, withGoals)).toEqual({
      ...current,
      displayName: 'Sam',
      goals: withGoals.goals,
      pendingGoalUploads: ['finals', 'exams'],
    });
    expect(migrate(8, v8)).toEqual(current);
  });

  it('returns a history in the current shape as it is', () => {
    const state: State = initialState;
    expect(migrate(VERSION, state)).toBe(state);
  });

  it('refuses a history from a version it does not know', () => {
    expect(migrate(VERSION + 1, initialState)).toBeNull();
    expect(migrate(0, initialState)).toBeNull();
    expect(migrate(1.5, initialState)).toBeNull();
  });
});
