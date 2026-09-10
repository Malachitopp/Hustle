/** The few things the app needs from the phone itself. The core never touches these. */
import * as Crypto from 'expo-crypto';

/** A fresh session ID, generated on the phone so offline sessions can be saved and uploaded later. */
export function newSessionId(): string {
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
