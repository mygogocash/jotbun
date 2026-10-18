import { V1Error } from '../api/client.ts';
import { AuthCancelled } from './auth0Port.ts';
import type { Auth0Port, PendingCredentials } from './auth0Port.ts';
import { INITIAL_SESSION, accepts, reduceSession } from './sessionMachine.ts';
import type { SessionEvent, SessionSnapshot } from './sessionMachine.ts';

/** The application binding and its account, in SecureStore (never in the diary). */
export interface BindingStore {
  load(): Promise<{ accountId: string; binding: string } | null>;
  save(value: { accountId: string; binding: string }): Promise<void>;
  clear(): Promise<void>;
}

/** The installation epoch's durable high-water mark, so it never goes backwards across launches. */
export interface EpochStore {
  load(): Promise<number>;
  save(epoch: number): Promise<void>;
}

/** Credentials for one request instead of the session's: a pending sign-in's token, or a binding being revoked. */
export type RequestAuth = { accessToken: string };

/** The token-only and bound auth endpoints (F4). */
export interface AuthApi {
  challenge(input: { request_id: string; purpose: string; command_id: string }, auth?: RequestAuth): Promise<{ challenge_id: string; nonce: string; expires_at: string }>;
  bootstrap(input: { challenge_id: string; id_token: string }, auth?: RequestAuth): Promise<{ account_id: string; binding: string; session_generation: number }>;
  prove(input: { challenge_id: string; id_token: string }): Promise<{ proof_id: string; expires_at: string }>;
  /** Revokes a binding (best effort): the session's, or `target` with its own access token. */
  logout(target?: { binding: string; accessToken: string }): Promise<void>;
}

/** The server ended the session: the transport reports the code and the epoch the request started under. */
export type SessionEnded = { code: 'SESSION_REQUIRED' | 'REAUTH_REQUIRED' | 'ACCOUNT_UNAVAILABLE'; epoch: number };

export type SignInOutcome = 'active' | 'cancelled' | 'failed' | 'reauth_required';

export interface CredentialProvider {
  /** null: no usable session (or the credentials were denied, which locks). Rejects when Auth0 can't be reached right now. */
  getAccessToken(): Promise<string | null>;
  /** One serialized forced refresh after a 401; concurrent callers share it. Also lifts a lock once the credentials work again. */
  refreshAfterUnauthorized(): Promise<boolean>;
  /** A v1 response said the server ended this session. Ignored unless `epoch` is still the session's. */
  sessionEnded(event: SessionEnded): void;
  getSessionSnapshot(): SessionSnapshot;
  subscribe(listener: () => void): () => void;
  /** At launch: the stored binding, active or locked. From locked: tries to lift the lock. Otherwise refused (no effect). */
  hydrate(): Promise<void>;
  /** A sign-in while one runs joins it. */
  signIn(): Promise<SignInOutcome>;
  /** Wins over a running sign-in or hydration; rejects only if the stored binding could not be cleared (the session is signed out anyway). */
  signOut(): Promise<void>;
}

export type CredentialDeps = { auth0: Auth0Port; bindings: BindingStore; api: AuthApi; newId: () => string; epochs?: EpochStore };

/** Epochs are reserved on disk this many at a time, so a launch never reuses a number an earlier launch handed out. */
const EPOCH_BLOCK = 64;
const noop = () => undefined;
const settle = (promise: Promise<unknown> | null) => (promise ? promise.then(noop, noop) : Promise.resolve());

function memoryEpochs(): EpochStore {
  let value = 0;
  return { load: async () => value, save: async (epoch) => void (value = epoch) };
}

