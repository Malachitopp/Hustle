/**
 * The Supabase client, the app's only line to the server. The project's URL and public key
 * come from the build's environment: EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY,
 * read from .env.local when running locally and from EAS environment variables in a build. The
 * signed-in session lives in the same SQLite key-value store as the history. Null when the
 * build has no project, in which case everything works as it does for a guest: there is nothing
 * to sign in to and nothing uploads.
 *
 * Tokens are refreshed only when a request needs one, never on a timer. The app talks to the
 * server only at the moments the spec names, and a session that has sat for hours refreshes
 * itself on the way to the next upload.
 */
import { createClient, processLock, type SupabaseClient } from '@supabase/supabase-js';
import Storage from 'expo-sqlite/kv-store';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: {
          storage: Storage,
          persistSession: true,
          autoRefreshToken: false,
          detectSessionInUrl: false,
          lock: processLock,
        },
      })
    : null;
