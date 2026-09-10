import { closePeriods } from './actions';
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
    };

/**
 * Which line the Home header shows. Two more situations arrive with the plant, once it can die:
 * "Your rose has died" and "New day".
 */
export type HeaderSituation = 'first-session' | 'worked-today' | 'no-work-yet-today';

export type View = {
  session: SessionView;
  /** Work time on today's date across every session, including one that's running. Milliseconds. */
  todayWorkTime: number;
  header: { situation: HeaderSituation; text: string };
};

/**
 * Everything the screens show, worked out from the stored history at instant `now`.
 * `timeZone` is the phone's current zone, which decides what "today" means.
 */
export function view(state: State, now: Instant, timeZone: string): View {
  const todayWorkTime = workTimeToday(state, now, timeZone);
  const session = sessionView(state.current, now);
  return {
    session,
    todayWorkTime,
    header: header(state, session, todayWorkTime),
  };
}

function sessionView(current: CurrentSession | null, now: Instant): SessionView {
  if (!current) return { state: 'idle' };
  return {
    state: 'running',
    id: current.id,
    startedAt: current.startedAt,
    workTime: totalLength(closePeriods(current, now)),
  };
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

function header(state: State, session: SessionView, todayWorkTime: number): View['header'] {
  if (!state.current && state.record.length === 0) {
    return { situation: 'first-session', text: 'Welcome. Start a session to plant your first rose.' };
  }
  if (session.state === 'running' || todayWorkTime > 0) {
    return {
      situation: 'worked-today',
      text: `Congratulations, you have worked ${formatWorkTime(todayWorkTime)} today`,
    };
  }
  return { situation: 'no-work-yet-today', text: 'Welcome back. Your rose is waiting.' };
}
