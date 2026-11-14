import { trackSignedIn, trackSignedOut, trackSignedUp } from '../analytics/events.ts';
import { AuthCancelled, AuthRefused, AuthUnavailable } from './betterAuthPort.ts';
import type { BetterAuthPort, SignInMethod, SignInRequest } from './betterAuthPort.ts';
import { INITIAL_SESSION, accepts, reduceSession } from './sessionMachine.ts';
import type { SessionEvent, SessionSnapshot } from './sessionMachine.ts';
import type { SessionRecordStore, StoredSession } from './sessionStore.ts';

/** The installation epoch's durable high-water mark, so it never goes backwards across launches. */
export interface EpochStore {
  load(): Promise<number>;
  save(epoch: number): Promise<void>;
}

/** The server ended the session: the transport reports the code and the epoch the request started under. */
export type SessionEnded = { code: 'SESSION_REQUIRED' | 'REAUTH_REQUIRED' | 'ACCOUNT_UNAVAILABLE'; epoch: number };

export type SignInOutcome = 'active' | 'cancelled' | 'failed' | 'unavailable' | 'not_configured' | 'account_exists' | 'account_unavailable' | 'wrong_code' | 'rate_limited';
export type SignInResult = { outcome: SignInOutcome; methods: readonly SignInMethod[]; created: boolean };
export type FreshOutcome = 'fresh' | 'cancelled' | 'failed' | 'unavailable' | 'not_configured' | 'other_account' | 'wrong_code' | 'rate_limited';
export type CodeOutcome = 'sent' | 'rate_limited' | 'unavailable' | 'failed' | 'not_configured';
export type RequestCredentials = { accessToken: string; sessionId: string };
/** `event: false` ends the session without the `signed_out` account event: after a sign-out everywhere, and after an accepted account deletion (R125). */
export type SignOutOptions = { event?: boolean };

export interface CredentialProvider {
  /** null: no usable session (or the credentials were denied, which locks), or not ready (the token names another session, R86; nothing locks). Rejects when the sign-in service can't be reached right now. */
  getAccessToken(): Promise<string | null>;
  /** One serialized forced refresh after a 401; concurrent callers share it. Also lifts a lock once the credentials work again. */
  refreshAfterUnauthorized(): Promise<boolean>;
  /** A v1 response said the server ended this session. Ignored unless `epoch` is still the session's. */
  sessionEnded(event: SessionEnded): void;
  getSessionSnapshot(): SessionSnapshot;
  subscribe(listener: () => void): () => void;
  /** At launch: the stored session, active when its cookie is still here, otherwise locked. */
  hydrate(): Promise<void>;
  sendEmailCode(email: string): Promise<CodeOutcome>;
  /** A sign-in while one runs joins it. An active result sends one account event: `signed_up` when the server created the account, otherwise `signed_in` (1D-T14). */
  signIn(request: SignInRequest): Promise<SignInResult>;
  freshSignIn(request: SignInRequest): Promise<FreshOutcome>;
  account(): StoredSession | null;
  methods(): readonly SignInMethod[];
  port(): BetterAuthPort;
  /** One token and the session id, read together, the token naming that session (R86); null unless the session is active. */
  requestCredentials(): Promise<RequestCredentials | null>;
  /** Why the session ended, while it is locked or needs signing in again. */
  endedReason(): 'signed_out_elsewhere' | 'account_unavailable' | null;
  /** Wins over a running sign-in; the session is signed out even if the record could not be cleared. From an active session it first sends `signed_out` (1D-T14), unless `event` is false (R125). */
  signOut(options?: SignOutOptions): Promise<void>;
}

export type CredentialDeps = { port: BetterAuthPort; sessions: SessionRecordStore; epochs?: EpochStore; logoutVault?: (credentials: RequestCredentials) => Promise<void> };

/** Epochs are reserved on disk this many at a time, so a launch never reuses a number an earlier launch handed out. */
const EPOCH_BLOCK = 64;
const noop = () => undefined;
const settle = (promise: Promise<unknown> | null) => (promise ? promise.then(noop, noop) : Promise.resolve());
const CANCELLED: SignInResult = { outcome: 'cancelled', methods: [], created: false };
const FAILED: SignInResult = { outcome: 'failed', methods: [], created: false };
const NOT_CONFIGURED: SignInResult = { outcome: 'not_configured', methods: [], created: false };

