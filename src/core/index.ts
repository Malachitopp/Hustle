/**
 * The core: every product rule, reached only through this file.
 *
 * Two operations: `apply` a timestamped action to the stored history, and ask for the `view`
 * at a given "now". The core never reads the clock and contains no UI, storage, network or
 * device code. Nothing outside this folder may import its internal files.
 */
export { apply } from './actions';
export type { Action } from './actions';
export { formatWorkTime } from './format';
export { initialState } from './state';
export type { CurrentSession, EndedSession, Instant, RunningPeriod, State } from './state';
export { view } from './view';
export type { HeaderSituation, SessionView, View } from './view';
