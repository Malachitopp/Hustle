import { AUTO_END_AFTER, closePeriods, pausedAt, settle } from './actions';
import { calendarView, type CalendarView } from './calendar';
import { formatWorkTime } from './format';
import { goalsView, type GoalView } from './goals';
import { plantView, type PlantView } from './plant';
import type { CurrentSession, EndedSession, Instant, RunningPeriod, State } from './state';
import { streakOn } from './streak';

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
 * Which line the Home header shows. The situations are checked in this order:
 * - `first-session`: never worked.
 * - `worked-today`: a session is running or paused, or there has been work today and the
 *   plant is alive. The line carries today's work time.
 * - `plant-died`: work today, and the plant has since died.
 * - `no-work-yet-today`: no work yet today, and the plant is still alive.
 * - `new-day`: no work yet today, and the plant died overnight.
 */
export type HeaderSituation = 'first-session' | 'worked-today' | 'plant-died' | 'no-work-yet-today' | 'new-day';

export type View = {
  session: SessionView;
  /** Work time on today's date across every session, including one in progress. Milliseconds. */
  todayWorkTime: number;
  /** The line above the plant, addressed to the user by their display name once they have one. */
  header: { situation: HeaderSituation; text: string };
  /**
   * Days in a row with any work, ending today or (until today has some work) yesterday. 0 when
   * there is no streak. Never stored: worked out from the calendar's day totals.
   */
  streak: number;
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
  const plant = plantView(settled, now);
  return {
    session,
    todayWorkTime,
    header: header(settled.displayName, session, todayWorkTime, plant),
    streak: streakOn(calendar.days, calendar.today),
    calendar,
    plant,
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

/** An ended session's work time: the total length of its running periods. Milliseconds. */
export function sessionWorkTime(session: Pick<EndedSession, 'periods'>): number {
  return totalLength(session.periods);
}

function totalLength(periods: readonly RunningPeriod[]): number {
  return periods.reduce((sum, period) => sum + (period.to - period.from), 0);
}

/** The header only congratulates once today's work time reaches this. */
const CONGRATULATE_FROM = 5 * 60 * 60_000;

/**
 * The line above the plant. The situations are checked in the order `HeaderSituation` lists
 * them, so a session in progress always shows today's count. The name is null only before
 * onboarding, which the screens never show past, but every line still reads well without it,
 * so a missing name can never leave a gap in the text.
 */
function header(
  name: string | null,
  session: SessionView,
  todayWorkTime: number,
  plant: PlantView,
): View['header'] {
  // "Welcome back, Sam. Your rose is waiting." or, with no name, "Welcome back. Your rose is waiting."
  const greeting = (opening: string, rest: string) =>
    name ? `${opening}, ${name}. ${rest}` : `${opening}. ${rest}`;

  if (plant.state === 'none') {
    return { situation: 'first-session', text: greeting('Welcome', 'Start a session to plant your first rose.') };
  }
  const alive = plant.state === 'alive';
  if (session.state !== 'idle' || (todayWorkTime > 0 && alive)) {
    const time = formatWorkTime(todayWorkTime);
    let text: string;
    if (todayWorkTime >= CONGRATULATE_FROM) {
      text = name
        ? `Congratulations ${name}, you have worked ${time} today`
        : `Congratulations, you have worked ${time} today`;
    } else {
      text = name ? `${name}, you have worked ${time} today` : `You have worked ${time} today`;
    }
    return { situation: 'worked-today', text };
  }
  if (todayWorkTime > 0) {
    return { situation: 'plant-died', text: greeting('Your rose has died', 'Start working to plant a new one.') };
  }
  if (alive) {
    return { situation: 'no-work-yet-today', text: greeting('Welcome back', 'Your rose is waiting.') };
  }
  return { situation: 'new-day', text: greeting('New day', 'Start a session to plant a new rose.') };
}
