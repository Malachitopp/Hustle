/**
 * Database tests for goals: what the dev project lets a signed-in user do with their goals and
 * switch history, driven the way the app drives it (save_goal, delete_goal and the download in
 * src/restore.ts), and that nobody can see or touch anyone else's. See sessions.test.ts for what
 * the tests need and how to run them.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import { downloadGoals } from '@/restore';

import { aGoal, at, client, deleteThrowawayUsers, HOUR, saveGoal, throwawayUser, userIdOf } from './helpers';

let alice: SupabaseClient;
let bob: SupabaseClient;

beforeAll(async () => {
  [alice, bob] = await Promise.all([throwawayUser(), throwawayUser()]);
});

afterAll(() => deleteThrowawayUsers(alice, bob));

/** The goal `id` as `user` can see it straight in the table. */
async function goalsOf(user: SupabaseClient, id: string) {
  const { data, error } = await user.from('goals').select('id, name, target_ms, deleted_at').eq('id', id);
  if (error) throw error;
  return data;
}

/** The switches of goal `id` as `user` can see them, in order. */
async function switchesOf(user: SupabaseClient, id: string) {
  const { data, error } = await user
    .from('goal_switches')
    .select('position, active')
    .eq('goal_id', id)
    .order('position');
  if (error) throw error;
  return data;
}

/** The goal `id` as the download hands it back to the core, or undefined if it is not there. */
async function downloadedGoal(user: SupabaseClient, id: string) {
  return (await downloadGoals(user)).goals.find((goal) => goal.id === id);
}

const storedGoal = (id: string) => [{ id, name: 'Finals', target_ms: 100 * HOUR, deleted_at: null }];
const storedSwitches = [
  { position: 0, active: false },
  { position: 1, active: true },
];

describe('saving a goal', () => {
  it('stores the goal and its switches, and hands them back as the core keeps them', async () => {
    const goal = aGoal();
    await saveGoal(alice, goal);
    expect(await goalsOf(alice, goal.p_id)).toEqual(storedGoal(goal.p_id));
    expect(await switchesOf(alice, goal.p_id)).toEqual(storedSwitches);
    expect(await downloadedGoal(alice, goal.p_id)).toEqual({
      id: goal.p_id,
      name: 'Finals',
      target: 100 * HOUR,
      deadline: '2026-10-24',
      timeZone: 'Europe/London',
      createdAt: at('2026-09-10T08:00:00+01:00'),
      celebratedAt: null,
      switches: [
        { at: at('2026-09-10T09:00:00+01:00'), active: false },
        { at: at('2026-09-10T10:00:00+01:00'), active: true },
      ],
    });
  });

  it('replaces the details and the switches when the goal is saved again', async () => {
    const goal = aGoal();
    await saveGoal(alice, goal);
    await saveGoal(alice, {
      ...goal,
      p_name: 'Exams',
      p_target_ms: 50 * HOUR,
      p_celebrated_at: '2026-09-11T12:00:00+01:00',
      p_switches: [{ at: '2026-09-10T09:00:00+01:00', active: false }],
    });
    expect(await downloadedGoal(alice, goal.p_id)).toMatchObject({
      name: 'Exams',
      target: 50 * HOUR,
      celebratedAt: at('2026-09-11T12:00:00+01:00'),
      switches: [{ at: at('2026-09-10T09:00:00+01:00'), active: false }],
    });
    expect(await switchesOf(alice, goal.p_id)).toEqual([{ position: 0, active: false }]);
  });

  it('keeps a goal with no switches, and lists goals oldest first', async () => {
    const later = { ...aGoal(), p_created_at: '2026-09-12T08:00:00+01:00', p_switches: [] };
    const earlier = { ...aGoal(), p_created_at: '2026-09-09T08:00:00+01:00' };
    await saveGoal(alice, later);
    await saveGoal(alice, earlier);
    const ids = (await downloadGoals(alice)).goals.map((goal) => goal.id);
    expect(ids.indexOf(earlier.p_id)).toBeLessThan(ids.indexOf(later.p_id));
    expect((await downloadedGoal(alice, later.p_id))?.switches).toEqual([]);
  });

  it('refuses a save from someone who is not signed in', async () => {
    const { error } = await client().rpc('save_goal', aGoal());
    expect(error).not.toBeNull();
  });

  it('refuses switches that are not a list', async () => {
    const goal = { ...aGoal(), p_switches: { at: '2026-09-10T09:00:00+01:00', active: false } };
    const { error } = await alice.rpc('save_goal', goal);
    expect(error).not.toBeNull();
    expect(await goalsOf(alice, goal.p_id)).toEqual([]);
  });
});