function memoryEpochs(): EpochStore {
  let value = 0;
  return { load: async () => value, save: async (epoch) => void (value = epoch) };
}

function offered(port: BetterAuthPort, method: SignInRequest['method']): boolean {
  return port.supported && port.methods.includes(method);
}

function signInResult(error: unknown): SignInResult {
  if (error instanceof AuthCancelled) return CANCELLED;
  if (error instanceof AuthUnavailable) return { outcome: 'unavailable', methods: [], created: false };
  if (error instanceof AuthRefused) {
    if (error.code === 'ACCOUNT_EXISTS') return { outcome: 'account_exists', methods: error.methods, created: false };
    if (error.code === 'ACCOUNT_UNAVAILABLE') return { outcome: 'account_unavailable', methods: [], created: false };
    if (error.code === 'WRONG_CODE') return { outcome: 'wrong_code', methods: [], created: false };
    if (error.code === 'RATE_LIMITED' || error.code === 'CODE_LIMIT') return { outcome: 'rate_limited', methods: [], created: false };
  }
  return FAILED;
}

function freshResult(error: unknown): FreshOutcome {
  if (error instanceof AuthCancelled) return 'cancelled';
  if (error instanceof AuthUnavailable) return 'unavailable';
  if (error instanceof AuthRefused) {
    if (error.code === 'OTHER_ACCOUNT') return 'other_account';
    if (error.code === 'WRONG_CODE') return 'wrong_code';
    if (error.code === 'RATE_LIMITED' || error.code === 'CODE_LIMIT') return 'rate_limited';
  }
  return 'failed';
}

/** The unverified `sid` claim of a JWT: the session it was issued for (R86). null when it cannot be read. */
function sessionOf(token: string): string | null {
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const padded = part.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (part.length % 4)) % 4);
    const json: unknown = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(padded), (char) => char.charCodeAt(0))));
    if (typeof json !== 'object' || json === null || !('sid' in json) || typeof json.sid !== 'string') return null;
    return json.sid;
  } catch {
    return null;
  }
}

/**
 * The app's credential provider: Better Auth's session, the SecureStore
 * record and the session state machine.
 *
 * Token reads and forced refreshes are serialized, and a read never hands out
 * a token from before a refresh. A denied refresh locks the session and keeps
 * the record; the service being unreachable is not a denial. Hydrate, sign-in
 * and sign-out run one at a time. A second sign-in joins the one in flight. A
 * sign-out wins, and a session the server accepted too late is signed out and
 * never stored. Every new session moves the epoch. A token goes out only with
 * the session it names (its `sid`, R86): while the phone's cookie is ahead of
 * the provider (mid sign-in), reads are not ready (null) and nothing locks.
 */
