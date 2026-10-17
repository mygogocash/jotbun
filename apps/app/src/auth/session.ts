import type { V1SessionSnapshot } from '../api/client.ts';

/**
 * The public session seam, kept until F5's credential provider replaces it.
 * `binding` is the opaque v1 application binding from bootstrap; without it
 * v1 requests stay signed out.
 */
export type SpendSession = { access_token: string; userId: string; binding?: string };

// A session issuer can supply its verified backend session to this store. The
// extracted API has no login/refresh issuer, so an unconfigured install stays
// signed out. Credentials are never inferred from another app's browser storage.
let session: SpendSession | null = null;
// Installation-local counter (F5's epoch): it moves on sign-out, account
// switch or a new binding, never on a token refresh for the same binding, so
// a response started under one identity is never shown under another.
let epoch = 0;
const listeners = new Set<() => void>();
export function getSession(): SpendSession | null { return session; }
export function subscribeSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function setSession(next: SpendSession | null): void {
  const sameIdentity = session !== null && next !== null && session.userId === next.userId && session.binding === next.binding;
  if (!sameIdentity) epoch += 1;
  session = next;
  for (const listener of listeners) listener();
}
export function getV1SessionSnapshot(): V1SessionSnapshot {
  return { binding: session?.binding ?? null, epoch };
}
