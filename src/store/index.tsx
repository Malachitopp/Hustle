/**
 * The store: keeps the stored history in memory, applies actions to it through the core, and
 * saves it to the phone after every change. Screens read it with `useStore`.
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

import { apply, type Action, type State } from '@/core';
import { saveState } from '@/storage';

type Untimed<A> = A extends { at: number } ? Omit<A, 'at'> : never;

/** An action before the store stamps it with the current time. */
export type PendingAction = Untimed<Action>;

type Store = {
  state: State;
  /**
   * Applies an action as of now and returns the history after it (the same one when the action
   * changed nothing). The store is the one place that reads the clock for an action.
   */
  act: (action: PendingAction) => State;
};

const StoreContext = createContext<Store | null>(null);

type Props = {
  history: State;
  children: ReactNode;
};

export function StoreProvider({ history, children }: Props) {
  const [state, setState] = useState(history);
  const latestState = useRef(history);

  const act = useCallback((pending: PendingAction): State => {
    const action = { ...pending, at: Date.now() } as Action;
    const next = apply(latestState.current, action);
    if (next === latestState.current) return next;
    latestState.current = next;
    setState(next);
    saveState(next).catch((error: unknown) => console.error('Could not save the history.', error));
    return next;
  }, []);

  const store = useMemo(() => ({ state, act }), [state, act]);
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore must be used inside StoreProvider.');
  return store;
}
