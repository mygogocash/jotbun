import { AuthCancelled } from './auth0Client.ts';
import type { Auth0Port } from './auth0Client.ts';
import { INITIAL_SESSION, reduceSession } from './sessionMachine.ts';
import type { SessionEvent, SessionSnapshot } from './sessionMachine.ts';

/** The application binding and its account, in SecureStore (never in the diary). */
export interface BindingStore {
  load(): Promise<{ accountId: string; binding: string } | null>;
  save(value: { accountId: string; binding: string }): Promise<void>;
  clear(): Promise<void>;
}

/** The token-only and bound auth endpoints (F4). */
export interface AuthApi {
  challenge(input: { request_id: string; purpose: string; command_id: string }): Promise<{ challenge_id: string; nonce: string; expires_at: string }>;
  bootstrap(input: { challenge_id: string; id_token: string }): Promise<{ account_id: string; binding: string; session_generation: number }>;
  prove(input: { challenge_id: string; id_token: string }): Promise<{ proof_id: string; expires_at: string }>;
  /** Revokes this device's binding (best effort). */
  logout(): Promise<void>;
}

export type SignInOutcome = 'active' | 'cancelled' | 'failed';

export interface CredentialProvider {
  getAccessToken(): Promise<string | null>;
  /** One serialized forced refresh after a 401; concurrent callers share it. */
  refreshAfterUnauthorized(): Promise<boolean>;
  getSessionSnapshot(): SessionSnapshot;
  subscribe(listener: () => void): () => void;
  hydrate(): Promise<void>;
  signIn(): Promise<SignInOutcome>;
  signOut(): Promise<void>;
}

export type CredentialDeps = { auth0: Auth0Port; bindings: BindingStore; api: AuthApi; newId: () => string };

/**
 * The app's credential provider (F5): the Auth0 SDK's credentials, the
 * SecureStore binding and the session state machine. Token reads and forced
 * refreshes are serialized (concurrent callers share one SDK call); a failed
 * refresh locks the session and keeps everything stored (drafts survive); a
 * cancelled sign-in leaves stored state untouched. Sign-in bootstraps through
 * a server challenge whose nonce the ID token must carry (F4, provisional
 * until the native spike runs).
 */
export function createCredentialProvider(deps: CredentialDeps): CredentialProvider {
  let snapshot: SessionSnapshot = INITIAL_SESSION;
  const listeners = new Set<() => void>();
  let tokenRead: Promise<string | null> | null = null;
  let refreshing: Promise<boolean> | null = null;

  const dispatch = (event: SessionEvent) => {
    const next = reduceSession(snapshot, event);
    if (next === snapshot) return;
    snapshot = next;
    for (const listener of listeners) listener();
  };
  const usable = () => snapshot.state === 'active' || snapshot.state === 'bootstrap_pending';

  async function restoreStored(): Promise<void> {
    const stored = await deps.bindings.load();
    if (stored) dispatch({ type: 'locked', accountId: stored.accountId, binding: stored.binding });
  }

  return {
    getAccessToken() {
      if (!usable()) return Promise.resolve(null);
      tokenRead ??= deps.auth0
        .accessToken()
        .catch(() => null)
        .then((token) => {
          if (token === null && snapshot.state === 'active') dispatch({ type: 'auth_denied' });
          return token;
        })
        .finally(() => {
          tokenRead = null;
        });
      return tokenRead;
    },

    refreshAfterUnauthorized() {
      if (!usable()) return Promise.resolve(false);
      refreshing ??= deps.auth0
        .refresh()
        .catch(() => false)
        .then((ok) => {
          dispatch(ok ? { type: 'token_refreshed' } : { type: 'auth_denied' });
          return ok;
        })
        .finally(() => {
          refreshing = null;
        });
      return refreshing;
    },

    getSessionSnapshot: () => snapshot,

    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },

    async hydrate() {
      dispatch({ type: 'hydrate_start' });
      const stored = await deps.bindings.load();
      if (!stored) {
        dispatch({ type: 'hydrate_empty' });
        return;
      }
      if (await deps.auth0.hasCredentials().catch(() => false)) dispatch({ type: 'hydrated', accountId: stored.accountId, binding: stored.binding });
      else dispatch({ type: 'locked', accountId: stored.accountId, binding: stored.binding });
    },

    async signIn() {
      dispatch({ type: 'sign_in_start' });
      try {
        await deps.auth0.authorize();
        dispatch({ type: 'authenticated' });
        const challenge = await deps.api.challenge({ request_id: deps.newId(), purpose: 'bootstrap', command_id: deps.newId() });
        const idToken = await deps.auth0.authorizeWithNonce(challenge.nonce);
        const result = await deps.api.bootstrap({ challenge_id: challenge.challenge_id, id_token: idToken });
        await deps.bindings.save({ accountId: result.account_id, binding: result.binding });
        dispatch({ type: 'bootstrapped', accountId: result.account_id, binding: result.binding });
        return 'active';
      } catch (error) {
        dispatch({ type: 'cancelled' });
        await restoreStored();
        return error instanceof AuthCancelled ? 'cancelled' : 'failed';
      }
    },

    async signOut() {
      if (snapshot.binding) await deps.api.logout().catch(() => undefined);
      await deps.auth0.clearSession().catch(() => undefined);
      await deps.bindings.clear();
      dispatch({ type: 'signed_out' });
    },
  };
}
