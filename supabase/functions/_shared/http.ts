/**
 * Shared by the Edge Functions: who is calling, the server's own database client, and JSON
 * answers. The functions check the caller themselves rather than leaving it to the gateway,
 * because the app's key is a publishable key, not a JWT, and because only Supabase Auth can say
 * whether the user behind a token still exists.
 */
import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2';

/** A JSON answer with the given status. */
export function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** A secret or setting the function cannot do without. */
export function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not set.`);
  return value;
}

/**
 * A client with the server's own role, which row-level security does not bind and which alone
 * may reach the Apple tokens and delete a user's rows. Never handed to the caller.
 */
export function serviceClient(): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/**
 * Who is calling, as Supabase Auth confirms from the token in the Authorization header, or null
 * if nobody is signed in: no token, a token Auth does not accept, or a user who no longer exists.
 */
export async function caller(req: Request): Promise<User | null> {
  const header = req.headers.get('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
  if (token === '') return null;
  const { data, error } = await serviceClient().auth.getUser(token);
  return error || !data.user ? null : data.user;
}
