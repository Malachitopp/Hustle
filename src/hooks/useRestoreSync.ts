import * as Network from 'expo-network';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { view } from '@/core';
import { phoneTimeZone } from '@/phone';
import { restoreAccount } from '@/restore';
import { useStore } from '@/store';
import { supabase } from '@/supabase';

/**
 * Restores what the account holds (its record, goals and settings) to the phone while the core
 * says a restore is wanted: from a sign-in until the download has been merged in. Tried at the
 * same moments as uploads and no others: after any change to the history (which is how the
 * sign-in itself sets it off), when the app opens or comes back to the foreground, and when the
 * connection returns. There is no polling.
 */
export function useRestoreSync(): void {
  const { state, act } = useStore();

  useEffect(() => {
    const client = supabase;
    const account = state.account;
    if (!client || !account) return;
    const sync = () => {
      if (!view(state, Date.now(), phoneTimeZone()).restoreWanted) return;
      restoreAccount(client, (data) => act({ type: 'restore', userId: account.userId, ...data }));
    };
    sync();
    const app = AppState.addEventListener('change', (status) => {
      if (status === 'active') sync();
    });
    const network = Network.addNetworkStateListener((event) => {
      if (event.isInternetReachable) sync();
    });
    return () => {
      app.remove();
      network.remove();
    };
  }, [state, act]);
}
