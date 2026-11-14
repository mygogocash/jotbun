// Consent, identity and the queue of events tracked before a yes.
// The server's answer is the truth, except a "no" this phone has not delivered yet.
// PostHog can still be holding the previous person's id after a restart, so a new
// controller starts as `loading` and reset() runs whenever the state is not yes.
// Remote flags (P6B-T14, X5, B25) are asked for only in yes, under the analytics
// id, and pushed into the client with updateFlags. The last answer is kept per
// account, so the next yes shows it at once, offline included. A no, an open
// question or a sign-out drops them; reset() empties the client's.
import type { KeyValueStore } from '../wallet/store/walletStore.ts';
import type { AppEventName, CleanProps, CommonProps } from './catalog.ts';
import { cleanCommon, cleanEvent, screenPattern } from './catalog.ts';
import { REMOTE_FLAGS_NAME, parseKeptFlags } from './remoteFlags.ts';
import type { JsonValue, RemoteFlags } from './remoteFlags.ts';

export type ConsentAnswer = 'yes' | 'no';
export type ConsentStatus = 'signed_out' | 'loading' | 'unanswered' | 'yes' | 'no';
export type ServerConsent = 'yes' | 'no' | 'unasked';
export type ServerAnalyticsState = { consent: ServerConsent; analyticsId: string | null; weeksSinceSignup: number | null };
export type StoredConsent = { accountId: string; answer: ConsentAnswer; pendingServer: boolean };
export type PostHogLike = {
  capture(event: string, properties?: CleanProps): void;
  screen(name: string, properties?: CleanProps): void;
  identify(distinctId: string): void;
  reset(): void;
  startSessionRecording(resumeCurrent?: boolean): unknown;
  stopSessionRecording(): unknown;
  /** Replaces the client's flags (P6B-T14); reset() empties them. */
  updateFlags(flags: Record<string, boolean | string>, payloads?: Record<string, JsonValue>): void;
  /** A pushed flag's value; PostHog records the read as `$feature_flag_called`. */
  getFeatureFlag(key: string): boolean | string | undefined;
};
export type AnalyticsDeps = {
  client: PostHogLike | null;
  replay: boolean;
  store: { read(): Promise<StoredConsent | null>; write(value: StoredConsent): Promise<void>; erase(): Promise<void> };
  server: { read(): Promise<ServerAnalyticsState>; setConsent(analytics: boolean): Promise<void> };
  /** Remote flags (P6B-T14): `load` asks for them under an analytics id; `kept` is the account's store (P2-T3). */
  flags?: { load(distinctId: string): Promise<RemoteFlags | null>; kept(accountId: string): KeyValueStore };
};
export interface Analytics {
  /**
   * Rejects when the store or the server fails while loading the answer: callers catch it.
   * `signedOut`: the session seen before has ended (a sign-out, or another session in its
   * place), whether or not its account was ever named here, so what is held is dropped
   * (R120). A plain null is "no one is signed in", which at the launch keeps what is held (R119).
   */
  setAccount(accountId: string | null, options?: { signedOut?: boolean }): Promise<void>;
  /**
   * A no is in force at once and stored at once, and reaches the server after any
   * call still on its way. Rejects when the queue's store write of a no fails (the
   * no stays in force), when the server refuses a yes, and with AccountChangedError
   * when the account that gave a yes is no longer signed in once the queue reaches
   * it. A yes reached while that same account is signed in again is still sent: it
   * is that account's own answer. Callers catch every rejection.
   */
  answer(answer: ConsentAnswer): Promise<void>;
  status(): ConsentStatus;
  /**
   * True while the no in force here has not reached the server yet: from a no
   * given on this phone, or found stored undelivered at a load, until the server
   * takes it (the next refresh sends it again). False for any other status.
   * Listeners hear when it changes (1D-T8: Privacy's "stopped on this phone").
   */
  pendingNo(): boolean;
  allowsAnalytics(): boolean;
  subscribe(listener: () => void): () => void;
  setCommon(patch: Partial<CommonProps>): void;
  track(name: string, properties?: Record<string, unknown>): void;
  screen(segments: readonly string[]): void;
  refresh(): Promise<void>;
  /**
   * A remote flag's value (P6B-T14): undefined unless the answer is yes and flags
   * were pushed since the client's last reset. Only then is the client read, so
   * PostHog's `$feature_flag_called` is only ever made after yes.
   */
  flag(key: string): boolean | string | undefined;
}

