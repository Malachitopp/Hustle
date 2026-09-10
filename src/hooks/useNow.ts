import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

const MINUTE = 60_000;

/**
 * The current time, refreshed just after every minute boundary and whenever the app comes back
 * to the foreground. Screens use it to ask the core for a fresh view.
 */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());

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

  return now;
}
