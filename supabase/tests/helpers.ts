/**
 * Shared by the database tests: clients of the dev project, throwaway users who sign up at the
 * start of a run and are deleted at its end, and sessions, goals and settings shaped the way the
 * app sends them to the database's functions.
 */
import { createClient, FunctionsHttpError, type SupabaseClient } from '@supabase/supabase-js';
import process from 'node:process';

import { sessionDays } from '@/core';

export const HOUR = 60 * 60_000;

const url = required('EXPO_PUBLIC_SUPABASE_URL');
const anonKey = required('EXPO_PUBLIC_SUPABASE_ANON_KEY');

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Put the dev project's ${name} in .env.local (see .env.example).`);
  return value;
}

/** A client of the dev project with nobody signed in. */
export const client = (): SupabaseClient =>
  createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

/** A throwaway user's client, carrying their sign-in. */
export async function throwawayUser(): Promise<SupabaseClient> {
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

/** The id of the user `user` is signed in as. */
export async function userIdOf(user: SupabaseClient): Promise<string> {
  const { data, error } = await user.auth.getUser();
  if (error || !data.user) throw new Error('The client is not signed in.');
  return data.user.id;
}

/**
 * Deletes throwaway users at the end of a test file, the way the app deletes an account (the
 * delete-account Edge Function), so a run leaves nothing behind on dev. Best effort: one that
 * cannot be deleted (the function not deployed, say) is left behind with a warning.
 */
export async function deleteThrowawayUsers(...users: (SupabaseClient | undefined)[]): Promise<void> {
  await Promise.all(
    users.map(async (user) => {
      if (!user) return;
      const { error } = await user.functions.invoke('delete-account');
      if (error) console.warn(`A throwaway user was left on dev: ${await functionFailure(error)}`);
    }),
  );
}

/** What a failed call to an Edge Function said: the status and the error the function answered with. */
export async function functionFailure(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    const body = (await error.context.json().catch(() => ({}))) as { error?: unknown };
    return `${error.context.status}${typeof body.error === 'string' ? ` ${body.error}` : ''}`;
  }
  return error instanceof Error ? error.message : String(error);
}

/** The HTTP status a failed call to an Edge Function came back with, or null if it never got an answer. */
export function statusOf(error: unknown): number | null {
  return error instanceof FunctionsHttpError ? (error.context.status as number) : null;
}

/** The instant an ISO string with an explicit offset names, in milliseconds. */
export const at = (iso: string): number => {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new Error(`Bad time in test: ${iso}`);
  return ms;
};

/**
 * A session as the app sends it to save_session, from its running periods (ISO strings with an
 * explicit offset) in the London zone: the days are split the way the core splits them.
 */
export function sessionToSave(id: string, periods: [from: string, to: string][]) {
  const timeZone = 'Europe/London';
  const running = periods.map(([from, to]) => ({ from: at(from), to: at(to) }));
  return {
    p_id: id,
    p_started_at: periods[0][0],
    p_ended_at: periods[periods.length - 1][1],
    p_time_zone: timeZone,
    p_periods: periods.map(([from, to]) => ({ from, to })),
    p_work_ms: running.reduce((sum, period) => sum + (period.to - period.from), 0),
    p_days: sessionDays(running, timeZone).map((day) => ({ date: day.date, work_ms: day.workTime })),
  };
}

/** A session as the app sends it to save_session: one that ran past midnight. */
export function aSession(id = crypto.randomUUID()) {
  return sessionToSave(id, [
    ['2026-09-10T22:00:00+01:00', '2026-09-10T23:30:00+01:00'],
    ['2026-09-11T00:00:00+01:00', '2026-09-11T01:30:00+01:00'],
  ]);
}

/** Saves a session as `user` and expects it to go through. */
export async function save(user: SupabaseClient, session: ReturnType<typeof sessionToSave>): Promise<void> {
  const { error } = await user.rpc('save_session', session);
  expect(error).toBeNull();
}

/**
 * A goal as the app sends it to save_goal: "Finals", 100 hours by 24 October 2026, created on
 * the morning of 10 September, switched off an hour later and back on an hour after that.
 */
export function aGoal(id = crypto.randomUUID()) {
  return {
    p_id: id,
    p_name: 'Finals',
    p_target_ms: 100 * HOUR,
    p_deadline: '2026-10-24',
    p_time_zone: 'Europe/London',
    p_created_at: '2026-09-10T08:00:00+01:00',
    p_celebrated_at: null as string | null,
    p_switches: [
      { at: '2026-09-10T09:00:00+01:00', active: false },
      { at: '2026-09-10T10:00:00+01:00', active: true },
    ],
  };
}

/** Saves a goal as `user` and expects it to go through. */
export async function saveGoal(user: SupabaseClient, goal: ReturnType<typeof aGoal>): Promise<void> {
  const { error } = await user.rpc('save_goal', goal);
  expect(error).toBeNull();
}

/** The settings as the app sends them to save_profile. */
export const someSettings = {
  p_display_name: 'Sam' as string | null,
  p_petal_colour: 'blue' as string | null,
  p_pause_warnings: false,
  p_streak_reminder: true,
};

/** Saves the settings as `user` and expects it to go through. */
export async function saveSettings(user: SupabaseClient, settings: typeof someSettings): Promise<void> {
  const { error } = await user.rpc('save_profile', settings);
  expect(error).toBeNull();
}
