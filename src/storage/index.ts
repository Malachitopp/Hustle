/**
 * Phone storage: the full local copy of the stored history and the settings, each saved as one
 * JSON document in a SQLite-backed key-value store. Screens never read this directly; the store
 * keeps both in memory and saves after every change.
 */
import Storage from 'expo-sqlite/kv-store';

import { initialState, type State } from '@/core';
import { defaultSettings, parseSettings, type Settings } from '@/settings';
import { migrate, VERSION } from '@/storage/migrations';

const HISTORY_KEY = 'hustle/history';
const UNREADABLE_HISTORY_KEY = 'hustle/history.unreadable';
const SETTINGS_KEY = 'hustle/settings';

type Envelope = { version: number; state: State };

/** The saved history, or a fresh one on first launch. */
export async function loadState(): Promise<State> {
  const raw = await Storage.getItemAsync(HISTORY_KEY);
  if (raw === null) return initialState;
  try {
    const envelope = JSON.parse(raw) as Partial<Envelope>;
    if (typeof envelope.version === 'number' && envelope.state) {
      const state = migrate(envelope.version, envelope.state);
      if (state) {
        // Keep the phone's copy in the current shape, so an older shape is only ever read once.
        if (envelope.version !== VERSION) await saveState(state);
        return state;
      }
    }
  } catch {
    // Fall through: the document is not JSON.
  }
  // Never overwrite something that could not be read. Keep it aside and start fresh.
  console.error('The saved history was unreadable. A copy was kept and a fresh history started.');
  await Storage.setItemAsync(UNREADABLE_HISTORY_KEY, raw);
  return initialState;
}

/** Saves the history. Saves run one after another, so the latest call is what ends up stored. */
export function saveState(state: State): Promise<void> {
  const envelope: Envelope = { version: VERSION, state };
  return save(HISTORY_KEY, JSON.stringify(envelope));
}

/** The saved settings, with defaults for anything missing, or the defaults on first launch. */
export async function loadSettings(): Promise<Settings> {
  const raw = await Storage.getItemAsync(SETTINGS_KEY);
  if (raw === null) return defaultSettings;
  try {
    return parseSettings(JSON.parse(raw));
  } catch {
    console.error('The saved settings were unreadable. The defaults are used.');
    return defaultSettings;
  }
}

export function saveSettings(settings: Settings): Promise<void> {
  return save(SETTINGS_KEY, JSON.stringify(settings));
}

let queue: Promise<void> = Promise.resolve();

/** Writes one document. Writes run one after another, so the latest call is what ends up stored. */
function save(key: string, document: string): Promise<void> {
  queue = queue.catch(() => undefined).then(() => Storage.setItemAsync(key, document));
  return queue;
}
