/**
 * Restoring: the thin adapter that carries the account's sessions down to the phone, the
 * opposite of `uploads`. Two downloads: the whole record, once per sign-in, so a new phone or a
 * fresh install picks up where the account left off; and one month at a time as the Calendar
 * shows it, so sessions recorded on another phone turn up, fetched once per month while the app
 * stays open. The core merges what comes down by id (`restore` and `add-downloaded`), so nothing
 * is ever doubled. The client is passed in rather than imported, so the queries can be run
 * against the dev project in the database tests.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import { monthOf, sessionDays, type DateKey, type EndedSession } from '@/core';

type OnDownloaded = (sessions: EndedSession[]) => void;

/** The download of the whole record under way, if any. */
let recordDownload: Promise<void> | null = null;

/**
 * Downloads the account's whole record and hands it to `onDownloaded`. One download at a time: a
 * call while one is under way waits for it and does nothing more, because the core will have
 * marked the restore done, or will ask again at the next moment if it failed. Never rejects.
 */
export function restoreRecord(client: SupabaseClient, onDownloaded: OnDownloaded): Promise<void> {
  if (recordDownload) return recordDownload;
  recordDownload = downloadRecord(client)
    .then(onDownloaded)
    .catch((error: unknown) => console.warn('Could not download the record.', error))
    .finally(() => {
      recordDownload = null;
    });
  return recordDownload;
}

/** The months downloaded since the app opened, as "<user id>|<first date>", and those under way. */
const monthsDownloaded = new Set<string>();
const monthDownloads = new Map<string, Promise<void>>();

/**
 * Downloads the sessions of the month starting on `first` that the phone does not have yet and
 * hands them to `onDownloaded`. Each month is downloaded once per account for as long as the app
 * stays open, so switching tabs never re-fetches; a download that fails is tried again the next
 * time the month is shown. Never rejects.
 */
export function restoreMonth(
  client: SupabaseClient,
  userId: string,
  first: DateKey,
  knownIds: ReadonlySet<string>,
  onDownloaded: OnDownloaded,
): Promise<void> {
  const key = `${userId}|${first}`;
  if (monthsDownloaded.has(key)) return Promise.resolve();
  const underWay = monthDownloads.get(key);
  if (underWay) return underWay;

  const download = downloadMonth(client, first, knownIds)
    .then((sessions) => {
      monthsDownloaded.add(key);
      if (sessions.length > 0) onDownloaded(sessions);
    })
    .catch((error: unknown) => console.warn(`Could not download the sessions of ${first}.`, error))
    .finally(() => {
      monthDownloads.delete(key);
    });
  monthDownloads.set(key, download);
  return download;
}

/** A session as the database hands it back, with its days embedded. */
type Row = {
  id: string;
  started_at: string;
  ended_at: string;
  time_zone: string;
  periods: { from: string; to: string }[];
  session_days: { day: string; work_ms: number }[];
};

const COLUMNS = 'id, started_at, ended_at, time_zone, periods, session_days(day, work_ms)';

/** How many sessions one request asks for. Supabase answers with at most 1000 whatever is asked. */
const PAGE = 1000;

/** How many ids one request names. Keeps the request line well within what the server takes. */
const IDS_PER_REQUEST = 100;

/**
 * Every session in the account's record, oldest first. Row-level security keeps it to the
 * caller's own sessions, so nothing here says whose they are. Rejects when the server cannot be
 * reached or refuses.
 */
export async function downloadRecord(client: SupabaseClient): Promise<EndedSession[]> {
  const sessions: EndedSession[] = [];
  for (let from = 0; ; ) {
    const { data, error, count } = await client
      .from('sessions')
      .select(COLUMNS, { count: 'exact' })
      .order('started_at')
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = data as Row[];
    sessions.push(...rows.map(fromRow));
    from += rows.length;
    if (rows.length === 0 || (count !== null && from >= count)) return sessions;
  }
}

/**
 * The account's sessions with a day in the month starting on `first`, oldest first, leaving out
 * those whose ids are in `knownIds`: the phone has them already. Rejects when the server cannot
 * be reached or refuses.
 */
export async function downloadMonth(
  client: SupabaseClient,
  first: DateKey,
  knownIds: ReadonlySet<string>,
): Promise<EndedSession[]> {
  const { data, error } = await client
    .from('session_days')
    .select('session_id')
    .gte('day', first)
    .lt('day', monthOf(first).next);
  if (error) throw new Error(error.message);
  const inMonth = new Set((data as { session_id: string }[]).map((row) => row.session_id));
  const wanted = [...inMonth].filter((id) => !knownIds.has(id));

  const sessions: EndedSession[] = [];
  for (let i = 0; i < wanted.length; i += IDS_PER_REQUEST) {
    const page = await client
      .from('sessions')
      .select(COLUMNS)
      .in('id', wanted.slice(i, i + IDS_PER_REQUEST))
      .order('started_at')
      .order('id');
    if (page.error) throw new Error(page.error.message);
    sessions.push(...(page.data as Row[]).map(fromRow));
  }
  return sessions.sort((a, b) => a.startedAt - b.startedAt);
}

/** The session as the core keeps it: instants in milliseconds, days earliest first. */
function fromRow(row: Row): EndedSession {
  const periods = row.periods.map((period) => ({ from: instant(period.from), to: instant(period.to) }));
  const days = row.session_days
    .map((day) => ({ date: day.day, workTime: Number(day.work_ms) }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return {
    id: row.id,
    timeZone: row.time_zone,
    startedAt: instant(row.started_at),
    endedAt: instant(row.ended_at),
    periods,
    // The database holds the days as they were measured; only a session somehow without any is split again.
    days: days.length > 0 ? days : sessionDays(periods, row.time_zone),
  };
}

const instant = (iso: string): number => Date.parse(iso);
