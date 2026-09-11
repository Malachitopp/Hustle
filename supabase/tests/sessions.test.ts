/**
 * Database tests: what the dev project lets a signed-in user do, driven the way the app drives
 * it, as throwaway users who sign up at the start of the run. They need the dev project's URL
 * and public key in .env.local (see .env.example) and the dev project to have "Confirm email"
 * switched off under Authentication, so a fresh sign-up is signed in at once. Run them with
 * `npm run test:db`; `npm test` leaves them out because they need the network. Each file deletes
 * its throwaway users at the end, the way the app deletes an account, so a run leaves nothing on
 * dev once the delete-account Edge Function is deployed there.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import { aSession, client, deleteThrowawayUsers, HOUR, save, throwawayUser } from './helpers';

const storedSession = (id: string) => [{ id, time_zone: 'Europe/London', work_ms: 3 * HOUR }];
const storedDays = [
  { day: '2026-09-10', work_ms: 1.5 * HOUR },
  { day: '2026-09-11', work_ms: 1.5 * HOUR },
];

/** The session `id` as `user` can see it. */
async function sessionsOf(user: SupabaseClient, id: string) {
  const { data, error } = await user.from('sessions').select('id, time_zone, work_ms').eq('id', id);
  if (error) throw error;
  return data;
}

/** The days of session `id` as `user` can see them. */
async function daysOf(user: SupabaseClient, id: string) {
  const { data, error } = await user
    .from('session_days')
    .select('day, work_ms')
    .eq('session_id', id)
    .order('day');
  if (error) throw error;
  return data;
}

let alice: SupabaseClient;
let bob: SupabaseClient;

beforeAll(async () => {
  [alice, bob] = await Promise.all([throwawayUser(), throwawayUser()]);
});

afterAll(() => deleteThrowawayUsers(alice, bob));

describe('saving a session', () => {
  it('stores the session and its days for the user who saved it', async () => {
    const session = aSession();
    await save(alice, session);
    expect(await sessionsOf(alice, session.p_id)).toEqual(storedSession(session.p_id));
    expect(await daysOf(alice, session.p_id)).toEqual(storedDays);
  });

  it('stores a session once, however many times it is saved, keeping the first save', async () => {
    const session = aSession();
    await save(alice, session);
    // A retry that somehow differs still changes nothing: the record is what was measured first.
    await save(alice, { ...session, p_work_ms: 99 * HOUR, p_days: [{ date: '2026-09-12', work_ms: 99 * HOUR }] });
    await save(alice, session);
    expect(await sessionsOf(alice, session.p_id)).toEqual(storedSession(session.p_id));
    expect(await daysOf(alice, session.p_id)).toEqual(storedDays);
  });

  it('refuses a save from someone who is not signed in', async () => {
    const { error } = await client().rpc('save_session', aSession());
    expect(error).not.toBeNull();
  });

  it('refuses a session with no days', async () => {
    const session = { ...aSession(), p_days: [] };
    const { error } = await alice.rpc('save_session', session);
    expect(error).not.toBeNull();
    expect(await sessionsOf(alice, session.p_id)).toEqual([]);
  });
});

describe("each user's record is their own", () => {
  it("hides one user's sessions and days from another", async () => {
    const session = aSession();
    await save(alice, session);
    expect(await sessionsOf(bob, session.p_id)).toEqual([]);
    expect(await daysOf(bob, session.p_id)).toEqual([]);
  });

  it("refuses a session added straight to the table under someone else's id", async () => {
    const { data: bobUser } = await bob.auth.getUser();
    const { error } = await alice.from('sessions').insert({
      id: crypto.randomUUID(),
      user_id: bobUser.user?.id,
      started_at: '2026-09-10T22:00:00+01:00',
      ended_at: '2026-09-10T23:00:00+01:00',
      time_zone: 'Europe/London',
      periods: [],
      work_ms: 0,
    });
    expect(error).not.toBeNull();
  });

  it('lets nobody change or delete a session or its days, not even their owner', async () => {
    const session = aSession();
    await save(alice, session);

    const changed = await alice.from('sessions').update({ work_ms: 1 }).eq('id', session.p_id).select('id');
    expect(changed.data ?? []).toEqual([]);
    const changedDays = await alice
      .from('session_days')
      .update({ work_ms: 1 })
      .eq('session_id', session.p_id)
      .select('day');
    expect(changedDays.data ?? []).toEqual([]);
    const deletedDays = await alice.from('session_days').delete().eq('session_id', session.p_id).select('day');
    expect(deletedDays.data ?? []).toEqual([]);
    const deleted = await alice.from('sessions').delete().eq('id', session.p_id).select('id');
    expect(deleted.data ?? []).toEqual([]);

    expect(await sessionsOf(alice, session.p_id)).toEqual(storedSession(session.p_id));
    expect(await daysOf(alice, session.p_id)).toEqual(storedDays);
  });
});
