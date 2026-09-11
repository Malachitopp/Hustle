/**
 * Restoring: the thin adapter that carries what the account holds down to the phone, the
 * opposite of `uploads`. Three downloads: everything, once per sign-in, so a new phone or a fresh
 * install picks up where the account left off; one month of sessions at a time as the Calendar
 * shows it; and the goals as Goals is opened, so what another phone did turns up, each fetched
 * once while the app stays open. The core merges what comes down by id (`restore`,
 * `add-downloaded` and `add-downloaded-goals`), so nothing is ever doubled. The client is passed
 * in rather than imported, so the queries can be run against the dev project in the database tests.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import { monthOf, sessionDays, type AccountData, type DateKey, type EndedSession, type Goal, type Settings } from '@/core';

type OnSessions = (sessions: EndedSession[]) => void;
type OnGoals = (downloaded: Pick<AccountData, 'goals' | 'deletedGoalIds'>) => void;
type OnAccount = (data: AccountData) => void;

/** The download of everything the account holds under way, if any. */
let accountDownload: Promise<void> | null = null;

/**
 * Downloads everything the account holds and hands it to `onDownloaded`. One download at a time:
 * a call while one is under way waits for it and does nothing more, because the core will have
 * marked the restore done, or will ask again at the next moment if it failed. Never rejects.
 */
export function restoreAccount(client: SupabaseClient, onDownloaded: OnAccount): Promise<void> {
  if (accountDownload) return accountDownload;
  accountDownload = downloadAccount(client)
    .then(onDownloaded)
    .catch((error: unknown) => console.warn('Could not download the account.', error))
    .finally(() => {
      accountDownload = null;
    });
  return accountDownload;
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
  onDownloaded: OnSessions,
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

/** The accounts whose goals were downloaded since the app opened, by user id, and those under way. */
const goalsDownloaded = new Set<string>();
const goalDownloads = new Map<string, Promise<void>>();

/**
 * Downloads the account's goals and hands them to `onDownloaded`. Downloaded once per account
 * for as long as the app stays open; a download that fails is tried again the next time it is
 * asked for. Never rejects.
 */
export function restoreGoals(client: SupabaseClient, userId: string, onDownloaded: OnGoals): Promise<void> {
  if (goalsDownloaded.has(userId)) return Promise.resolve();
  const underWay = goalDownloads.get(userId);
  if (underWay) return underWay;

  const download = downloadGoals(client)
    .then((downloaded) => {
      goalsDownloaded.add(userId);
      onDownloaded(downloaded);
    })
    .catch((error: unknown) => console.warn('Could not download the goals.', error))
    .finally(() => {
      goalDownloads.delete(userId);
    });
  goalDownloads.set(userId, download);
  return download;
}

/**
 * Everything the account holds: its record, goals and settings, fetched together. Rejects if any
 * of the three cannot be fetched, so a restore is all or nothing.
 */
export async function downloadAccount(client: SupabaseClient): Promise<AccountData> {
  const [sessions, goals, settings] = await Promise.all([
    downloadRecord(client),
    downloadGoals(client),
    downloadSettings(client),
  ]);
  return { sessions, ...goals, settings };
}

/** A session as the database hands it back, with its days embedded. */
type SessionRow = {
  id: string;
  started_at: string;
  ended_at: string;
  time_zone: string;
  periods: { from: string; to: string }[];
  session_days: { day: string; work_ms: number }[];
};

const SESSION_COLUMNS = 'id, started_at, ended_at, time_zone, periods, session_days(day, work_ms)';

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
      .select(SESSION_COLUMNS, { count: 'exact' })
      .order('started_at')
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = data as SessionRow[];
    sessions.push(...rows.map(sessionFromRow));
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
      .select(SESSION_COLUMNS)
      .in('id', wanted.slice(i, i + IDS_PER_REQUEST))
      .order('started_at')
      .order('id');
    if (page.error) throw new Error(page.error.message);
    sessions.push(...(page.data as SessionRow[]).map(sessionFromRow));
  }
  return sessions.sort((a, b) => a.startedAt - b.startedAt);
}

/** The session as the core keeps it: instants in milliseconds, days earliest first. */
function sessionFromRow(row: SessionRow): EndedSession {
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

/** A goal as the database hands it back, with its switch history embedded. A deleted one has `deleted_at` set. */
type GoalRow = {
  id: string;
  name: string;
  target_ms: number;
  deadline: string;
  time_zone: string;
  created_at: string;
  celebrated_at: string | null;
  deleted_at: string | null;
  goal_switches: { position: number; at: string; active: boolean }[];
};

const GOAL_COLUMNS =
  'id, name, target_ms, deadline, time_zone, created_at, celebrated_at, deleted_at, goal_switches(position, at, active)';

/**
 * Every goal the account holds, oldest first, and the ids of those deleted on the account, which
 * stay as markers so a phone still showing one learns it went. Row-level security keeps it to
 * the caller's own goals. Rejects when the server cannot be reached or refuses.
 */
export async function downloadGoals(client: SupabaseClient): Promise<Pick<AccountData, 'goals' | 'deletedGoalIds'>> {
  const { data, error } = await client.from('goals').select(GOAL_COLUMNS).order('created_at').order('id');
  if (error) throw new Error(error.message);
  const rows = data as GoalRow[];
  return {
    goals: rows.filter((row) => row.deleted_at === null).map(goalFromRow),
    deletedGoalIds: rows.filter((row) => row.deleted_at !== null).map((row) => row.id),
  };
}

/** The goal as the core keeps it: instants in milliseconds, switches in order. */
function goalFromRow(row: GoalRow): Goal {
  return {
    id: row.id,
    name: row.name,
    target: Number(row.target_ms),
    deadline: row.deadline,
    timeZone: row.time_zone,
    createdAt: instant(row.created_at),
    celebratedAt: row.celebrated_at === null ? null : instant(row.celebrated_at),
    switches: [...row.goal_switches]
      .sort((a, b) => a.position - b.position)
      .map((flick) => ({ at: instant(flick.at), active: flick.active })),
  };
}

/** The account's settings as the database hands them back. */
type ProfileRow = {
  display_name: string | null;
  petal_colour: string | null;
  pause_warnings: boolean;
  streak_reminder: boolean;
};

const PROFILE_COLUMNS = 'display_name, petal_colour, pause_warnings, streak_reminder';

/**
 * The account's settings, or null while it has none because nothing has been uploaded yet.
 * Row-level security keeps it to the caller's own row. Rejects when the server cannot be reached
 * or refuses.
 */
export async function downloadSettings(client: SupabaseClient): Promise<Settings | null> {
  const { data, error } = await client.from('profiles').select(PROFILE_COLUMNS).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const row = data as ProfileRow;
  return {
    displayName: row.display_name || null,
    petalColour: row.petal_colour || null,
    notificationSwitches: { pauseWarnings: row.pause_warnings, streakReminder: row.streak_reminder },
  };
}

const instant = (iso: string): number => Date.parse(iso);
