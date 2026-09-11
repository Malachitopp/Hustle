/**
 * Database tests for settings: what the dev project lets a signed-in user do with their profile
 * row, driven the way the app drives it (save_profile and the download in src/restore.ts), and
 * that nobody can see or touch anyone else's. See sessions.test.ts for what the tests need and
 * how to run them.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import { downloadSettings } from '@/restore';

import { client, saveSettings, someSettings, throwawayUser, userIdOf } from './helpers';

let alice: SupabaseClient;
let bob: SupabaseClient;

beforeAll(async () => {
  [alice, bob] = await Promise.all([throwawayUser(), throwawayUser()]);
});

/** The profile of user `userId` as `user` can see it straight in the table. */
async function profileOf(user: SupabaseClient, userId: string) {
  const { data, error } = await user.from('profiles').select('display_name, petal_colour').eq('user_id', userId);
  if (error) throw error;
  return data;
}

describe('saving the settings', () => {
  it('has none to hand back until they are first saved', async () => {
    expect(await downloadSettings(alice)).toBeNull();
  });

  it('stores them and hands them back as the core keeps them', async () => {
    await saveSettings(alice, someSettings);
    expect(await downloadSettings(alice)).toEqual({
      displayName: 'Sam',
      petalColour: 'blue',
      notificationSwitches: { pauseWarnings: false, streakReminder: true },
    });
  });

  it('replaces them when saved again, and treats a missing colour as the default', async () => {
    await saveSettings(alice, { ...someSettings, p_display_name: 'Samuel', p_petal_colour: null, p_pause_warnings: true });
    expect(await downloadSettings(alice)).toEqual({
      displayName: 'Samuel',
      petalColour: null,
      notificationSwitches: { pauseWarnings: true, streakReminder: true },
    });
    expect(await profileOf(alice, await userIdOf(alice))).toEqual([{ display_name: 'Samuel', petal_colour: null }]);
  });

  it('refuses someone who is not signed in', async () => {
    const { error } = await client().rpc('save_profile', someSettings);
    expect(error).not.toBeNull();
    await expect(downloadSettings(client())).rejects.toThrow();
  });
});

describe("each user's settings are their own", () => {
  it("hides one user's settings from another", async () => {
    await saveSettings(alice, someSettings);
    expect(await downloadSettings(bob)).toBeNull();
    expect(await profileOf(bob, await userIdOf(alice))).toEqual([]);
  });

  it("refuses a profile added straight to the table under someone else's id", async () => {
    const { error } = await bob.from('profiles').insert({ user_id: await userIdOf(alice), display_name: 'Planted' });
    expect(error).not.toBeNull();
    expect(await downloadSettings(alice)).toMatchObject({ displayName: 'Sam' });
  });

  it("lets nobody else change or delete a profile", async () => {
    const alicesId = await userIdOf(alice);
    const changed = await bob.from('profiles').update({ display_name: 'Changed' }).eq('user_id', alicesId).select('user_id');
    expect(changed.data ?? []).toEqual([]);
    const deleted = await bob.from('profiles').delete().eq('user_id', alicesId).select('user_id');
    expect(deleted.data ?? []).toEqual([]);
    expect(await downloadSettings(alice)).toMatchObject({ displayName: 'Sam', petalColour: 'blue' });
  });

  it('lets the owner change their own profile straight in the table', async () => {
    const alicesId = await userIdOf(alice);
    const changed = await alice.from('profiles').update({ petal_colour: 'pink' }).eq('user_id', alicesId).select('petal_colour');
    expect(changed.data).toEqual([{ petal_colour: 'pink' }]);
    expect(await downloadSettings(alice)).toMatchObject({ petalColour: 'pink' });
  });
});
