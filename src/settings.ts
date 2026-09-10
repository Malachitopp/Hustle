/**
 * The user's preferences, kept on the phone. No product rule depends on them, so none of this
 * is in the core: the core says what the plant looks like, and the settings say what colour.
 */
import { defaultPetalColour, isPetalColour, type PetalColour } from '@/plants';

export type Settings = {
  petalColour: PetalColour;
};

export const defaultSettings: Settings = {
  petalColour: defaultPetalColour,
};

/**
 * Settings read back from the phone. Anything missing or unrecognised falls back to its
 * default, so a setting added or renamed later never makes an older saved copy unreadable.
 */
export function parseSettings(saved: unknown): Settings {
  const raw = typeof saved === 'object' && saved !== null ? (saved as Record<string, unknown>) : {};
  return {
    petalColour: isPetalColour(raw.petalColour) ? raw.petalColour : defaultSettings.petalColour,
  };
}
