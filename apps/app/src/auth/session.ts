import type { V1Credentials, V1SessionSnapshot } from '../api/client.ts';
import type { CredentialProvider } from './credentialProvider.ts';

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
  if (provider) {
    const current = provider.getSessionSnapshot();
    return { binding: current.state === 'active' ? current.binding : null, epoch: current.epoch };
  }
  return { binding: session?.binding ?? null, epoch };
}

// F5: once the native SDK is configured, the credential provider owns the
// session; the legacy seam above stays only until every caller has moved.
let provider: CredentialProvider | null = null;
let unsubscribeProvider: (() => void) | null = null;

/** Installs (or removes) the provider; a replaced provider no longer drives the seam. */
export function installCredentialProvider(next: CredentialProvider | null): void {
  unsubscribeProvider?.();
  unsubscribeProvider = null;
  provider = next;
  for (const listener of listeners) listener();
  unsubscribeProvider =
    next?.subscribe(() => {
      for (const listener of listeners) listener();
    }) ?? null;
}

export function getCredentialProvider(): CredentialProvider | null {
  return provider;
}

/** The access token for v1 requests: the provider's (serialized SDK refresh), or the legacy seam's. */
export function getV1AccessToken(): Promise<string | null> {
  return provider ? provider.getAccessToken() : Promise.resolve(session?.access_token ?? null);
}

/**
 * The shared transport's credentials: the installed provider's token,
 * binding, epoch and refresh, and the server-ended sessions the transport
 * reports back to it; or the legacy seam's.
 */
export const v1SessionCredentials: V1Credentials = {
  getAccessToken: getV1AccessToken,
  getSessionSnapshot: getV1SessionSnapshot,
  refreshAfterUnauthorized: async () => (await provider?.refreshAfterUnauthorized()) ?? false,
  sessionEnded: (event) => provider?.sessionEnded(event),
};
