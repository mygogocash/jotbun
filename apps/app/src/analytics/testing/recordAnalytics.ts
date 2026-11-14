// A controller on a recording client, signed in, for tests that want to see
// what a yes would send. `sent` is emptied after sign-in so a test sees only
// what it causes. `restore` puts the previous controller back.
// Remote flags (P6B-T14): the client takes pushed flags and answers
// getFeatureFlag from the last push, as PostHog does, and reset() empties them.
// With `flags`, the flags load answers them after a yes, and the recorder
// returns once they are pushed (its fakes answer at once, so one macrotask
// lets the push land); without, the load answers nothing.
import { getAnalytics, setAnalytics } from '../bus.ts';
import type { CleanProps } from '../catalog.ts';
import { createAnalytics } from '../controller.ts';
import type { Analytics, PostHogLike, ServerConsent, StoredConsent } from '../controller.ts';
import type { RemoteFlags } from '../remoteFlags.ts';

export type Recorded = { kind: 'capture' | 'screen' | 'identify' | 'reset'; name: string; properties: CleanProps };

const ACCOUNT = '00000000-0000-4000-8000-0000000000aa';

export async function recordAnalytics(options?: { consent?: ServerConsent; flags?: Record<string, boolean | string> }): Promise<{
  analytics: Analytics;
  sent: Recorded[];
  /** Every updateFlags push, in order (P6B-T14). */
  pushed: RemoteFlags[];
  /** Every flag read (getFeatureFlag), in order: each read is PostHog's exposure. */
  flagReads: string[];
  restore(): void;
}> {
  const sent: Recorded[] = [];
  const pushed: RemoteFlags[] = [];
  const flagReads: string[] = [];
  let flags: Record<string, boolean | string> = {};
  const client: PostHogLike = {
    capture(event, properties) { sent.push({ kind: 'capture', name: event, properties: properties ?? {} }); },
    screen(name, properties) { sent.push({ kind: 'screen', name, properties: properties ?? {} }); },
    identify(distinctId) { sent.push({ kind: 'identify', name: distinctId, properties: {} }); },
    reset() {
      flags = {};
      sent.push({ kind: 'reset', name: '', properties: {} });
    },
    startSessionRecording() {},
    stopSessionRecording() {},
    updateFlags(next, payloads) {
      flags = { ...next };
      pushed.push({ flags: { ...next }, payloads: { ...payloads } });
    },
    getFeatureFlag(key) {
      flagReads.push(key);
      return flags[key];
    },
  };
  let stored: StoredConsent | null = null;
  let consent: ServerConsent = options?.consent ?? 'yes';
  const kept = new Map<string, string>();
  const served = options?.flags;
  const analytics = createAnalytics({
    client,
    replay: true,
    store: {
      read: async () => (stored === null ? null : { ...stored }),
      write: async (value) => { stored = { ...value }; },
      erase: async () => { stored = null; },
    },
    server: {
      read: async () => ({ consent, analyticsId: 'a'.repeat(64), weeksSinceSignup: null }),
      setConsent: async (on) => { consent = on ? 'yes' : 'no'; },
    },
    flags: {
      load: async () => (served === undefined ? null : { flags: { ...served }, payloads: {} }),
      kept: () => ({
        get: async (name) => kept.get(name) ?? null,
        set: async (name, value) => { kept.set(name, value); },
        remove: async (name) => { kept.delete(name); },
        eraseAll: async () => { kept.clear(); },
      }),
    },
  });
  const previous = getAnalytics();
  await analytics.setAccount(ACCOUNT);
  setAnalytics(analytics);
  if (served !== undefined) await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
  sent.length = 0;
  return {
    analytics,
    sent,
    pushed,
    flagReads,
    restore() { setAnalytics(previous); },
  };
}
