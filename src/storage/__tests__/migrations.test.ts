import { initialState, type State } from '@/core';
import { migrate, VERSION } from '@/storage/migrations';

const HOUR = 60 * 60_000;
const at = (iso: string): number => Date.parse(iso);

describe('migrating a saved history', () => {
  it('adds the split by date to sessions saved before it was stored', () => {
    const session = {
      id: 'abc-123',
      timeZone: 'Europe/London',
      startedAt: at('2026-09-10T22:00:00+01:00'),
      endedAt: at('2026-09-11T02:00:00+01:00'),
      periods: [{ from: at('2026-09-10T22:00:00+01:00'), to: at('2026-09-11T02:00:00+01:00') }],
    };
    expect(migrate(1, { current: null, record: [session] })).toEqual({
      current: null,
      record: [
        {
          ...session,
          days: [
            { date: '2026-09-10', workTime: 2 * HOUR },
            { date: '2026-09-11', workTime: 2 * HOUR },
          ],
        },
      ],
    });
  });

  it('returns a history in the current shape as it is', () => {
    const state: State = initialState;
    expect(migrate(VERSION, state)).toBe(state);
  });

  it('refuses a history from a version it does not know', () => {
    expect(migrate(VERSION + 1, initialState)).toBeNull();
    expect(migrate(0, initialState)).toBeNull();
  });
});
