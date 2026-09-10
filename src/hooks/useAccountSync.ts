import { useEffect } from 'react';

import { watchAccount } from '@/account';
import { useStore } from '@/store';

/**
 * Keeps the core's note of who is signed in matching Supabase's session: at launch, after a
 * sign-in from Settings, and if the server ever stops accepting the saved sign-in, which makes
 * the user a guest again.
 */
export function useAccountSync(): void {
  const { act } = useStore();

  useEffect(
    () =>
      watchAccount((account) => {
        if (account) act({ type: 'sign-in', ...account });
        else act({ type: 'sign-out' });
      }),
    [act],
  );
}