/**
 * The app's credential provider (F5): the Auth0 SDK's credentials, the
 * SecureStore binding and the session state machine.
 *
 * - Token reads and forced refreshes are serialized (concurrent callers share
 *   one SDK call), and a read never hands out a token from before a refresh.
 * - A denied refresh locks the session and keeps everything stored (drafts
 *   survive); Auth0 being unreachable is not a denial and changes nothing. A
 *   lock lifts through hydrate or a refresh once the credentials work again.
 * - Hydrate, sign-in and sign-out run one at a time. A sign-in while one runs
 *   joins it; a sign-out wins over a running sign-in or hydration, which then
 *   stores nothing (a binding the server issued too late is revoked).
 * - Sign-in bootstraps through a server challenge whose nonce a fresh
 *   (max_age=0) ID token must carry (F4, provisional until the native spike
 *   runs). Its login stays pending - the challenge and bootstrap carry its own
 *   token - and is stored only after the server accepted it. From an existing
 *   session (an account switch, or after a lock or a server-ended session) it
 *   runs beside it, so a cancelled or failed attempt leaves that session, its
 *   epoch and its credentials as they were.
 * - A server-ended session (SESSION_REQUIRED, REAUTH_REQUIRED) needs a new
 *   sign-in and keeps the account and its drafts; ACCOUNT_UNAVAILABLE signs
 *   out. Reports from an earlier epoch are ignored.
 * - The epoch is persisted so it never goes backwards across launches.
 */
