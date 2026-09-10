/** The few things the app needs from the phone itself. The core never touches these. */
import * as Crypto from 'expo-crypto';

/**
 * A fresh ID for a session or a goal, generated on the phone so anything created offline can be
 * saved now and uploaded later without a duplicate.
 */
export function newId(): string {
  return Crypto.randomUUID();
}

/** The phone's current IANA time zone, e.g. "Europe/London". */
export function phoneTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}
