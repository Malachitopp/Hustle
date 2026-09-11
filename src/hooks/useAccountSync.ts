import { useEffect } from 'react';

import { watchAccount } from '@/account';
import { useStore } from '@/store';

/**
 * Keeps the core's note of who is signed in matching Supabase's session: at launch, after a
 * sign-in from Settings, and when the session ends, whether because the server stopped accepting
 * the saved sign-in or because the user signed out or deleted the account. Either way the core
 * only hears that the sign-in is over; clearing the phone after a sign-out is Settings' own
 * doing, once its pop-up has gone.
 */
export function useAccountSync(): void {
  const { act } = useStore();

  useEffect(
    () =>
      watchAccount((account) => {
        if (account) act({ type: 'sign-in', ...account });
        else act({ type: 'lose-sign-in' });
      }),
    [act],
  );
}
