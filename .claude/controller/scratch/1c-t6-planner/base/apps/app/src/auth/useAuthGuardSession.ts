import { useSyncExternalStore } from 'react';
import { getCredentialProvider, getSession, subscribeSession } from './session';

/** Signed in when the legacy seam has a token, or the installed provider has an account (active or locked). */
export function useAuthGuardSession(): { isAuthed: boolean; ready: boolean } {
  const view = useSyncExternalStore(
    subscribeSession,
    () => {
      const provider = getCredentialProvider();
      if (!provider) return getSession()?.access_token ? 'authed' : 'signed_out';
      const { state } = provider.getSessionSnapshot();
      if (state === 'hydrating') return 'hydrating';
      return state === 'active' || state === 'locked' || state === 'reauth_required' ? 'authed' : 'signed_out';
    },
    () => 'signed_out',
  );
  return { isAuthed: view === 'authed', ready: view !== 'hydrating' };
}
