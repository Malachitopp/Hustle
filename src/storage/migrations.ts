/**
 * How older saved histories are brought up to the current shape of `State`. Bump `VERSION`
 * whenever the shape changes and add a step here, so nothing already on a phone is lost.
 */
import { sessionDays, type CurrentSession, type EndedSession, type State } from '@/core';

export const VERSION = 3;

/** Version 1: ended sessions did not carry their split by date. */
type StateV1 = { current: CurrentSession | null; record: Omit<EndedSession, 'days'>[] };

/** Version 2: there were no goals. */
type StateV2 = Omit<State, 'goals'>;

/** Each step brings a history from its version to the next one. */
const steps: Record<number, (state: unknown) => unknown> = {
  1: (state) => {
    const v1 = state as StateV1;
    const v2: StateV2 = {
      ...v1,
      record: v1.record.map((session) => ({
        ...session,
        days: sessionDays(session.periods, session.timeZone),
      })),
    };
    return v2;
  },
  2: (state) => {
    const v2 = state as StateV2;
    const v3: State = { ...v2, goals: [] };
    return v3;
  },
};

/** A saved history at `version`, brought up to the current shape; null if the version is unknown. */
export function migrate(version: number, state: unknown): State | null {
  if (!Number.isInteger(version) || version < 1 || version > VERSION) return null;
  let current = state;
  for (let from = version; from < VERSION; from++) current = steps[from](current);
  return current as State;
}
