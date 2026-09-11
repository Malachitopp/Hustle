/**
 * Uploading: the thin adapter that carries changes from the phone up to the account. The core
 * says what is waiting (`view(...).uploads`, `goalUploads`, `goalDeletions` and
 * `settingsUpload`); this file sends it through the database's functions, each of which stores
 * a thing and, for one the account already has, leaves it alone (a session) or brings it up to
 * date (a goal, the settings), so a retry can never store one twice. What the account took is
 * handed back for the core to take off its queues. Uploads of every kind run one after another,
 * so two can never race for the same row.
 */
import { sessionWorkTime, type EndedSession, type Goal, type Settings } from '@/core';
import { supabase } from '@/supabase';

let queue: Promise<void> = Promise.resolve();

/**
 * Runs `job` once every upload asked for before it has finished. Never rejects: a failure (no
 * connection, say) is logged, and whatever was not sent waits for the next call.
 */
function enqueue(job: () => Promise<void>, failure: string): Promise<void> {
  queue = queue.then(job).catch((error: unknown) => console.warn(failure, error));
  return queue;
}

/** The sessions most recently asked for. */
let wantedSessions: readonly EndedSession[] = [];
/**
 * What the last run stored. A run queued while that one was under way was asked for the same
 * sessions, before the core had heard they were stored, so it skips them.
 */
let justStored = new Set<string>();

/**
 * Uploads `sessions` and calls `onStored` with the ids of those the account stored, if any. A
 * call while an upload is under way waits for it, then sends the latest list asked for, so a
 * burst of changes ends with one upload. A failure stops the run at that session, and the rest
 * wait for the next call.
 */
export function uploadSessions(sessions: readonly EndedSession[], onStored: (sessionIds: string[]) => void) {
  wantedSessions = sessions;
  return enqueue(async () => {
    const sending = wantedSessions.filter((session) => !justStored.has(session.id));
    wantedSessions = [];
    const stored: string[] = [];
    if (supabase) {
      for (const session of sending) {
        const { error } = await supabase.rpc('save_session', sessionRow(session));
        if (error) {
          console.warn(`Could not upload session ${session.id}: ${error.message}`);
          break;
        }
        stored.push(session.id);
      }
    }
    justStored = new Set(stored);
    if (stored.length > 0) onStored(stored);
  }, 'Could not upload sessions.');
}

/** The goals most recently asked for. */
let wantedGoals: readonly Goal[] = [];

/**
 * Sends `goals` as they are now and calls `onStored` with those the account took, if any. A call
 * while an upload is under way waits for it, then sends the latest list asked for. A goal changed
 * again while its upload was on its way goes again with the next call: the core keeps it waiting
 * until the account holds it exactly as it is.
 */
export function uploadGoals(goals: readonly Goal[], onStored: (goals: Goal[]) => void): Promise<void> {
  wantedGoals = goals;
  return enqueue(async () => {
    const sending = wantedGoals;
    wantedGoals = [];
    const stored: Goal[] = [];
    if (supabase) {
      for (const goal of sending) {
        const { error } = await supabase.rpc('save_goal', goalRow(goal));
        if (error) {
          console.warn(`Could not upload goal ${goal.id}: ${error.message}`);
          break;
        }
        stored.push(goal);
      }
    }
    if (stored.length > 0) onStored(stored);
  }, 'Could not upload goals.');
}

/** The deletions most recently asked for. */
let wantedDeletions: readonly string[] = [];

/**
 * Deletes the goals with these ids from the account and calls `onDeleted` with the ids of those
 * it confirmed, if any. Deleting a goal the account never had is confirmed like any other. The
 * account keeps a marker of each deletion, so another phone that still shows the goal learns it went.
 */
export function deleteGoals(goalIds: readonly string[], onDeleted: (goalIds: string[]) => void): Promise<void> {
  wantedDeletions = goalIds;
  return enqueue(async () => {
    const sending = wantedDeletions;
    wantedDeletions = [];
    const deleted: string[] = [];
    if (supabase) {
      for (const id of sending) {
        const { error } = await supabase.rpc('delete_goal', { p_id: id });
        if (error) {
          console.warn(`Could not delete goal ${id} from the account: ${error.message}`);
          break;
        }
        deleted.push(id);
      }
    }
    if (deleted.length > 0) onDeleted(deleted);
  }, 'Could not delete goals from the account.');
}

/** The settings most recently asked for. */
let wantedSettings: Settings | null = null;

/**
 * Sends the settings as they are now and calls `onStored` with them once the account holds them.
 * A call while an upload is under way waits for it, then sends the latest settings asked for.
 */
export function uploadSettings(settings: Settings, onStored: (settings: Settings) => void): Promise<void> {
  wantedSettings = settings;
  return enqueue(async () => {
    const sending = wantedSettings;
    wantedSettings = null;
    if (!sending || !supabase) return;
    const { error } = await supabase.rpc('save_profile', settingsRow(sending));
    if (error) {
      console.warn(`Could not upload the settings: ${error.message}`);
      return;
    }
    onStored(sending);
  }, 'Could not upload the settings.');
}

/** A session as save_session takes it: instants as ISO strings, dates as they are. */
function sessionRow(session: EndedSession) {
  return {
    p_id: session.id,
    p_started_at: iso(session.startedAt),
    p_ended_at: iso(session.endedAt),
    p_time_zone: session.timeZone,
    p_periods: session.periods.map((period) => ({ from: iso(period.from), to: iso(period.to) })),
    p_work_ms: sessionWorkTime(session),
    p_days: session.days.map((day) => ({ date: day.date, work_ms: day.workTime })),
  };
}

/** A goal as save_goal takes it, its switch history included. */
function goalRow(goal: Goal) {
  return {
    p_id: goal.id,
    p_name: goal.name,
    p_target_ms: goal.target,
    p_deadline: goal.deadline,
    p_time_zone: goal.timeZone,
    p_created_at: iso(goal.createdAt),
    p_celebrated_at: goal.celebratedAt === null ? null : iso(goal.celebratedAt),
    p_switches: goal.switches.map((flick) => ({ at: iso(flick.at), active: flick.active })),
  };
}

/** The settings as save_profile takes them. */
function settingsRow(settings: Settings) {
  return {
    p_display_name: settings.displayName,
    p_petal_colour: settings.petalColour,
    p_pause_warnings: settings.notificationSwitches.pauseWarnings,
    p_streak_reminder: settings.notificationSwitches.streakReminder,
  };
}

const iso = (instant: number): string => new Date(instant).toISOString();
