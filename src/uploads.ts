/**
 * Uploading: the thin adapter that carries ended sessions from the phone to the account. The
 * core says which sessions are waiting (`view(...).uploads`); this file sends them, oldest first,
 * through the database's save_session function, which stores a session and its days in one
 * step and leaves alone a session it already has, so a retry can never store one twice. The
 * sessions the account stored are handed back for the core to take off the queue.
 */
import { sessionWorkTime, type EndedSession } from '@/core';
import { supabase } from '@/supabase';

type OnStored = (sessionIds: string[]) => void;

/** The sessions most recently asked for. */
let wanted: readonly EndedSession[] = [];
/** Uploads run one after another, so two can never race for the same session. */
let queue: Promise<void> = Promise.resolve();
/**
 * What the last run stored. A run queued while that one was under way was asked for the same
 * sessions, before the core had heard they were stored, so it skips them.
 */
let justStored = new Set<string>();

/**
 * Uploads `sessions` and calls `onStored` with the ids of those the account stored, if any. A
 * call while an upload is under way waits for it, then sends the latest list asked for, so a
 * burst of changes ends with one upload. A failure (no connection, say) stops the run at that
 * session, and the rest wait for the next call. Never rejects.
 */
export function uploadSessions(sessions: readonly EndedSession[], onStored: OnStored): Promise<void> {
  wanted = sessions;
  queue = queue
    .then(() => upload(onStored))
    .catch((error: unknown) => console.warn('Could not upload sessions.', error));
  return queue;
}

async function upload(onStored: OnStored): Promise<void> {
  const sessions = wanted.filter((session) => !justStored.has(session.id));
  wanted = [];
  const stored: string[] = [];
  if (supabase) {
    for (const session of sessions) {
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

const iso = (instant: number): string => new Date(instant).toISOString();