describe('deleting a goal', () => {
  it('leaves a marker and drops the switches, so another phone learns the goal went', async () => {
    const goal = aGoal();
    await saveGoal(alice, goal);
    const { error } = await alice.rpc('delete_goal', { p_id: goal.p_id });
    expect(error).toBeNull();

    const { goals, deletedGoalIds } = await downloadGoals(alice);
    expect(goals.map((candidate) => candidate.id)).not.toContain(goal.p_id);
    expect(deletedGoalIds).toContain(goal.p_id);
    expect(await switchesOf(alice, goal.p_id)).toEqual([]);
  });

  it('brings a deleted goal back when it is saved again', async () => {
    const goal = aGoal();
    await saveGoal(alice, goal);
    await alice.rpc('delete_goal', { p_id: goal.p_id });
    await saveGoal(alice, goal);
    expect(await downloadedGoal(alice, goal.p_id)).toMatchObject({ name: 'Finals' });
    expect((await downloadGoals(alice)).deletedGoalIds).not.toContain(goal.p_id);
    expect(await switchesOf(alice, goal.p_id)).toEqual(storedSwitches);
  });

  it('changes nothing for a goal the account never had, or one deleted already', async () => {
    const never = crypto.randomUUID();
    expect((await alice.rpc('delete_goal', { p_id: never })).error).toBeNull();
    expect((await downloadGoals(alice)).deletedGoalIds).not.toContain(never);

    const goal = aGoal();
    await saveGoal(alice, goal);
    await alice.rpc('delete_goal', { p_id: goal.p_id });
    const [first] = await goalsOf(alice, goal.p_id);
    expect((await alice.rpc('delete_goal', { p_id: goal.p_id })).error).toBeNull();
    expect(await goalsOf(alice, goal.p_id)).toEqual([first]);
  });

  it('refuses someone who is not signed in', async () => {
    const { error } = await client().rpc('delete_goal', { p_id: crypto.randomUUID() });
    expect(error).not.toBeNull();
  });
});

describe("each user's goals are their own", () => {
  it("hides one user's goals and switches from another", async () => {
    const goal = aGoal();
    await saveGoal(alice, goal);
    expect(await goalsOf(bob, goal.p_id)).toEqual([]);
    expect(await switchesOf(bob, goal.p_id)).toEqual([]);
    expect(await downloadedGoal(bob, goal.p_id)).toBeUndefined();
    await expect(downloadGoals(client())).rejects.toThrow();
  });

  it("refuses to save over another user's goal, and leaves it as it was", async () => {
    const goal = aGoal();
    await saveGoal(alice, goal);
    const { error } = await bob.rpc('save_goal', { ...goal, p_name: 'Taken over', p_switches: [] });
    expect(error).not.toBeNull();
    expect(await goalsOf(alice, goal.p_id)).toEqual(storedGoal(goal.p_id));
    expect(await switchesOf(alice, goal.p_id)).toEqual(storedSwitches);
    expect(await switchesOf(bob, goal.p_id)).toEqual([]);
  });

  it("cannot delete another user's goal", async () => {
    const goal = aGoal();
    await saveGoal(alice, goal);
    const { error } = await bob.rpc('delete_goal', { p_id: goal.p_id });
    expect(error).toBeNull();
    expect(await goalsOf(alice, goal.p_id)).toEqual(storedGoal(goal.p_id));
    expect(await switchesOf(alice, goal.p_id)).toEqual(storedSwitches);
  });

  it("refuses a goal, or a switch, added straight to the table under someone else's id", async () => {
    const goal = aGoal();
    await saveGoal(alice, goal);
    const bobsId = await userIdOf(bob);
    const added = await alice.from('goals').insert({
      id: crypto.randomUUID(),
      user_id: bobsId,
      name: 'Planted',
      target_ms: HOUR,
      deadline: '2026-10-24',
      time_zone: 'Europe/London',
      created_at: '2026-09-10T08:00:00+01:00',
    });
    expect(added.error).not.toBeNull();
    const addedSwitch = await bob
      .from('goal_switches')
      .insert({ goal_id: goal.p_id, user_id: bobsId, position: 9, at: '2026-09-10T11:00:00+01:00', active: false });
    expect(addedSwitch.error).not.toBeNull();
    expect(await switchesOf(alice, goal.p_id)).toEqual(storedSwitches);
  });

  it("lets nobody else change or delete a goal straight in the table", async () => {
    const goal = aGoal();
    await saveGoal(alice, goal);
    const changed = await bob.from('goals').update({ name: 'Changed' }).eq('id', goal.p_id).select('id');
    expect(changed.data ?? []).toEqual([]);
    const deletedSwitches = await bob.from('goal_switches').delete().eq('goal_id', goal.p_id).select('position');
    expect(deletedSwitches.data ?? []).toEqual([]);
    const deleted = await bob.from('goals').delete().eq('id', goal.p_id).select('id');
    expect(deleted.data ?? []).toEqual([]);
    expect(await goalsOf(alice, goal.p_id)).toEqual(storedGoal(goal.p_id));
    expect(await switchesOf(alice, goal.p_id)).toEqual(storedSwitches);
  });

  it('lets the owner change and delete their own goal straight in the table', async () => {
    const goal = aGoal();
    await saveGoal(alice, goal);
    const changed = await alice.from('goals').update({ name: 'Changed' }).eq('id', goal.p_id).select('name');
    expect(changed.data).toEqual([{ name: 'Changed' }]);
    const deleted = await alice.from('goals').delete().eq('id', goal.p_id).select('id');
    expect(deleted.data).toEqual([{ id: goal.p_id }]);
    expect(await goalsOf(alice, goal.p_id)).toEqual([]);
    expect(await switchesOf(alice, goal.p_id)).toEqual([]);
  });
});
