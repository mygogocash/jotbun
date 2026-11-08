// A controller on a recording client, signed in, for tests that want to see
// what a yes would send. `sent` is emptied after sign-in so a test sees only
// what it causes. `restore` puts the previous controller back.
import { getAnalytics, setAnalytics } from '../bus.ts';
import type { CleanProps } from '../catalog.ts';
import { createAnalytics } from '../controller.ts';
import type { Analytics, PostHogLike, ServerConsent, StoredConsent } from '../controller.ts';

export type Recorded = { kind: 'capture' | 'screen' | 'identify' | 'reset'; name: string; properties: CleanProps };

const ACCOUNT = '00000000-0000-4000-8000-0000000000aa';

export async function recordAnalytics(options?: { consent?: ServerConsent }): Promise<{ analytics: Analytics; sent: Recorded[]; restore(): void }> {
  const sent: Recorded[] = [];
  const client: PostHogLike = {
    capture(event, properties) { sent.push({ kind: 'capture', name: event, properties: properties ?? {} }); },
    screen(name, properties) { sent.push({ kind: 'screen', name, properties: properties ?? {} }); },
    identify(distinctId) { sent.push({ kind: 'identify', name: distinctId, properties: {} }); },
    reset() { sent.push({ kind: 'reset', name: '', properties: {} }); },
    startSessionRecording() {},
    stopSessionRecording() {},
  };
  let stored: StoredConsent | null = null;
  let consent: ServerConsent = options?.consent ?? 'yes';
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
  });
  const previous = getAnalytics();
  await analytics.setAccount(ACCOUNT);
  setAnalytics(analytics);
  sent.length = 0;
  return {
    analytics,
    sent,
    restore() { setAnalytics(previous); },
  };
}
