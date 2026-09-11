/**
 * Database tests for restoring: the queries in src/restore.ts, run against the dev project as
 * throwaway users, bring back exactly the caller's own sessions, with their days, in the shape the
 * core keeps them. See sessions.test.ts for what the tests need and how to run them.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import { downloadAccount, downloadMonth, downloadRecord } from '@/restore';

import { aGoal, at, client, HOUR, save, saveGoal, saveSettings, sessionToSave, someSettings, throwawayUser } from './helpers';

let alice: SupabaseClient;
let bob: SupabaseClient;

/** Alice's two sessions: one that ran past midnight in September, one across the turn of the month. */
const september = sessionToSave(crypto.randomUUID(), [
  ['2026-09-10T22:00:00+01:00', '2026-09-10T23:30:00+01:00'],
  ['2026-09-11T00:00:00+01:00', '2026-09-11T01:30:00+01:00'],
]);
const augustToSeptember = sessionToSave(crypto.randomUUID(), [
  ['2026-08-31T23:00:00+01:00', '2026-09-01T01:00:00+01:00'],
]);
/** Bob's session, which Alice must never see. */
const bobs = sessionToSave(crypto.randomUUID(), [['2026-09-05T09:00:00+01:00', '2026-09-05T10:00:00+01:00']]);

beforeAll(async () => {
  [alice, bob] = await Promise.all([throwawayUser(), throwawayUser()]);
  await save(alice, september);
  await save(alice, augustToSeptember);
  await save(bob, bobs);
});

const ids = (sessions: { id: string }[]) => sessions.map((session) => session.id);

describe('downloading the record', () => {
  it("brings back the user's own sessions, oldest first, as the core keeps them", async () => {
    const record = await downloadRecord(alice);
    expect(ids(record)).toEqual([augustToSeptember.p_id, september.p_id]);
    expect(record[1]).toEqual({
      id: september.p_id,
      timeZone: 'Europe/London',
      startedAt: at('2026-09-10T22:00:00+01:00'),
      endedAt: at('2026-09-11T01:30:00+01:00'),
      periods: [
        { from: at('2026-09-10T22:00:00+01:00'), to: at('2026-09-10T23:30:00+01:00') },
        { from: at('2026-09-11T00:00:00+01:00'), to: at('2026-09-11T01:30:00+01:00') },
      ],
      days: [
        { date: '2026-09-10', workTime: 1.5 * HOUR },
        { date: '2026-09-11', workTime: 1.5 * HOUR },
      ],
    });
    expect(record[0].days).toEqual([
      { date: '2026-08-31', workTime: HOUR },
      { date: '2026-09-01', workTime: HOUR },
    ]);
  });

  it("never includes another user's sessions", async () => {
    expect(ids(await downloadRecord(bob))).toEqual([bobs.p_id]);
  });

  it('refuses someone who is not signed in', async () => {
    await expect(downloadRecord(client())).rejects.toThrow();
  });
});

describe('downloading a month', () => {
  it('brings back the sessions with a day in the month, oldest first', async () => {
    expect(ids(await downloadMonth(alice, '2026-09-01', new Set()))).toEqual([
      augustToSeptember.p_id,
      september.p_id,
    ]);
    expect(ids(await downloadMonth(alice, '2026-08-01', new Set()))).toEqual([augustToSeptember.p_id]);
    expect(await downloadMonth(alice, '2026-07-01', new Set())).toEqual([]);
  });

  it('leaves out the sessions the phone already has', async () => {
    const known = new Set([augustToSeptember.p_id]);
    expect(ids(await downloadMonth(alice, '2026-09-01', known))).toEqual([september.p_id]);
    expect(await downloadMonth(alice, '2026-09-01', new Set([september.p_id, augustToSeptember.p_id]))).toEqual([]);
  });

  it("never includes another user's sessions", async () => {
    expect(ids(await downloadMonth(bob, '2026-09-01', new Set()))).toEqual([bobs.p_id]);
  });
});

describe('downloading everything the account holds', () => {
  it('brings back the record, the goals and the settings together', async () => {
    const goal = aGoal();
    const deleted = aGoal();
    await saveGoal(alice, goal);
    await saveGoal(alice, deleted);
    await alice.rpc('delete_goal', { p_id: deleted.p_id });
    await saveSettings(alice, someSettings);

    const account = await downloadAccount(alice);
    expect(ids(account.sessions)).toEqual([augustToSeptember.p_id, september.p_id]);
    expect(ids(account.goals)).toEqual([goal.p_id]);
    expect(account.deletedGoalIds).toEqual([deleted.p_id]);
    expect(account.settings).toMatchObject({ displayName: 'Sam', petalColour: 'blue' });
  });

  it('is empty, apart from the record, for an account that has never saved goals or settings', async () => {
    const account = await downloadAccount(bob);
    expect(ids(account.sessions)).toEqual([bobs.p_id]);
    expect(account.goals).toEqual([]);
    expect(account.deletedGoalIds).toEqual([]);
    expect(account.settings).toBeNull();
  });

  it('refuses someone who is not signed in', async () => {
    await expect(downloadAccount(client())).rejects.toThrow();
  });
});
