import * as Network from 'expo-network';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { view } from '@/core';
import { phoneTimeZone } from '@/phone';
import { useStore } from '@/store';
import { uploadSessions } from '@/uploads';

/**
 * Uploads whatever the core says is waiting, at the moments the spec names and no others: after
 * any change to the history (which is how a session ending, or a sign-in, sets one off), when
 * the app opens or comes back to the foreground, and when the connection returns. There is no
 * polling: an upload that fails just waits for the next of those moments.
 */
export function useUploadSync(): void {
  const { state, act } = useStore();

  useEffect(() => {
    const sync = () => {
      const waiting = view(state, Date.now(), phoneTimeZone()).uploads;
      if (waiting.length === 0) return;
      uploadSessions(waiting, (sessionIds) => act({ type: 'confirm-uploaded', sessionIds }));
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
