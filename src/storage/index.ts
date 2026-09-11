/**
 * Phone storage: the full local copy of the stored history, saved as one JSON document in a
 * SQLite-backed key-value store. Screens never read this directly; the store keeps the history
 * in memory and saves after every change.
 */
import Storage from 'expo-sqlite/kv-store';

import { initialState, type State } from '@/core';
import { reportError } from '@/crashReports';
import { isPetalColour } from '@/plants';
import { migrate, VERSION } from '@/storage/migrations';

const HISTORY_KEY = 'hustle/history';
const UNREADABLE_HISTORY_KEY = 'hustle/history.unreadable';
/** Where the petal colour lived, as a settings document of its own, before history version 9. */
const OLD_SETTINGS_KEY = 'hustle/settings';
const PETAL_COLOUR_IN_HISTORY_FROM = 9;

type Envelope = { version: number; state: State };

/** The saved history, or a fresh one on first launch. */
export async function loadState(): Promise<State> {
  const raw = await Storage.getItemAsync(HISTORY_KEY);
  if (raw === null) return initialState;
  try {
    const envelope = JSON.parse(raw) as Partial<Envelope>;
    if (typeof envelope.version === 'number' && envelope.state) {
      let state = migrate(envelope.version, envelope.state);
      if (state) {
        if (envelope.version < PETAL_COLOUR_IN_HISTORY_FROM) {
          state = { ...state, petalColour: await oldPetalColour() };
        }
        // Keep the phone's copy in the current shape, so an older shape is only ever read once.
        if (envelope.version !== VERSION) await saveState(state);
        return state;
      }
    }
  } catch {
    // Fall through: the document is not JSON.
  }
  // Never overwrite something that could not be read. Keep it aside and start fresh.
  reportError('The saved history was unreadable. A copy was kept and a fresh history started.');
  await Storage.setItemAsync(UNREADABLE_HISTORY_KEY, raw);
  return initialState;
}

/** Saves the history. Saves run one after another, so the latest call is what ends up stored. */
export function saveState(state: State): Promise<void> {
  const envelope: Envelope = { version: VERSION, state };
  return save(HISTORY_KEY, JSON.stringify(envelope));
}

/**
 * The petal colour from the settings document that held it before version 9, or null if there
 * was none or it named a colour the app does not know. Read once, on the way to version 9.
 */
async function oldPetalColour(): Promise<string | null> {
  try {
    const raw = await Storage.getItemAsync(OLD_SETTINGS_KEY);
    if (raw === null) return null;
    const saved = JSON.parse(raw) as { petalColour?: unknown } | null;
    return saved && isPetalColour(saved.petalColour) ? saved.petalColour : null;
  } catch {
    return null;
  }
}

let queue: Promise<void> = Promise.resolve();

/** Writes one document. Writes run one after another, so the latest call is what ends up stored. */
function save(key: string, document: string): Promise<void> {
  queue = queue.catch(() => undefined).then(() => Storage.setItemAsync(key, document));
  return queue;
}
