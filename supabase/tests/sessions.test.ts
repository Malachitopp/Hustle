/**
 * Database tests: what the dev project lets a signed-in user do, driven the way the app drives
 * it, as throwaway users who sign up at the start of the run. They need the dev project's URL
 * and public key in .env.local (see .env.example) and the dev project to have "Confirm email"
 * switched off under Authentication, so a fresh sign-up is signed in at once. Run them with
 * `npm run test:db`; `npm test` leaves them out because they need the network. The throwaway
 * users stay on the dev project, since nothing on the client side can remove them.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import process from 'node:process';

const HOUR = 60 * 60_000;

const url = required('EXPO_PUBLIC_SUPABASE_URL');
const anonKey = required('EXPO_PUBLIC_SUPABASE_ANON_KEY');

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Put the dev project's ${name} in .env.local (see .env.example).`);
  return value;
}

/** A client of the dev project with nobody signed in. */
const client = (): SupabaseClient =>
  createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

/** A throwaway user's client, carrying their sign-in. */
async function throwawayUser(): Promise<SupabaseClient> {
  const user = client();
  const { data, error } = await user.auth.signUp({
    email: `hustle-test-${crypto.randomUUID()}@example.com`,
    password: crypto.randomUUID(),
  });
  if (error) throw new Error(`Could not sign up a throwaway user: ${error.message}`);
  if (!data.session) {
    throw new Error(
      'Signing up did not sign the user in. On the dev project, switch off "Confirm email" under Authentication > Sign In / Providers > Email.',
    );
  }
  return user;
}

/** A session as the app sends it to save_session: one that ran past midnight. */
function aSession(id = crypto.randomUUID()) {
  return {
    p_id: id,
    p_started_at: '2026-09-10T22:00:00+01:00',
    p_ended_at: '2026-09-11T01:30:00+01:00',
    p_time_zone: 'Europe/London',
    p_periods: [
      { from: '2026-09-10T22:00:00+01:00', to: '2026-09-10T23:30:00+01:00' },
      { from: '2026-09-11T00:00:00+01:00', to: '2026-09-11T01:30:00+01:00' },
    ],
    p_work_ms: 3 * HOUR,
    p_days: [
      { date: '2026-09-10', work_ms: 1.5 * HOUR },
      { date: '2026-09-11', work_ms: 1.5 * HOUR },
    ],
  };
}

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

async function save(user: SupabaseClient, session: ReturnType<typeof aSession>) {
  const { error } = await user.rpc('save_session', session);
  expect(error).toBeNull();
}

let alice: SupabaseClient;
let bob: SupabaseClient;

beforeAll(async () => {
  [alice, bob] = await Promise.all([throwawayUser(), throwawayUser()]);
});

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
