import { useEffect } from 'react';
import { AppState } from 'react-native';

import { view, type State } from '@/core';
import { syncNotifications } from '@/notifications';
import { phoneTimeZone } from '@/phone';

/**
 * Keeps the phone's pending notifications matching the core's schedule: after every change to
 * the history, and whenever the app comes back to the foreground, by which time the phone's
 * clock or zone may have moved on and notifications already shown have left the schedule.
 */
export function useNotificationSync(state: State): void {
  useEffect(() => {
    const sync = () => {
      syncNotifications(view(state, Date.now(), phoneTimeZone()).notifications);
    };
    sync();
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active') sync();
    });
    return () => subscription.remove();
  }, [state]);
}