export function createCredentialProvider(deps: CredentialDeps): CredentialProvider {
  const epochs = deps.epochs ?? memoryEpochs();
  let snapshot: SessionSnapshot = INITIAL_SESSION;
  let record: StoredSession | null = null;
  let reason: 'signed_out_elsewhere' | 'account_unavailable' | null = null;
  const listeners = new Set<() => void>();

  let tokenRead: { promise: Promise<string | null>; epoch: number; generation: number } | null = null;
  let tokenGeneration = 0;
  let refreshing: Promise<boolean> | null = null;

  let generation = 0;
  let queue: Promise<unknown> = Promise.resolve();
  let hydrating: Promise<void> | null = null;
  let signing: Promise<SignInResult> | null = null;
  let ending: Promise<void> | null = null;
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
    if (event.type === 'bootstrapped' || event.type === 'signed_out') reason = null;
    if (event.type === 'auth_denied') reason = 'signed_out_elsewhere';
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

  async function forgetLateSession(): Promise<void> {
    await deps.port.signOut().catch(noop);
  }

  async function hydrateFlow(mine: number): Promise<void> {
    await loadEpochs();
    if (superseded(mine)) return;
    if (snapshot.state === 'locked') {
      await provider.refreshAfterUnauthorized().catch(() => false);
      return;
    }
    if (!accepts(snapshot, 'hydrate_start')) return;
    dispatch({ type: 'hydrate_start' });
    const stored = await deps.sessions.load().catch(() => null);
    if (superseded(mine)) return;
    if (!stored) {
      record = null;
      dispatch({ type: 'hydrate_empty' });
    } else {
      const cookie = await deps.port.hasSession().catch(() => false);
      if (superseded(mine)) return;
      record = stored;
      dispatch(cookie
        ? { type: 'hydrated', accountId: stored.accountId, binding: stored.sessionId }
        : { type: 'locked', accountId: stored.accountId, binding: stored.sessionId });
    }
    await reservation;
  }

  async function signInFlow(mine: number, request: SignInRequest): Promise<SignInResult> {
    await loadEpochs();
    if (superseded(mine)) return CANCELLED;
    if (!offered(deps.port, request.method)) return NOT_CONFIGURED;
    const first = accepts(snapshot, 'sign_in_start');
    if (!first && !accepts(snapshot, 'bootstrapped')) return FAILED;
    if (first) dispatch({ type: 'sign_in_start' });
    try {
      const session = await deps.port.signIn(request);
      if (superseded(mine)) {
        await forgetLateSession();
        return CANCELLED;
      }
      if (first) dispatch({ type: 'authenticated' });
      const next: StoredSession = { accountId: session.accountId, sessionId: session.sessionId, email: session.email, method: session.method };
      const write = deps.sessions.save(next).then(() => { record = next; });
      committing = write;
      try {
        await write;
      } catch {
        await forgetLateSession();
        record = null;
        await deps.sessions.clear().catch(noop);
        dispatch({ type: 'signed_out' });
        return FAILED;
      } finally {
        if (committing === write) committing = null;
      }
      if (superseded(mine)) {
        await forgetLateSession();
        return CANCELLED;
      }
      dispatch({ type: 'bootstrapped', accountId: next.accountId, binding: next.sessionId });
      // The account event (1D-T14), after the session change: AnalyticsUpkeep has
      // dropped the previous account by then (R120), so the event waits for this
      // account's answer (1D-T1) and is never sent as the previous account's. The
      // server's `created` decides it (K23), never the request's `signUp`.
      if (session.created) trackSignedUp({ method: request.method });
      else trackSignedIn({ method: request.method });
      await reservation;
      return { outcome: 'active', methods: [], created: session.created };
    } catch (error) {
      if (superseded(mine)) return CANCELLED;
      if (first) dispatch({ type: 'cancelled' });
      return signInResult(error);
    }
  }

  async function freshFlow(mine: number, request: SignInRequest): Promise<FreshOutcome> {
    await loadEpochs();
    if (superseded(mine)) return 'cancelled';
    if (!offered(deps.port, request.method)) return 'not_configured';
    if (snapshot.state !== 'active' || !record) return 'failed';
    const current = { accountId: record.accountId, email: record.email };
    const oldSessionId = record.sessionId;
    try {
      const session = await deps.port.freshSignIn(request, current);
      if (superseded(mine)) {
        await forgetLateSession();
        return 'cancelled';
      }
      await deps.port.signOutDevice(oldSessionId).catch(noop);
      if (superseded(mine)) {
        await forgetLateSession();
        return 'cancelled';
      }
      const next: StoredSession = { accountId: session.accountId, sessionId: session.sessionId, email: session.email, method: session.method };
      const write = deps.sessions.save(next).then(() => { record = next; });
      committing = write;
      try {
        await write;
      } catch {
        await forgetLateSession();
        record = null;
        await deps.sessions.clear().catch(noop);
        dispatch({ type: 'signed_out' });
        return 'failed';
      } finally {
        if (committing === write) committing = null;
      }
      if (superseded(mine)) {
        await forgetLateSession();
        return 'cancelled';
      }
      dispatch({ type: 'bootstrapped', accountId: next.accountId, binding: next.sessionId });
      await reservation;
      return 'fresh';
    } catch (error) {
      if (superseded(mine)) return 'cancelled';
      return freshResult(error);
    }
  }

  async function signOutFlow(): Promise<void> {
    const sessionId = record?.sessionId ?? snapshot.binding;
    dispatch({ type: 'signed_out' });
    await settle(committing);
    await settle(refreshing);
    let token: string | null = null;
    try {
      token = await deps.port.accessToken();
    } catch {
      token = null;
    }
    // R86: the vault hears only the session's own token; a token for a session the provider never held (a sign-out mid sign-in) is not sent.
    if (token && sessionId && sessionOf(token) === sessionId) await deps.logoutVault?.({ accessToken: token, sessionId }).catch(noop);
    await deps.port.signOut().catch(noop);
    record = null;
    let failure: { error: unknown } | null = null;
    try {
      await deps.sessions.clear();
    } catch (error) {
      failure = { error };
    }
    await reservation;
    if (failure) throw failure.error;
  }

  function endSession(): Promise<void> {
    if (ending) return ending;
    generation += 1;
    hydrating = null;
    signing = null;
    const run: Promise<void> = signOutFlow().finally(() => {
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
      const binding = snapshot.binding;
      if (tokenRead && tokenRead.epoch === epoch && tokenRead.generation === tokenGeneration) return tokenRead.promise;
      const promise = deps.port.accessToken().then((token) => {
        // null: the session is gone or denied - lock, keep everything. A rejection (offline) changes nothing.
        if (token === null) {
          if (snapshot.epoch === epoch) dispatch({ type: 'auth_denied' });
          return null;
        }
        // R86: a token for another session than this read's (the cookie moved
        // to a session the provider does not hold yet, mid sign-in), or one
        // whose session cannot be read, is not ready: null, as while signing
        // in. Never a denial, so nothing locks.
        const sid = sessionOf(token);
        return sid !== null && sid === binding ? token : null;
      });
      const entry = { promise, epoch, generation: tokenGeneration };
      tokenRead = entry;
      const clear = () => { if (tokenRead === entry) tokenRead = null; };
      promise.then(clear, clear);
      return promise;
    },

    refreshAfterUnauthorized() {
      if (snapshot.state !== 'active' && snapshot.state !== 'locked') return Promise.resolve(false);
      if (refreshing) return refreshing;
      const epoch = snapshot.epoch;
      tokenGeneration += 1;
      const shared: Promise<boolean> = deps.port
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
      if (!dispatch({ type: 'reauth_required' })) return;
      reason = code === 'ACCOUNT_UNAVAILABLE' ? 'account_unavailable' : 'signed_out_elsewhere';
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

    async sendEmailCode(email) {
      if (!offered(deps.port, 'email')) return 'not_configured';
      try {
        await deps.port.sendEmailCode(email);
        return 'sent';
      } catch (error) {
        if (error instanceof AuthUnavailable) return 'unavailable';
        if (error instanceof AuthRefused && (error.code === 'RATE_LIMITED' || error.code === 'CODE_LIMIT')) return 'rate_limited';
        return 'failed';
      }
    },

    signIn(request) {
      if (signing) return signing;
      const run: Promise<SignInResult> = enqueue((mine) => signInFlow(mine, request), CANCELLED).finally(() => {
        if (signing === run) signing = null;
      });
      signing = run;
      return run;
    },

    freshSignIn: (request) => enqueue((mine) => freshFlow(mine, request), 'cancelled'),

    account() {
      if (snapshot.state !== 'active' && snapshot.state !== 'locked' && snapshot.state !== 'reauth_required') return null;
      return record;
    },

    methods: () => deps.port.methods,
    port: () => deps.port,

    async requestCredentials() {
      if (snapshot.state !== 'active') return null;
      const epoch = snapshot.epoch;
      const token = await provider.getAccessToken();
      // One session's token and id: never a token read across a session change.
      if (!token || snapshot.state !== 'active' || snapshot.epoch !== epoch || !snapshot.binding) return null;
      return { accessToken: token, sessionId: snapshot.binding };
    },

    endedReason() {
      if (snapshot.state !== 'locked' && snapshot.state !== 'reauth_required') return null;
      return reason;
    },

    signOut(options) {
      // The account event (1D-T14) goes first, before the session change, so it is
      // tracked under the account signing out, before AnalyticsUpkeep resets the
      // identity. Only from an active session: a locked or ended one (a sign-out
      // from elsewhere, or a session that ended by itself, which send nothing) has
      // no binding, so AnalyticsUpkeep has already dropped its account (R120), and
      // an event tracked now would wait for the next account's yes. Never with
      // `event: false` (R125): sign out everywhere sends nothing in phase 1, and
      // after an accepted deletion an event under the account's analytics id could
      // bring back the PostHog person the deletion removes.
      if (options?.event !== false && snapshot.state === 'active') trackSignedOut({ method: provider.account()?.method });
      return endSession();
    },
  };
  return provider;
}
