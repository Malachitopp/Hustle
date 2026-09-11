import * as Network from 'expo-network';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { view } from '@/core';
import { withRetries } from '@/hooks/retries';
import { phoneTimeZone } from '@/phone';
import { useStore } from '@/store';
import { deleteGoals, uploadGoals, uploadSessions, uploadSettings } from '@/uploads';

/**
 * Uploads whatever the core says is waiting (ended sessions, changed and deleted goals, changed
 * settings), at the moments the spec names and no others: after any change to the history (which
 * is how a session ending, a goal changing or a sign-in sets one off), when the app opens or comes
 * back to the foreground, and when the connection returns. There is no polling: an attempt that
 * fails is tried again a few seconds later, and once more after that, and then whatever was not
 * sent waits for the next of those moments.
 */
export function useUploadSync(): void {
  const { state, act } = useStore();

  useEffect(() => {
    // Whether everything waiting went through. A change that went through comes back as a new
    // history, which starts this effect over; one that did not is what the retries are for.
    const attempt = async (): Promise<boolean> => {
      const waiting = view(state, Date.now(), phoneTimeZone());
      const runs: Promise<boolean>[] = [];
      if (waiting.uploads.length > 0) {
        runs.push(uploadSessions(waiting.uploads, (sessionIds) => act({ type: 'confirm-uploaded', sessionIds })));
      }
      if (waiting.goalUploads.length > 0) {
        runs.push(uploadGoals(waiting.goalUploads, (goals) => act({ type: 'confirm-goals-uploaded', goals })));
      }
      if (waiting.goalDeletions.length > 0) {
        runs.push(deleteGoals(waiting.goalDeletions, (goalIds) => act({ type: 'confirm-goals-deleted', goalIds })));
      }
      if (waiting.settingsUpload) {
        runs.push(
          uploadSettings(waiting.settingsUpload, (settings) => act({ type: 'confirm-settings-uploaded', settings })),
        );
      }
      return (await Promise.all(runs)).every((sentAll) => sentAll);
    };

    // Each moment starts a fresh attempt, with its retries, in place of any still to come.
    let stop = () => {};
    const sync = () => {
      stop();
      stop = withRetries(attempt);
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
      stop();
    };
  }, [state, act]);
}
