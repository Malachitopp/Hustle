/**
 * The store: keeps the stored history in memory, applies actions through the core, and saves
 * the result to the phone after every change. Screens read it with `useStore`.
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

import { apply, type Action, type State } from '@/core';
import { saveState } from '@/storage';

type Untimed<A> = A extends { at: number } ? Omit<A, 'at'> : never;

/** An action before the store stamps it with the current time. */
export type PendingAction = Untimed<Action>;

type Store = {
  state: State;
  /** Applies an action as of now. The store is the one place that reads the clock for an action. */
  act: (action: PendingAction) => void;
};

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ initial, children }: { initial: State; children: ReactNode }) {
  const [state, setState] = useState(initial);
  const latest = useRef(initial);

  const act = useCallback((pending: PendingAction) => {
    const action = { ...pending, at: Date.now() } as Action;
    const next = apply(latest.current, action);
    if (next === latest.current) return;
    latest.current = next;
    setState(next);
    saveState(next).catch((error: unknown) => console.error('Could not save the history.', error));
  }, []);

  const store = useMemo(() => ({ state, act }), [state, act]);
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore must be used inside StoreProvider.');
  return store;
}
