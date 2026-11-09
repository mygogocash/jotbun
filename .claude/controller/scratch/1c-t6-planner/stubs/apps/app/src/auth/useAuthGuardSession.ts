import { useSyncExternalStore } from 'react';
import { getCredentialProvider, getSession, subscribeSession } from './session';

/**
 * Signed in when the legacy seam has a token, or the installed provider has an
 * account (active, locked or ended by the server). `ended`: the session is
 * locked or needs signing in again (D37), so a guard can send the person to
 * the session-ended screen (Task 9) while the account and its unsent records stay.
 */
export function useAuthGuardSession(): { isAuthed: boolean; ready: boolean; ended: boolean } {
  const view = useSyncExternalStore(
    subscribeSession,
    () => {
      const provider = getCredentialProvider();
      if (!provider) return getSession()?.access_token ? 'authed' : 'signed_out';
      const { state } = provider.getSessionSnapshot();
      if (state === 'hydrating') return 'hydrating';
      if (state === 'locked' || state === 'reauth_required') return 'ended';
      return state === 'active' ? 'authed' : 'signed_out';
    },
    () => 'signed_out',
  );
  // RED stub (R52): never ended.
  return { isAuthed: view === 'authed' || view === 'ended', ready: view !== 'hydrating', ended: false };
}
