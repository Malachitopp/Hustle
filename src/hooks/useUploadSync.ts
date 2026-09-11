import * as Network from 'expo-network';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { view } from '@/core';
import { phoneTimeZone } from '@/phone';
import { useStore } from '@/store';
import { deleteGoals, uploadGoals, uploadSessions, uploadSettings } from '@/uploads';

/**
 * Uploads whatever the core says is waiting (ended sessions, changed and deleted goals, changed
 * settings), at the moments the spec names and no others: after any change to the history (which
 * is how a session ending, a goal changing or a sign-in sets one off), when the app opens or comes
 * back to the foreground, and when the connection returns. There is no polling: an upload that
 * fails just waits for the next of those moments.
 */
export function useUploadSync(): void {
  const { state, act } = useStore();

  useEffect(() => {
    const sync = () => {
      const waiting = view(state, Date.now(), phoneTimeZone());
      if (waiting.uploads.length > 0) {
        uploadSessions(waiting.uploads, (sessionIds) => act({ type: 'confirm-uploaded', sessionIds }));
      }
      if (waiting.goalUploads.length > 0) {
        uploadGoals(waiting.goalUploads, (goals) => act({ type: 'confirm-goals-uploaded', goals }));
      }
      if (waiting.goalDeletions.length > 0) {
        deleteGoals(waiting.goalDeletions, (goalIds) => act({ type: 'confirm-goals-deleted', goalIds }));
      }
      if (waiting.settingsUpload) {
        uploadSettings(waiting.settingsUpload, (settings) => act({ type: 'confirm-settings-uploaded', settings }));
      }
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
