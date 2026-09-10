/**
 * The core: every product rule, reached only through this file.
 *
 * Two operations: `apply` a timestamped action to the stored history, and ask for the `view`
 * at a given "now". Alongside them, a few pure helpers for laying out and naming dates. The
 * core never reads the clock and contains no UI, storage, network or device code. Nothing
 * outside this folder may import its internal files.
 */
export { apply } from './actions';
export type { Action } from './actions';
export { monthOf } from './calendar';
export type { CalendarView, DaySessionView, DayView, MonthView, Span } from './calendar';
export { sessionDays } from './days';
export {
  formatClockTime,
  formatDate,
  formatMonth,
  formatShortDate,
  formatWorkTime,
  formatWorkTimeShort,
} from './format';
export type { GoalStatus, GoalView } from './goals';
export { lookFor } from './plant';
export type { Look, PlantView } from './plant';
export { initialState } from './state';
export type {
  CurrentSession,
  DateKey,
  EndedSession,
  Goal,
  GoalSwitch,
  Instant,
  RunningPeriod,
  SessionDay,
  State,
} from './state';
export { view } from './view';
export type { HeaderSituation, SessionView, View } from './view';
