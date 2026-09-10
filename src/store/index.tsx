/**
 * The store: keeps the stored history and the settings in memory, applies actions to the
 * history through the core, and saves whichever one changed to the phone after every change.
 * Screens read it with `useStore`.
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

import { apply, type Action, type State } from '@/core';
import type { Settings } from '@/settings';
import { saveSettings, saveState } from '@/storage';

type Untimed<A> = A extends { at: number } ? Omit<A, 'at'> : never;

/** An action before the store stamps it with the current time. */
export type PendingAction = Untimed<Action>;

type Store = {
  state: State;
  /** Applies an action as of now. The store is the one place that reads the clock for an action. */
  act: (action: PendingAction) => void;
  settings: Settings;
  /** Changes one or more settings and saves them. */
  updateSettings: (changes: Partial<Settings>) => void;
};

const StoreContext = createContext<Store | null>(null);

type Props = {
  history: State;
  settings: Settings;
  children: ReactNode;
};

export function StoreProvider({ history, settings: initialSettings, children }: Props) {
  const [state, setState] = useState(history);
  const latestState = useRef(history);
  const [settings, setSettings] = useState(initialSettings);
  const latestSettings = useRef(initialSettings);

  const act = useCallback((pending: PendingAction) => {
    const action = { ...pending, at: Date.now() } as Action;
    const next = apply(latestState.current, action);
    if (next === latestState.current) return;
    latestState.current = next;
    setState(next);
    saveState(next).catch((error: unknown) => console.error('Could not save the history.', error));
  }, []);

  const updateSettings = useCallback((changes: Partial<Settings>) => {
    const next = { ...latestSettings.current, ...changes };
    latestSettings.current = next;
    setSettings(next);
    saveSettings(next).catch((error: unknown) => console.error('Could not save the settings.', error));
  }, []);

  const store = useMemo(
    () => ({ state, act, settings, updateSettings }),
    [state, act, settings, updateSettings],
  );
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore must be used inside StoreProvider.');
  return store;
}