export const HELD_LIMIT = 50;

/** answer('yes') reached the queue after the account that gave it stopped being signed in: nothing was sent. */
export class AccountChangedError extends Error {
  constructor() {
    super('The account changed before the yes was sent');
    this.name = 'AccountChangedError';
  }
}

type Held = { name: AppEventName; properties: CleanProps };

export function createAnalytics(deps: AnalyticsDeps): Analytics {
  const client = deps.client;
  // undefined: the app has not said who is signed in yet. null: signed out.
  let accountId: string | null | undefined;
  let current: ConsentStatus = 'loading';
  // While `current` is no: that no has not reached the server yet (the stored pendingServer).
  let undelivered = false;
  let identifiedId: string | null = null;
  let common: Partial<CommonProps> = {};
  // The screen on display: its pattern, or null when it cannot be named. Sent
  // when the answer turns yes, so the first screen of a launch or a sign-in is
  // not missing (1D-T6's review, m3).
  let onDisplay: string | null = null;
  const held: Held[] = [];
  const listeners = new Set<() => void>();
  let generation = 0;
  // The generation of the newest answer() call: a yes still queued behind it is not sent.
  let latestAnswer = 0;
  // Server and store work runs one call at a time, in call order, so a yes still
  // on its way cannot land after a later no, at the server or in the store.
  let queue: Promise<void> = Promise.resolve();
  // Remote flags (P6B-T14): whether flags were pushed since the client's last reset.
  let flagsPushed = false;
  // Moves whenever the flags are dropped or the account changes, so a kept read or a
  // load still on its way is never pushed or kept after.
  let flagsEpoch = 0;

  function serialize(work: () => Promise<void>): Promise<void> {
    const run = queue.then(work);
    queue = run.catch(() => undefined);
    return run;
  }

  function stale(token: number, account: string): boolean {
    return token !== generation || accountId !== account;
  }

  /** `pendingNo`: with `no`, whether that no has not reached the server yet. Any other status clears it. */
  function setStatus(next: ConsentStatus, pendingNo = false): void {
    if (current === next && undelivered === pendingNo) return;
    current = next;
    undelivered = pendingNo;
    for (const listener of [...listeners]) listener();
  }

  function payload(properties: CleanProps): CleanProps {
    return { ...properties, ...cleanCommon(common), origin: 'app' };
  }

  /** Pushes flags into the client; every listener hears it, so useRollout reads again. */
  function pushFlags(remote: RemoteFlags): void {
    client?.updateFlags(remote.flags, remote.payloads);
    flagsPushed = true;
    for (const listener of [...listeners]) listener();
  }

  /**
   * Drops the flags: those pushed (reset() has emptied the client's) and those kept for
   * `account`, so a no, an open question or a sign-out leaves none to show or send.
   */
  function dropFlags(account: string | null | undefined): void {
    flagsEpoch += 1;
    flagsPushed = false;
    if (deps.flags !== undefined && typeof account === 'string') {
      deps.flags.kept(account).remove(REMOTE_FLAGS_NAME).catch(() => undefined);
    }
  }

  /**
   * In yes: entering it pushes the account's kept flags at once, so a launch, offline
   * included, shows the last rollouts; then, with an analytics id, a load pushes and
   * keeps its answer, and a failure keeps the old. Never without a client. Outside the
   * consent queue, so no consent call waits for the network.
   */
  async function syncFlags(entering: boolean): Promise<void> {
    const flags = deps.flags;
    const account = accountId;
    if (client === null || flags === undefined || typeof account !== 'string') return;
    const epoch = flagsEpoch;
    const store = flags.kept(account);
    if (entering) {
      const kept = parseKeptFlags(await store.get(REMOTE_FLAGS_NAME));
      if (epoch !== flagsEpoch) return;
      if (kept !== null) pushFlags(kept);
    }
    const distinctId = identifiedId;
    if (distinctId === null) return;
    const answer = await flags.load(distinctId);
    if (answer === null || epoch !== flagsEpoch) return;
    pushFlags(answer);
    await store.set(REMOTE_FLAGS_NAME, JSON.stringify(answer));
  }

  /** `pending`: the server does not have this no yet. */
  function applyNo(pending: boolean): void {
    client?.stopSessionRecording();
    // A no resets even when this process was only `loading`: the SDK can still
    // be carrying the id from the previous run.
    client?.reset();
    identifiedId = null;
    held.length = 0;
    dropFlags(accountId);
    setStatus('no', pending);
  }

  function enterYes(remote: ServerAnalyticsState | null): void {
    if (remote?.weeksSinceSignup != null) common.weeks_since_signup = remote.weeksSinceSignup;
    if (remote?.analyticsId && identifiedId !== remote.analyticsId) {
      client?.identify(remote.analyticsId);
      identifiedId = remote.analyticsId;
    }
    const entering = current !== 'yes';
    setStatus('yes');
    if (entering && deps.replay) client?.startSessionRecording(false);
    const queued = held.splice(0, held.length);
    for (const item of queued) client?.capture(item.name, payload(item.properties));
    if (entering && onDisplay !== null) client?.screen(onDisplay, payload({}));
    // Remote flags after yes (P6B-T14): each entry into yes, and each refresh in it.
    syncFlags(entering).catch(() => undefined);
  }

  function openQuestion(): void {
    if (current !== 'unanswered') {
      client?.reset();
      client?.stopSessionRecording();
      identifiedId = null;
    }
    dropFlags(accountId);
    setStatus('unanswered');
  }

  async function deliverPendingNo(token: number, account: string): Promise<void> {
    applyNo(true);
    try {
      await deps.server.setConsent(false);
      if (stale(token, account)) return;
      // The server has it: the no is no longer pending.
      setStatus('no');
      await deps.store.write({ accountId: account, answer: 'no', pendingServer: false });
    } catch {
      if (stale(token, account)) return;
      await deps.store.write({ accountId: account, answer: 'no', pendingServer: true });
    }
  }

  async function load(token: number): Promise<void> {
    const account = accountId;
    if (typeof account !== 'string') return;
    const stored = await deps.store.read();
    if (stale(token, account)) return;
    let remote: ServerAnalyticsState | null = null;
    let reachable = true;
    try {
      remote = await deps.server.read();
    } catch {
      reachable = false;
    }
    if (stale(token, account)) return;
    const mine = stored !== null && stored.accountId === account ? stored : null;

    // A no this phone has not delivered yet outranks a server that still says yes.
    if (mine?.answer === 'no' && mine.pendingServer) {
      await deliverPendingNo(token, account);
      return;
    }

    if (!reachable || remote === null) {
      if (mine?.answer === 'yes') enterYes(null);
      else if (mine?.answer === 'no') {
        applyNo(false);
        await deps.store.write({ accountId: account, answer: 'no', pendingServer: false });
      } else setStatus('loading');
      return;
    }

    if (remote.consent === 'yes') {
      await deps.store.write({ accountId: account, answer: 'yes', pendingServer: false });
      if (stale(token, account)) return;
      enterYes(remote);
      return;
    }
    // Capture stops before the store is touched, so a failed write cannot leave yes running.
    if (remote.consent === 'no') {
      applyNo(false);
      await deps.store.write({ accountId: account, answer: 'no', pendingServer: false });
      return;
    }
    openQuestion();
    await deps.store.erase();
  }

  return {
    async setAccount(id, options) {
      // A session that ended is never "no change": what it held is dropped even when its
      // account was never named here, or the controller already holds no one (R120).
      const signedOut = options?.signedOut === true;
      if (id === accountId && !signedOut) return;
      // What is held comes from the onboarding and the sign-in that led here (L4). The
      // launch's first answer keeps it, also when no one is signed in yet, and so does
      // signing in; a sign-out drops it whether or not its account was named, and so does
      // a switch (A to B) (R119, R120).
      const keepHeld = !signedOut && (accountId === undefined || (accountId === null && id !== null));
      // The account whose session ends here: its kept flags go with it (P6B-T14). The
      // launch's first account has none before it, so its kept flags stay.
      const previous = accountId;
      accountId = id;
      generation += 1;
      const token = generation;
      client?.reset();
      client?.stopSessionRecording();
      identifiedId = null;
      if (!keepHeld) held.length = 0;
      dropFlags(previous);
      if (id === null) {
        setStatus('signed_out');
        return;
      }
      setStatus('loading');
      await serialize(() => load(token));
    },

    async answer(choice) {
      const account = accountId;
      if (typeof account !== 'string') throw new Error('No signed-in account');
      generation += 1;
      const token = generation;
      latestAnswer = token;
      if (choice === 'no') {
        // In force at once, and stored at once, so a no given while another call is on its
        // way outlives the app being closed before that call ends. The server hears it after
        // that call.
        applyNo(true);
        const storedAtCall = deps.store.write({ accountId: account, answer: 'no', pendingServer: true }).catch(() => undefined);
        await serialize(async () => {
          // The queue's own writes come last: after that write, and after any the earlier call made.
          await storedAtCall;
          await deps.store.write({ accountId: account, answer: 'no', pendingServer: true });
          if (stale(token, account)) return;
          try {
            await deps.server.setConsent(false);
            if (stale(token, account)) return;
            // The server has it: the no is no longer pending.
            setStatus('no');
            await deps.store.write({ accountId: account, answer: 'no', pendingServer: false });
          } catch {
            // The no is already in force on this phone. The next refresh tries again.
          }
        });
        return;
      }
      await serialize(async () => {
        // Checked when the queue reaches this yes, before anything is sent: the server call
        // acts for whoever is signed in by then. A yes for an account that is no longer
        // signed in is refused, and a later answer replaces it; a refresh alone does not.
        if (accountId !== account) throw new AccountChangedError();
        if (latestAnswer !== token) return;
        await deps.server.setConsent(true);
        if (stale(token, account)) return;
        await deps.store.write({ accountId: account, answer: 'yes', pendingServer: false });
        if (stale(token, account)) return;
        let remote: ServerAnalyticsState | null = null;
        try {
          remote = await deps.server.read();
        } catch {
          remote = null;
        }
        if (stale(token, account)) return;
        enterYes(remote);
      });
    },

    status: () => current,
    pendingNo: () => undelivered,
    allowsAnalytics: () => current === 'yes',
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    setCommon(patch) {
      common = { ...common, ...patch };
    },

    track(name, properties) {
      const cleaned = cleanEvent(name, properties);
      if (cleaned === null) return;
      if (current === 'yes') {
        client?.capture(cleaned.name, payload(cleaned.properties));
        return;
      }
      if (current === 'no') return;
      held.push({ name: cleaned.name, properties: cleaned.properties });
      while (held.length > HELD_LIMIT) held.shift();
    },

    screen(segments) {
      onDisplay = screenPattern(segments);
      if (current !== 'yes' || onDisplay === null) return;
      client?.screen(onDisplay, payload({}));
    },

    async refresh() {
      if (typeof accountId !== 'string') return;
      generation += 1;
      const token = generation;
      await serialize(() => load(token));
    },

    flag(key) {
      if (current !== 'yes' || !flagsPushed) return undefined;
      return client?.getFeatureFlag(key);
    },
  };
}
