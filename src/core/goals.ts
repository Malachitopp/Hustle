/**
 * Goals: how much of each goal's target has been reached, and whether it is active, dormant,
 * achieved or missed. Nothing derived is stored. A goal's work time is replayed from every
 * running period that falls inside one of its active windows: from creation or a switch-on
 * until a switch-off or the end of its deadline date, whichever comes first.
 *
 * Because nothing is stored, a goal's status always follows its current details: editing the
 * target or the deadline can turn an active goal achieved, or a missed one active again.
 *
 * Goals never touch the plant or the calendar, and the same work counts toward every goal that
 * is active at the time.
 */
import { endOfDate } from './days';
import { allPeriods } from './periods';
import type { DateKey, Goal, Instant, RunningPeriod, State } from './state';

/**
 * Active and dormant are the two switch positions of a goal still in progress. Achieved means
 * the work time reached the target; missed means the deadline passed first.
 */
export type GoalStatus = 'active' | 'dormant' | 'achieved' | 'missed';

export type GoalView = {
  id: string;
  name: string;
  /** The work time to reach. Milliseconds. */
  target: number;
  deadline: DateKey;
  /** The midnight that closes the deadline date. Work from here on does not count. */
  endsAt: Instant;
  createdAt: Instant;
  /** Work time counted toward the goal so far, including the session in progress. Milliseconds. */
  workTime: number;
  status: GoalStatus;
  /** When the work time reached the target, or null until it does. */
  achievedAt: Instant | null;
  /**
   * When the work time will reach the target if the running session keeps running, or null when
   * no session is running, the goal is not active, or the deadline would come first.
   */
  achievesAt: Instant | null;
  /** When the user saw the celebration for reaching the target, or null until they have. */
  celebratedAt: Instant | null;
};

/**
 * Every goal at instant `now`, oldest first. Expects a state that has already been settled (an
 * auto-ended session moved into the record), which `view` takes care of.
 */
export function goalsView(state: State, now: Instant): GoalView[] {
  const periods = allPeriods(state, now);
  const running = state.current !== null && state.current.runningSince !== null;
  return state.goals.map((goal) => goalView(goal, periods, now, running));
}

function goalView(goal: Goal, periods: readonly RunningPeriod[], now: Instant, running: boolean): GoalView {
  const endsAt = endOfDate(goal.deadline, goal.timeZone);
  const { workTime, achievedAt } = replay(goal, periods, endsAt);

  const status: GoalStatus =
    achievedAt !== null ? 'achieved' : now >= endsAt ? 'missed' : isSwitchedOn(goal) ? 'active' : 'dormant';

  let achievesAt: Instant | null = null;
  if (status === 'active' && running) {
    const at = now + (goal.target - workTime);
    if (at < endsAt) achievesAt = at;
  }

  return {
    id: goal.id,
    name: goal.name,
    target: goal.target,
    deadline: goal.deadline,
    endsAt,
    createdAt: goal.createdAt,
    workTime,
    status,
    achievedAt,
    achievesAt,
    celebratedAt: goal.celebratedAt,
  };
}

/** Whether a goal's switch is on: its last flick, or on since creation if it was never flicked. */
export function isSwitchedOn(goal: Goal): boolean {
  const last = goal.switches[goal.switches.length - 1];
  return last ? last.active : true;
}

/** Whether the goal's work time has reached its target, given every running period so far. */
export function isAchieved(goal: Goal, periods: readonly RunningPeriod[]): boolean {
  return replay(goal, periods, endOfDate(goal.deadline, goal.timeZone)).achievedAt !== null;
}

/**
 * The goal's work time from the running periods inside its active windows, and the first instant
 * that work time reached the target, or null if it has not.
 */
function replay(
  goal: Goal,
  periods: readonly RunningPeriod[],
  endsAt: Instant,
): { workTime: number; achievedAt: Instant | null } {
  const windows = activeWindows(goal, endsAt);

  // Periods and windows are both in time order, so the counted slices come out in order too
  // and the first instant the total reaches the target can be pinned down exactly.
  let workTime = 0;
  let achievedAt: Instant | null = null;
  for (const period of periods) {
    for (const window of windows) {
      const from = Math.max(period.from, window.from);
      const to = Math.min(period.to, window.to);
      if (from >= to) continue;
      if (achievedAt === null && workTime + (to - from) >= goal.target) {
        achievedAt = from + (goal.target - workTime);
      }
      workTime += to - from;
    }
  }
  return { workTime, achievedAt };
}

/**
 * The stretches during which work counts toward the goal, in order: from creation, then from
 * each switch-on, until the next switch-off or `endsAt`. Empty stretches are left out.
 */
function activeWindows(goal: Goal, endsAt: Instant): RunningPeriod[] {
  const windows: RunningPeriod[] = [];
  let since: Instant | null = goal.createdAt;
  for (const flick of goal.switches) {
    if (flick.active) {
      if (since === null) since = flick.at;
    } else if (since !== null) {
      windows.push({ from: since, to: Math.min(flick.at, endsAt) });
      since = null;
    }
  }
  if (since !== null) windows.push({ from: since, to: endsAt });
  return windows.filter((window) => window.from < window.to);
}
