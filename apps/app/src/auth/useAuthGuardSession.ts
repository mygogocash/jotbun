import { useSyncExternalStore } from 'react';
import { getSession, subscribeSession } from './session';

export function useAuthGuardSession(): { isAuthed: boolean; ready: boolean } {
  const session = useSyncExternalStore(subscribeSession, getSession, () => null);
  return { isAuthed: Boolean(session?.access_token), ready: true };
}
