/**
 * Database tests for the account: the two Edge Functions on the dev project, driven the way the
 * app drives them. Deleting an account leaves none of the user's rows in any table and ends
 * their sign-in; the Apple tokens the server keeps for revoking are out of every client's reach;
 * and neither function does anything for someone not signed in. The functions must be deployed
 * to the dev project (npx supabase functions deploy). See sessions.test.ts for the rest of what
 * the tests need.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  aGoal,
  aSession,
  client,
  deleteThrowawayUsers,
  save,
  saveGoal,
  saveSettings,
  someSettings,
  statusOf,
  throwawayUser,
  userIdOf,
} from './helpers';

/** Every table a user owns rows in that a signed-in user can read. */
const TABLES = ['sessions', 'session_days', 'goals', 'goal_switches', 'profiles'] as const;

/** How many rows one saved session, goal and settings put in each table. */
const ROWS_EACH: Record<(typeof TABLES)[number], number> = {
  sessions: 1,
  session_days: 2,
  goals: 1,
  goal_switches: 2,
  profiles: 1,
};

/** Alice deletes her account in the test; Bob keeps his, to show deletion takes only hers. */
let alice: SupabaseClient;
let bob: SupabaseClient;

beforeAll(async () => {
  [alice, bob] = await Promise.all([throwawayUser(), throwawayUser()]);
  for (const user of [alice, bob]) {
    await save(user, aSession());
    await saveGoal(user, aGoal());
    await saveSettings(user, someSettings);
  }
});

afterAll(() => deleteThrowawayUsers(bob));

/** The rows of `table` that `user`'s sign-in can see: their own, if any remain. */
async function rowsOf(user: SupabaseClient, table: (typeof TABLES)[number]) {
  const { data, error } = await user.from(table).select('user_id');
  if (error) throw error;
  return data;
}

describe('deleting the account', () => {
  it('refuses someone who is not signed in', async () => {
    const { error } = await client().functions.invoke('delete-account');
    expect(statusOf(error)).toBe(401);
  });

  it("removes every row the user owns in every table, only theirs, and ends their sign-in", async () => {
    for (const table of TABLES) expect(await rowsOf(alice, table)).toHaveLength(ROWS_EACH[table]);

    const { data, error } = await alice.functions.invoke('delete-account');
    expect(error).toBeNull();
    expect(data).toEqual({ deleted: true });

    // Alice's access token is still good for a while, and row-level security would show her
    // own rows through it if any were left. Bob's are all still there.
    for (const table of TABLES) expect(await rowsOf(alice, table)).toEqual([]);
    for (const table of TABLES) expect(await rowsOf(bob, table)).toHaveLength(ROWS_EACH[table]);

    // Her sign-in is over: the server no longer knows her, and the session cannot be renewed.
    const whoAmI = await alice.auth.getUser();
    expect(whoAmI.error).not.toBeNull();
    const renewed = await alice.auth.refreshSession();
    expect(renewed.error).not.toBeNull();
    // Nor can the old sign-in delete anything again.
    const again = await alice.functions.invoke('delete-account');
    expect(statusOf(again.error)).toBe(401);
  });
});

describe('the Apple tokens', () => {
  it('are out of reach of every signed-in user, and so is deleting rows', async () => {
    const bobsId = await userIdOf(bob);
    const read = await bob.from('apple_tokens').select('user_id');
    expect(read.error).not.toBeNull();
    const added = await bob.from('apple_tokens').insert({ user_id: bobsId, refresh_token: 'planted' });
    expect(added.error).not.toBeNull();
    const deleted = await bob.rpc('delete_user_rows', { p_user_id: bobsId });
    expect(deleted.error).not.toBeNull();
    for (const table of TABLES) expect(await rowsOf(bob, table)).toHaveLength(ROWS_EACH[table]);
  });

  it('cannot be saved by someone who is not signed in', async () => {
    const { error } = await client().functions.invoke('save-apple-token', { body: { authorizationCode: 'code' } });
    expect(statusOf(error)).toBe(401);
  });

  it('are not saved from a code Apple does not accept', async () => {
    const { error } = await bob.functions.invoke('save-apple-token', { body: { authorizationCode: 'not-a-real-code' } });
    // Either Apple refuses the code, or the server has no Apple key yet. Nothing is kept either way.
    expect([400, 502, 503]).toContain(statusOf(error));
  });

  it('are asked for by name', async () => {
    const { error } = await bob.functions.invoke('save-apple-token', { body: {} });
    expect(statusOf(error)).toBe(400);
  });
});
