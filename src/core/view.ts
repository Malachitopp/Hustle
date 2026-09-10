import { AUTO_END_AFTER, closePeriods, pausedAt, settle } from './actions';
import { dateKey, workTimeByDay } from './days';
import { formatWorkTime } from './format';
import type { CurrentSession, EndedSession, Instant, State } from './state';

export type SessionView =
  | { state: 'idle' }
  | {
      state: 'running';
      id: string;
      startedAt: Instant;
      /** The session's work time so far, in milliseconds. */
      workTime: number;
    }
  | {
      state: 'paused';
      id: string;
      startedAt: Instant;
      /** The session's work time so far, in milliseconds. Frozen while paused. */
      workTime: number;
      pausedAt: Instant;
      /** When the session ends by itself unless it is resumed first. */
      autoEndsAt: Instant;
    };

/**
 * Which line the Home header shows. Two more situations arrive with the plant, once it can die:
 * "Your rose has died" and "New day".
 */
export type HeaderSituation = 'first-session' | 'worked-today' | 'no-work-yet-today';

export type View = {
  session: SessionView;
  /** Work time on today's date across every session, including one in progress. Milliseconds. */
  todayWorkTime: number;
  header: { situation: HeaderSituation; text: string };
};

/**
 * Everything the screens show, worked out from the stored history at instant `now`. Anything
 * that happened by itself before `now` (an auto-end) is taken into account.
 * `timeZone` is the phone's current zone, which decides what "today" means.
 */
export function view(state: State, now: Instant, timeZone: string): View {
  const settled = settle(state, now);
  const todayWorkTime = workTimeToday(settled, now, timeZone);
  const session = sessionView(settled.current, now);
  return {
    session,
    todayWorkTime,
    header: header(settled, session, todayWorkTime),
  };
}

function sessionView(current: CurrentSession | null, now: Instant): SessionView {
  if (!current) return { state: 'idle' };
  const workTime = totalLength(closePeriods(current, now));
  if (current.runningSince === null) {
    const paused = pausedAt(current);
    return {
      state: 'paused',
      id: current.id,
      startedAt: current.startedAt,
      workTime,
      pausedAt: paused,
      autoEndsAt: paused + AUTO_END_AFTER,
    };
  }
  return { state: 'running', id: current.id, startedAt: current.startedAt, workTime };
}

function totalLength(periods: EndedSession['periods']): number {
  return periods.reduce((sum, period) => sum + (period.to - period.from), 0);
}

/** No session can touch today if it ended this long before now, whatever its time zone. */
const RECENT = 3 * 24 * 60 * 60_000;

function workTimeToday(state: State, now: Instant, timeZone: string): number {
  const today = dateKey(now, timeZone);
  let total = 0;
  for (const session of state.record) {
    if (session.endedAt < now - RECENT) continue;
    total += workTimeByDay(session.periods, session.timeZone).get(today) ?? 0;
  }
  if (state.current) {
    total += workTimeByDay(closePeriods(state.current, now), state.current.timeZone).get(today) ?? 0;
  }
  return total;
}

/** The header only congratulates once today's work time reaches this. */
const CONGRATULATE_FROM = 5 * 60 * 60_000;

function header(state: State, session: SessionView, todayWorkTime: number): View['header'] {
  if (!state.current && state.record.length === 0) {
    return { situation: 'first-session', text: 'Welcome. Start a session to plant your first rose.' };
  }
  if (session.state !== 'idle' || todayWorkTime > 0) {
    const time = formatWorkTime(todayWorkTime);
    return {
      situation: 'worked-today',
      text:
        todayWorkTime >= CONGRATULATE_FROM
          ? `Congratulations, you have worked ${time} today`
          : `You have worked ${time} today`,
    };
  }
  return { situation: 'no-work-yet-today', text: 'Welcome back. Your rose is waiting.' };
}
