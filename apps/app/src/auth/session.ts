export type SpendSession = { access_token: string; userId: string };

// A session issuer can supply its verified backend session to this store. The
// extracted API has no login/refresh issuer, so an unconfigured install stays
// signed out. Credentials are never inferred from another app's browser storage.
let session: SpendSession | null = null;
const listeners = new Set<() => void>();
export function getSession(): SpendSession | null { return session; }
export function subscribeSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function setSession(next: SpendSession | null): void {
  session = next;
  for (const listener of listeners) listener();
}
