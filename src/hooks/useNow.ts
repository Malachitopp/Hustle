import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

const MINUTE = 60_000;

/**
 * The current time, refreshed just after every minute boundary and whenever the app comes back
 * to the foreground. Screens use it to ask the core for a fresh view.
 *
 * Also returns `wakeAt`: call it with an instant to get one extra refresh the moment it arrives
 * (an auto-end, say), or with null to cancel. Only the latest instant is kept.
 */
export function useNow(): [now: number, wakeAt: (instant: number | null) => void] {
  const [now, setNow] = useState(() => Date.now());
  const wake = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      const current = Date.now();
      setNow(current);
      timer = setTimeout(tick, MINUTE - (current % MINUTE) + 100);
    };
    tick();
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active') {
        clearTimeout(timer);
        tick();
      }
    });
    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, []);

  const wakeAt = useCallback((instant: number | null) => {
    clearTimeout(wake.current);
    if (instant === null) return;
    const delay = Math.max(0, instant - Date.now()) + 100;
    wake.current = setTimeout(() => setNow(Date.now()), delay);
  }, []);

  useEffect(() => () => clearTimeout(wake.current), []);

  return [now, wakeAt];
}
