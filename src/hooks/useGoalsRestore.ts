import { useEffect } from 'react';

import { restoreGoals } from '@/restore';
import { useStore } from '@/store';
import { supabase } from '@/supabase';

/**
 * Fetches the account's goals when Goals is opened, so goals made, changed or deleted on another
 * phone turn up. Fetched once per account while the app stays open, so switching tabs never
 * re-fetches, and not until the sign-in's own restore has landed, which brings the goals anyway.
 * Nothing happens for a guest, who has no account to fetch from.
 */
export function useGoalsRestore(): void {
  const { state, act } = useStore();
  const userId = state.account?.userId ?? null;
  const restored = state.account?.restored ?? false;

  useEffect(() => {
    const client = supabase;
    if (!client || userId === null || !restored) return;
    restoreGoals(client, userId, (downloaded) => act({ type: 'add-downloaded-goals', userId, ...downloaded }));
  }, [userId, restored, act]);
}
