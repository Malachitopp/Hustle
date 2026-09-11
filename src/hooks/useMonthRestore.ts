import { useEffect } from 'react';

import type { DateKey } from '@/core';
import { restoreMonth } from '@/restore';
import { useStore } from '@/store';
import { supabase } from '@/supabase';

/**
 * Fetches the sessions of the month the Calendar is showing that the phone does not have yet, so
 * work recorded on another phone turns up. Each month is fetched once per account while the app
 * stays open, so switching tabs or browsing back and forth never re-fetches. Nothing happens for a
 * guest, who has no account to fetch from.
 */
export function useMonthRestore(first: DateKey): void {
  const { state, act } = useStore();
  const userId = state.account?.userId ?? null;
  const record = state.record;

  useEffect(() => {
    const client = supabase;
    if (!client || userId === null) return;
    const knownIds = new Set(record.map((session) => session.id));
    restoreMonth(client, userId, first, knownIds, (sessions) =>
      act({ type: 'add-downloaded', userId, sessions }),
    );
  }, [first, userId, record, act]);
}
