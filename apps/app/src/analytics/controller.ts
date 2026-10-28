// Consent, identity and the queue of events tracked before a yes.
// The server's answer is the truth, except a "no" this phone has not delivered yet.
// PostHog can still be holding the previous person's id after a restart, so a new
// controller starts as `loading` and reset() runs whenever the state is not yes.
import type { AppEventName, CleanProps, CommonProps } from './catalog.ts';
import { cleanCommon, cleanEvent, screenPattern } from './catalog.ts';

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
};
export type AnalyticsDeps = {
  client: PostHogLike | null;
  replay: boolean;
  store: { read(): Promise<StoredConsent | null>; write(value: StoredConsent): Promise<void>; erase(): Promise<void> };
  server: { read(): Promise<ServerAnalyticsState>; setConsent(analytics: boolean): Promise<void> };
};
export interface Analytics {
  setAccount(accountId: string | null): Promise<void>;
  answer(answer: ConsentAnswer): Promise<void>;
  status(): ConsentStatus;
  allowsAnalytics(): boolean;
  subscribe(listener: () => void): () => void;
  setCommon(patch: Partial<CommonProps>): void;
  track(name: string, properties?: Record<string, unknown>): void;
  screen(segments: readonly string[]): void;
  refresh(): Promise<void>;
}

export const HELD_LIMIT = 50;

type Held = { name: AppEventName; properties: CleanProps };

export function createAnalytics(deps: AnalyticsDeps): Analytics {
  const client = deps.client;
  // undefined: the app has not said who is signed in yet. null: signed out.
  let accountId: string | null | undefined;
  let current: ConsentStatus = 'loading';
  let identifiedId: string | null = null;
  let common: Partial<CommonProps> = {};
  const held: Held[] = [];
  const listeners = new Set<() => void>();
  let generation = 0;
  // Server and store work runs one call at a time, in call order, so a yes still
  // on its way cannot land after a later no, at the server or in the store.
  let queue: Promise<void> = Promise.resolve();

  function serialize(work: () => Promise<void>): Promise<void> {
    const run = queue.then(work);
    queue = run.catch(() => undefined);
    return run;
  }

  function stale(token: number, account: string): boolean {
    return token !== generation || accountId !== account;
  }

  function setStatus(next: ConsentStatus): void {
    if (current === next) return;
    current = next;
    for (const listener of [...listeners]) listener();
  }

  function payload(properties: CleanProps): CleanProps {
    return { ...properties, ...cleanCommon(common), origin: 'app' };
  }

  function applyNo(): void {
    client?.stopSessionRecording();
    // A no resets even when this process was only `loading`: the SDK can still
    // be carrying the id from the previous run.
    client?.reset();
    identifiedId = null;
    held.length = 0;
    setStatus('no');
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
  }

  function openQuestion(): void {
    if (current !== 'unanswered') {
      client?.reset();
      client?.stopSessionRecording();
      identifiedId = null;
    }
    setStatus('unanswered');
  }

  async function deliverPendingNo(token: number, account: string): Promise<void> {
    applyNo();
    try {
      await deps.server.setConsent(false);
      if (stale(token, account)) return;
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
        applyNo();
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
      applyNo();
      await deps.store.write({ accountId: account, answer: 'no', pendingServer: false });
      return;
    }
    openQuestion();
    await deps.store.erase();
  }

  return {
    async setAccount(id) {
      if (id === accountId) return;
      const keepHeld = (accountId === undefined || accountId === null) && id !== null;
      accountId = id;
      generation += 1;
      const token = generation;
      client?.reset();
      client?.stopSessionRecording();
      identifiedId = null;
      if (!keepHeld) held.length = 0;
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
      if (choice === 'no') {
        // In force at once; the store and the server hear it after any call still on its way.
        applyNo();
        await serialize(async () => {
          await deps.store.write({ accountId: account, answer: 'no', pendingServer: true });
          if (stale(token, account)) return;
          try {
            await deps.server.setConsent(false);
            if (stale(token, account)) return;
            await deps.store.write({ accountId: account, answer: 'no', pendingServer: false });
          } catch {
            // The no is already in force on this phone. The next refresh tries again.
          }
        });
        return;
      }
      await serialize(async () => {
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
      if (current !== 'yes') return;
      const pattern = screenPattern(segments);
      if (pattern === null) return;
      client?.screen(pattern, payload({}));
    },

    async refresh() {
      if (typeof accountId !== 'string') return;
      generation += 1;
      const token = generation;
      await serialize(() => load(token));
    },
  };
}
