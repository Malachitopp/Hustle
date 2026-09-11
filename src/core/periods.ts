/**
 * Running periods: the stretches during which the timer was running, taken from the record and
 * from the session in progress. Everything replayed from work (the plant, the calendar's live
 * split, the goals) starts from these.
 */
import type { CurrentSession, EndedSession, Instant, RunningPeriod, State } from './state';

/** When a paused session was paused: the end of its last running period. */
export function pausedAt(current: CurrentSession): Instant {
  const last = current.periods[current.periods.length - 1];
  return last ? last.to : current.startedAt;
}

/** The session's running periods with the open one, if any, closed at `at`. */
export function closePeriods(current: CurrentSession, at: Instant): EndedSession['periods'] {
  if (current.runningSince === null) return current.periods;
  // Clocks can be set backwards; a period never runs for a negative time.
  return [...current.periods, { from: current.runningSince, to: Math.max(at, current.runningSince) }];
}

/**
 * Every running period there has ever been, oldest first, with the open one closed at `now`. The
 * record is oldest first already, but a record restored from the account can hold sessions from
 * two phones that overlap in time, so the periods are put in time order here rather than trusted.
 */
export function allPeriods(state: State, now: Instant): RunningPeriod[] {
  const periods = state.record.flatMap((session) => session.periods);
  const all = state.current ? [...periods, ...closePeriods(state.current, now)] : periods;
  return all.sort((a, b) => a.from - b.from);
}
