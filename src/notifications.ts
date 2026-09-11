/**
 * The thin adapter between the core's notification schedule and the phone. Whenever the
 * schedule changes, the phone's pending notifications are replaced with it, so the phone always
 * holds exactly what the core says is still to come. Everything is local: there is no push
 * server. The phone's permission is asked once, at the first Start; without it the phone shows
 * nothing, and the app works exactly the same.
 */
import * as Notifications from 'expo-notifications';

import type { ScheduledNotification } from '@/core';
import { reportError } from '@/crashReports';

/** The schedule most recently asked for. */
let wanted: ScheduledNotification[] = [];
/** The schedule the phone was last given, as a key, or null if it may hold something else. */
let synced: string | null = null;
/** Replacements run one after another, so two in a row can never interleave on the phone. */
let queue: Promise<void> = Promise.resolve();

/** Gives the phone `schedule` in place of its pending notifications, unless it already has it. */
export function syncNotifications(schedule: ScheduledNotification[]): Promise<void> {
  wanted = schedule;
  return replaceLater(false);
}

function replaceLater(force: boolean): Promise<void> {
  queue = queue
    .then(() => replacePending(force))
    .catch((error: unknown) => reportError('Could not schedule notifications.', error));
  return queue;
}

async function replacePending(force: boolean): Promise<void> {
  // The latest schedule when this runs, so a burst of changes ends with one replacement.
  const schedule = wanted;
  const key = JSON.stringify(schedule);
  if (!force && key === synced) return;
  // Until every notification is in place, the phone holds something else.
  synced = null;
  await Notifications.cancelAllScheduledNotificationsAsync();
  for (const notification of schedule) {
    await Notifications.scheduleNotificationAsync({
      content: { body: notification.text, sound: 'default' },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: notification.at },
    });
  }
  synced = key;
}

/**
 * Asks the phone for permission to show notifications, if it has never been asked. Start calls
 * this, so the first Start is the one that asks; once the phone has an answer it is never asked
 * again. After the answer the schedule is given to the phone afresh, since whatever was
 * scheduled before the answer may not have been kept. Never rejects.
 */
export async function askNotificationPermission(): Promise<void> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== Notifications.PermissionStatus.UNDETERMINED) return;
    await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowSound: true, allowBadge: false },
    });
  } catch (error) {
    reportError('Could not ask for notification permission.', error);
    return;
  }
  await replaceLater(true);
}

/**
 * Whether the phone lets Hustle show notifications: false once the user has said no, null
 * while they have not been asked or the phone could not say. Settings shows a hint on false.
 */
export async function notificationsAllowed(): Promise<boolean | null> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status === Notifications.PermissionStatus.GRANTED) return true;
    return status === Notifications.PermissionStatus.DENIED ? false : null;
  } catch {
    return null;
  }
}
