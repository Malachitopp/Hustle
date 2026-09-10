/**
 * Phone storage: the full local copy of the stored history, saved as one JSON document in a
 * SQLite-backed key-value store. Screens never read this directly; the store keeps the history
 * in memory and saves it after every action.
 */
import Storage from 'expo-sqlite/kv-store';

import { initialState, type State } from '@/core';

const KEY = 'hustle/history';
const UNREADABLE_KEY = 'hustle/history.unreadable';

/** Bump when the shape of `State` changes, and migrate in `loadState`. */
const VERSION = 1;

type Envelope = { version: number; state: State };

/** The saved history, or a fresh one on first launch. */
export async function loadState(): Promise<State> {
  const raw = await Storage.getItemAsync(KEY);
  if (raw === null) return initialState;
  try {
    const envelope = JSON.parse(raw) as Partial<Envelope>;
    if (envelope.version === VERSION && envelope.state) return envelope.state;
  } catch {
    // Fall through: the document is not JSON.
  }
  // Never overwrite something that could not be read. Keep it aside and start fresh.
  console.error('The saved history was unreadable. A copy was kept and a fresh history started.');
  await Storage.setItemAsync(UNREADABLE_KEY, raw);
  return initialState;
}

let queue: Promise<void> = Promise.resolve();

/** Saves the history. Saves run one after another, so the latest call is what ends up stored. */
export function saveState(state: State): Promise<void> {
  const envelope: Envelope = { version: VERSION, state };
  const document = JSON.stringify(envelope);
  queue = queue.catch(() => undefined).then(() => Storage.setItemAsync(KEY, document));
  return queue;
}
