/**
 * Upload adapter tests: each upload says whether everything it was asked for went through, so a
 * failed attempt can be tried again, hands back what the account took, and sends what was left
 * the next time it is asked. The Supabase client is a stub here; what the database does with a
 * row is covered by the tests in supabase/tests.
 */
import { sessionDays, type EndedSession, type Goal, type Settings } from '@/core';
import { supabase } from '@/supabase';
import { deleteGoals, uploadGoals, uploadSessions, uploadSettings } from '@/uploads';

jest.mock('@/supabase', () => ({ supabase: { rpc: jest.fn() } }));

const rpc = (supabase as unknown as { rpc: jest.Mock }).rpc;
const stored = { error: null };
const refused = { error: { message: 'no connection' } };

const LONDON = 'Europe/London';
const START = Date.parse('2026-09-10T09:00:00+01:00');
const HOUR = 60 * 60_000;

const aSession = (id: string): EndedSession => {
  const periods = [{ from: START, to: START + HOUR }];
  return { id, timeZone: LONDON, startedAt: START, endedAt: START + HOUR, periods, days: sessionDays(periods, LONDON) };
};

const aGoal = (id: string): Goal => ({
  id,
  name: 'Finals',
  target: 100 * HOUR,
  deadline: '2026-10-24',
  timeZone: LONDON,
  createdAt: START,
  switches: [],
  celebratedAt: null,
});

const settings: Settings = {
  displayName: 'Sam',
  petalColour: 'blue',
  notificationSwitches: { pauseWarnings: true, streakReminder: false },
};

/** The database functions called so far, with the id each was given. */
const calls = () => rpc.mock.calls.map(([name, row]: [string, { p_id?: string }]) => [name, row.p_id]);

beforeEach(() => {
  rpc.mockReset();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('uploading sessions', () => {
  it('sends every session in order, hands back their ids, and says everything went', async () => {
    rpc.mockResolvedValue(stored);
    const onStored = jest.fn();
    await expect(uploadSessions([aSession('a'), aSession('b')], onStored)).resolves.toBe(true);
    expect(calls()).toEqual([
      ['save_session', 'a'],
      ['save_session', 'b'],
    ]);
    expect(onStored).toHaveBeenCalledWith(['a', 'b']);
  });

  it('stops at the first refusal, says not everything went, and sends the rest next time', async () => {
    rpc.mockResolvedValueOnce(stored).mockResolvedValueOnce(refused);
    const onStored = jest.fn();
    await expect(uploadSessions([aSession('c'), aSession('d'), aSession('e')], onStored)).resolves.toBe(false);
    expect(calls()).toEqual([
      ['save_session', 'c'],
      ['save_session', 'd'],
    ]);
    expect(onStored).toHaveBeenCalledWith(['c']);

    rpc.mockReset();
    rpc.mockResolvedValue(stored);
    await expect(uploadSessions([aSession('d'), aSession('e')], onStored)).resolves.toBe(true);
    expect(calls()).toEqual([
      ['save_session', 'd'],
      ['save_session', 'e'],
    ]);
    expect(onStored).toHaveBeenLastCalledWith(['d', 'e']);
  });

  it('says everything went when there was nothing to send', async () => {
    const onStored = jest.fn();
    await expect(uploadSessions([], onStored)).resolves.toBe(true);
    expect(rpc).not.toHaveBeenCalled();
    expect(onStored).not.toHaveBeenCalled();
  });
});

describe('uploading goals and deletions', () => {
  it('hands back the goals the account took and says whether all of them went', async () => {
    rpc.mockResolvedValueOnce(stored).mockResolvedValueOnce(refused);
    const onStored = jest.fn();
    const [first, second] = [aGoal('g1'), aGoal('g2')];
    await expect(uploadGoals([first, second], onStored)).resolves.toBe(false);
    expect(onStored).toHaveBeenCalledWith([first]);

    rpc.mockReset();
    rpc.mockResolvedValue(stored);
    await expect(uploadGoals([second], onStored)).resolves.toBe(true);
    expect(onStored).toHaveBeenLastCalledWith([second]);
  });

  it('hands back the ids the account confirmed deleted and says whether all of them went', async () => {
    rpc.mockResolvedValueOnce(refused);
    const onDeleted = jest.fn();
    await expect(deleteGoals(['x', 'y'], onDeleted)).resolves.toBe(false);
    expect(onDeleted).not.toHaveBeenCalled();

    rpc.mockReset();
    rpc.mockResolvedValue(stored);
    await expect(deleteGoals(['x', 'y'], onDeleted)).resolves.toBe(true);
    expect(calls()).toEqual([
      ['delete_goal', 'x'],
      ['delete_goal', 'y'],
    ]);
    expect(onDeleted).toHaveBeenCalledWith(['x', 'y']);
  });
});

describe('uploading the settings', () => {
  it('says whether the account took them, and hands them back only when it did', async () => {
    rpc.mockResolvedValueOnce(refused);
    const onStored = jest.fn();
    await expect(uploadSettings(settings, onStored)).resolves.toBe(false);
    expect(onStored).not.toHaveBeenCalled();

    rpc.mockResolvedValueOnce(stored);
    await expect(uploadSettings(settings, onStored)).resolves.toBe(true);
    expect(onStored).toHaveBeenCalledWith(settings);
    expect(rpc).toHaveBeenLastCalledWith('save_profile', {
      p_display_name: 'Sam',
      p_petal_colour: 'blue',
      p_pause_warnings: true,
      p_streak_reminder: false,
    });
  });
});
