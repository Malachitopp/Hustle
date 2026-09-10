import { AUTO_END_AFTER, closePeriods, pausedAt, settle } from './actions';
import { calendarView, type CalendarView } from './calendar';
import { formatWorkTime } from './format';
import { goalsView, type GoalView } from './goals';
import { plantView, type PlantView } from './plant';
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
 * Which line the Home header shows. Two more situations arrive with the greeting ticket, now
 * that the plant can die: "Your rose has died" and "New day".
 */
export type HeaderSituation = 'first-session' | 'worked-today' | 'no-work-yet-today';

export type View = {
  session: SessionView;
  /** Work time on today's date across every session, including one in progress. Milliseconds. */
  todayWorkTime: number;
  header: { situation: HeaderSituation; text: string };
  calendar: CalendarView;
  plant: PlantView;
  /** Every goal, oldest first, with its work time and status. */
  goals: GoalView[];
};

/**
 * Everything the screens show, worked out from the stored history at instant `now`. Anything
 * that happened by itself before `now` (an auto-end, the plant dying) is taken into account.
 * `timeZone` is the phone's current zone, which decides what "today" means.
 */
export function view(state: State, now: Instant, timeZone: string): View {
  const settled = settle(state, now);
  const session = sessionView(settled.current, now);
  const calendar = calendarView(settled, now, timeZone);
  const todayWorkTime = calendar.days[calendar.today]?.workTime ?? 0;
  return {
    session,
    todayWorkTime,
    header: header(settled, session, todayWorkTime),
    calendar,
    plant: plantView(settled, now),
    goals: goalsView(settled, now),
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
