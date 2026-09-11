/**
 * How older saved histories are brought up to the current shape of `State`. Bump `VERSION`
 * whenever the shape changes and add a step here, so nothing already on a phone is lost.
 */
import {
  initialState,
  sessionDays,
  type Account,
  type CurrentSession,
  type EndedSession,
  type State,
} from '@/core';

export const VERSION = 7;

/** Version 1: ended sessions did not carry their split by date. */
type StateV1 = { current: CurrentSession | null; record: Omit<EndedSession, 'days'>[] };

/** Version 2: there were no goals. */
type StateV2 = Omit<StateV3, 'goals'>;

/** Version 3: there was no display name, because onboarding had not been built yet. */
type StateV3 = Omit<StateV4, 'displayName'>;

/** Version 4: there were no notification switches, because notifications had not been built yet. */
type StateV4 = Omit<StateV5, 'notificationSwitches'>;

/** Version 5: there was no account and no upload queue, because sign-in had not been built yet. */
type StateV5 = Omit<StateV6, 'account' | 'pendingUploads'>;

/** Version 6: the account did not say whether its record had been restored to the phone. */
type StateV6 = Omit<State, 'account'> & { account: Omit<Account, 'restored'> | null };

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
    const v3: StateV3 = { ...v2, goals: [] };
    return v3;
  },
  3: (state) => {
    const v3 = state as StateV3;
    // Nobody has chosen a name yet, so the app asks for one on the next launch.
    const v4: StateV4 = { ...v3, displayName: null };
    return v4;
  },
  4: (state) => {
    const v4 = state as StateV4;
    // Both switches start on, as they do for a new user.
    const v5: StateV5 = { ...v4, notificationSwitches: initialState.notificationSwitches };
    return v5;
  },
  5: (state) => {
    const v5 = state as StateV5;
    // Nobody could have signed in yet, so the whole record is still to upload.
    const v6: StateV6 = { ...v5, account: null, pendingUploads: v5.record.map((session) => session.id) };
    return v6;
  },
  6: (state) => {
    const v6 = state as StateV6;
    // Anyone signed in gets their account's record downloaded and merged in once, which is harmless.
    const v7: State = { ...v6, account: v6.account ? { ...v6.account, restored: false } : null };
    return v7;
  },
};

/** A saved history at `version`, brought up to the current shape; null if the version is unknown. */
export function migrate(version: number, state: unknown): State | null {
  if (!Number.isInteger(version) || version < 1 || version > VERSION) return null;
  let current = state;
  for (let from = version; from < VERSION; from++) current = steps[from](current);
  return current as State;
}