export function createCredentialProvider(deps: CredentialDeps): CredentialProvider {
  const epochs = deps.epochs ?? memoryEpochs();
  let snapshot: SessionSnapshot = INITIAL_SESSION;
  const listeners = new Set<() => void>();

  // Token reads are shared only within one identity and between refreshes.
  let tokenRead: { promise: Promise<string | null>; epoch: number; generation: number } | null = null;
  let tokenGeneration = 0;
  let refreshing: Promise<boolean> | null = null;

  // One flow at a time. A sign-out moves `generation`, which supersedes the
  // running (and any queued) hydrate or sign-in: each checks it after every await.
  let generation = 0;
  let queue: Promise<unknown> = Promise.resolve();
  let hydrating: Promise<void> | null = null;
  let signing: Promise<SignInOutcome> | null = null;
  let ending: Promise<void> | null = null;
  // A sign-in's store writes; a sign-out lets them finish before it clears.
  let committing: Promise<void> | null = null;

  let epochsLoaded: Promise<void> | null = null;
  let epochsReady = false;
  let reservedThrough = 0;
  let reservation: Promise<void> = Promise.resolve();

  const notify = () => {
    for (const listener of [...listeners]) listener();
  };
  const reserveEpochs = (): Promise<void> => {
    const through = snapshot.epoch + EPOCH_BLOCK;
    reservedThrough = through;
    reservation = reservation.then(() => epochs.save(through)).catch(noop);
    return reservation;
  };
  const loadEpochs = (): Promise<void> =>
    (epochsLoaded ??= (async () => {
      const stored = await epochs.load().catch(() => 0);
      if (stored > snapshot.epoch) {
        snapshot = { ...snapshot, epoch: stored };
        notify();
      }
      await reserveEpochs();
      epochsReady = true;
    })());

  const dispatch = (event: SessionEvent): boolean => {
    const next = reduceSession(snapshot, event);
    if (next === snapshot) return false;
    const moved = next.epoch !== snapshot.epoch;
    snapshot = next;
    if (moved && epochsReady && snapshot.epoch + EPOCH_BLOCK / 2 > reservedThrough) void reserveEpochs();
    notify();
    return true;
  };

  const superseded = (mine: number) => mine !== generation;
  function enqueue<T>(flow: (mine: number) => Promise<T>, whenSuperseded: T): Promise<T> {
    const mine = generation;
    const result = queue.then(() => (superseded(mine) ? whenSuperseded : flow(mine)));
    queue = result.catch(noop);
    return result;
  }

  async function hydrateFlow(mine: number): Promise<void> {
    await loadEpochs();
    if (superseded(mine)) return;
    if (snapshot.state === 'locked') {
      // Lifted only by a refresh that works (offline or still denied: stays locked).
      await provider.refreshAfterUnauthorized().catch(() => false);
      return;
    }
    if (!accepts(snapshot, 'hydrate_start')) return;
    dispatch({ type: 'hydrate_start' });
    // An unreadable store (e.g. a locked device) starts signed out; nothing is erased.
    const stored = await deps.bindings.load().catch(() => null);
    if (superseded(mine)) return;
    if (!stored) {
      dispatch({ type: 'hydrate_empty' });
    } else {
      const usable = await deps.auth0.hasCredentials().catch(() => false);
      if (superseded(mine)) return;
      dispatch(usable ? { type: 'hydrated', accountId: stored.accountId, binding: stored.binding } : { type: 'locked', accountId: stored.accountId, binding: stored.binding });
    }
    await reservation;
  }

  const revokeLate = (accepted: { binding: string }, pending: PendingCredentials) =>
    deps.api.logout({ binding: accepted.binding, accessToken: pending.accessToken }).catch(noop);

  /** The binding first, then the SDK credentials; if those fail, the previous binding goes back, so the store never names one account while the SDK holds another's credentials. */
  async function commit(next: { accountId: string; binding: string }, pending: PendingCredentials, previous: { accountId: string; binding: string } | null): Promise<void> {
    await deps.bindings.save(next);
    try {
      await deps.auth0.saveCredentials(pending);
    } catch (error) {
      await (previous ? deps.bindings.save(previous) : deps.bindings.clear()).catch(() => deps.bindings.clear().catch(noop));
      throw error;
    }
  }

  async function signInFlow(mine: number): Promise<SignInOutcome> {
    await loadEpochs();
    if (superseded(mine)) return 'cancelled';
    const first = accepts(snapshot, 'sign_in_start');
    if (!first && !accepts(snapshot, 'bootstrapped')) return 'failed';
    const previous = snapshot.accountId && snapshot.binding ? { accountId: snapshot.accountId, binding: snapshot.binding } : null;
    if (first) dispatch({ type: 'sign_in_start' });
    let pending: PendingCredentials | null = null;
    let accepted: { account_id: string; binding: string } | null = null;
    try {
      pending = await deps.auth0.authorize();
      if (superseded(mine)) return 'cancelled';
      if (first) dispatch({ type: 'authenticated' });
      const auth = { accessToken: pending.accessToken };
      const challenge = await deps.api.challenge({ request_id: deps.newId(), purpose: 'bootstrap', command_id: deps.newId() }, auth);
      if (superseded(mine)) return 'cancelled';
      const idToken = await deps.auth0.authorizeWithNonce(challenge.nonce, { maxAgeSeconds: 0 });
      if (superseded(mine)) return 'cancelled';
      accepted = await deps.api.bootstrap({ challenge_id: challenge.challenge_id, id_token: idToken }, auth);
      if (superseded(mine)) {
        await revokeLate(accepted, pending);
        return 'cancelled';
      }
      const next = { accountId: accepted.account_id, binding: accepted.binding };
      const write = commit(next, pending, previous);
      committing = write;
      try {
        await write;
      } finally {
        if (committing === write) committing = null;
      }
      if (superseded(mine)) {
        // The sign-out that won clears what was just written.
        await revokeLate(accepted, pending);
        return 'cancelled';
      }
      dispatch({ type: 'bootstrapped', ...next });
      await reservation;
      return 'active';
    } catch (error) {
      // Issued by the server but never stored: revoked.
      if (accepted && pending) await revokeLate(accepted, pending);
      if (superseded(mine)) return 'cancelled';
      if (first) dispatch({ type: 'cancelled' });
      if (error instanceof AuthCancelled) return 'cancelled';
      if (error instanceof V1Error && error.code === 'REAUTH_REQUIRED') return 'reauth_required';
      return 'failed';
    }
  }

  async function signOutFlow(revoke: boolean): Promise<void> {
    const sessionBinding = snapshot.binding;
    // The session ends now: anything started under it (a bootstrap, a sync) is dropped from here on.
    dispatch({ type: 'signed_out' });
    // A sign-in's store writes and a forced refresh finish first, so nothing lands after the clear.
    await settle(committing);
    await settle(refreshing);
    const stored = await deps.bindings.load().catch(() => null);
    if (revoke) {
      const targets = [...new Set([sessionBinding, stored?.binding].filter((binding): binding is string => typeof binding === 'string'))];
      if (targets.length > 0) {
        // With the SDK's own token, before the SDK forgets it - also from a
        // locked session, whose binding the shared seam no longer exposes.
        const accessToken = await deps.auth0.accessToken().catch(() => null);
        if (accessToken) for (const binding of targets) await deps.api.logout({ binding, accessToken }).catch(noop);
      }
    }
    await deps.auth0.clearSession().catch(noop);
    let failure: { error: unknown } | null = null;
    try {
      await deps.bindings.clear();
    } catch (error) {
      failure = { error };
    }
    await reservation;
    if (failure) throw failure.error;
  }

  function endSession(revoke: boolean): Promise<void> {
    if (ending) return ending;
    generation += 1;
    hydrating = null;
    signing = null;
    const run: Promise<void> = signOutFlow(revoke).finally(() => {
      if (ending === run) ending = null;
    });
    ending = run;
    queue = run.catch(noop);
    return run;
  }

  const provider: CredentialProvider = {
    getAccessToken() {
      if (snapshot.state !== 'active') return Promise.resolve(null);
      if (refreshing) {
        const again = () => provider.getAccessToken();
        return refreshing.then(again, again);
      }
      const epoch = snapshot.epoch;
      if (tokenRead && tokenRead.epoch === epoch && tokenRead.generation === tokenGeneration) return tokenRead.promise;
      const promise = deps.auth0.accessToken().then((token) => {
        // null: the credentials are gone or denied - lock, keep everything. A rejection (offline) changes nothing.
        if (token === null && snapshot.epoch === epoch) dispatch({ type: 'auth_denied' });
        return token;
      });
      const entry = { promise, epoch, generation: tokenGeneration };
      tokenRead = entry;
      const clear = () => {
        if (tokenRead === entry) tokenRead = null;
      };
      promise.then(clear, clear);
      return promise;
    },

    refreshAfterUnauthorized() {
      if (snapshot.state !== 'active' && snapshot.state !== 'locked') return Promise.resolve(false);
      if (refreshing) return refreshing;
      const epoch = snapshot.epoch;
      // No read that started before this refresh is handed out after it.
      tokenGeneration += 1;
      const shared: Promise<boolean> = deps.auth0
        .refresh()
        .then((ok) => {
          if (snapshot.epoch === epoch) dispatch(ok ? { type: 'token_refreshed' } : { type: 'auth_denied' });
          return ok;
        })
        .finally(() => {
          if (refreshing === shared) refreshing = null;
        });
      refreshing = shared;
      return shared;
    },

    sessionEnded({ code, epoch }) {
      if (epoch !== snapshot.epoch || (snapshot.state !== 'active' && snapshot.state !== 'locked')) return;
      // The account is gone or disabled: sign out locally (its binding is already refused, so nothing to revoke).
      if (code === 'ACCOUNT_UNAVAILABLE') void endSession(false).catch(noop);
      else dispatch({ type: 'reauth_required' });
    },

    getSessionSnapshot: () => snapshot,

    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },

    hydrate() {
      if (hydrating) return hydrating;
      const run: Promise<void> = enqueue(hydrateFlow, undefined).finally(() => {
        if (hydrating === run) hydrating = null;
      });
      hydrating = run;
      return run;
    },

    signIn() {
      if (signing) return signing;
      const run: Promise<SignInOutcome> = enqueue<SignInOutcome>(signInFlow, 'cancelled').finally(() => {
        if (signing === run) signing = null;
      });
      signing = run;
      return run;
    },

    signOut: () => endSession(true),
  };
  return provider;
}
