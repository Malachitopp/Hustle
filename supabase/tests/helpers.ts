/**
 * Shared by the database tests: clients of the dev project, throwaway users who sign up at the
 * start of a run, and sessions shaped the way the app sends them to save_session.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
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
