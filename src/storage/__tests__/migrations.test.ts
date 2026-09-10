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

describe('migrating a saved history', () => {
  it('adds the split by date, no goals, no display name and the switches on to a version 1 history', () => {
    expect(migrate(1, { current: null, record: [session] })).toEqual({
      displayName: null,
      current: null,
      record: [{ ...session, days }],
      goals: [],
      notificationSwitches: switchesOn,
    });
  });

  it('adds no goals, no display name and the switches on to a version 2 history', () => {
    expect(migrate(2, { current: null, record: [{ ...session, days }] })).toEqual({
      displayName: null,
      current: null,
      record: [{ ...session, days }],
      goals: [],
      notificationSwitches: switchesOn,
    });
  });

  it('adds no display name and the switches on to a version 3 history, so onboarding asks for a name', () => {
    expect(migrate(3, { current: null, record: [{ ...session, days }], goals: [] })).toEqual({
      displayName: null,
      current: null,
      record: [{ ...session, days }],
      goals: [],
      notificationSwitches: switchesOn,
    });
  });

  it('turns both notification switches on for a version 4 history', () => {
    const v4 = { displayName: 'Sam', current: null, record: [{ ...session, days }], goals: [] };
    expect(migrate(4, v4)).toEqual({ ...v4, notificationSwitches: switchesOn });
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
