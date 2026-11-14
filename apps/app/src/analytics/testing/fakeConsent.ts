// 1D-T1's real controller on a scripted server, for the consent tests and the
// catalogue's consent sections (plan 1D-T8; development only, never the app).
// Its PostHog client only records what a yes lets through, in memory, so
// nothing ever leaves; the store is in memory too. The server holds the
// account's answer and takes an answer at once, refuses it (offline), or
// holds it until `settle`.
import type { CleanProps } from '../catalog.ts';
import { createAnalytics } from '../controller.ts';
import type { Analytics, ServerConsent, StoredConsent } from '../controller.ts';

export const FAKE_CONSENT_ACCOUNT = '00000000-0000-4000-8000-0000000000aa';

/** How the server takes an answer: at once, never (offline), or when `settle` says. */
export type FakeConsentSend = 'lands' | 'fails' | 'held';

export type FakeConsentOptions = {
  /** What the server holds for the account. Default `unasked`. */
  readonly consent?: ServerConsent;
  /** Default `lands`. */
  readonly send?: FakeConsentSend;
  /** The server's answer cannot be read. */
  readonly offline?: boolean;
  /** This phone's stored no: one the server has not taken yet (`pending`), or one it has. */
  readonly storedNo?: 'pending' | 'delivered';
};

export type FakeConsent = {
  readonly analytics: Analytics;
  /** The server, which a test changes as another phone or the network would. */
  readonly server: { consent: ServerConsent; send: FakeConsentSend; offline: boolean };
  /** Every answer sent to the server, in order (true is yes). */
  readonly answers: boolean[];
  /** The events the client captured (only ever after a yes). */
  readonly captured: { name: string; properties: CleanProps }[];
  stored(): StoredConsent | null;
  /** Signs the account in: the controller loads its answer. */
  signIn(): Promise<void>;
  /** Lands or fails every answer still held, and later answers the same way. */
  settle(next: 'lands' | 'fails'): void;
};

const unreachable = () => new Error('Jotbun could not be reached.');

export function fakeConsent(options: FakeConsentOptions = {}): FakeConsent {
  const server: FakeConsent['server'] = { consent: options.consent ?? 'unasked', send: options.send ?? 'lands', offline: options.offline ?? false };
  let stored: StoredConsent | null = options.storedNo
    ? { accountId: FAKE_CONSENT_ACCOUNT, answer: 'no', pendingServer: options.storedNo === 'pending' }
    : null;
  const answers: boolean[] = [];
  const captured: FakeConsent['captured'] = [];
  const held: Array<{ on: boolean; resolve: () => void; reject: (error: Error) => void }> = [];
  const analytics = createAnalytics({
    client: {
      capture(name, properties) { captured.push({ name, properties: properties ?? {} }); },
      screen() {},
      identify() {},
      reset() {},
      startSessionRecording() {},
      stopSessionRecording() {},
      // No remote flags here (P6B-T14): none is pushed, so none is read.
      updateFlags() {},
      getFeatureFlag: () => undefined,
    },
    replay: false,
    store: {
      read: async () => (stored === null ? null : { ...stored }),
      write: async (value) => { stored = { ...value }; },
      erase: async () => { stored = null; },
    },
    server: {
      read: async () => {
        if (server.offline) throw unreachable();
        return { consent: server.consent, analyticsId: null, weeksSinceSignup: null };
      },
      setConsent: (on) => {
        answers.push(on);
        if (server.send === 'held') return new Promise<void>((resolve, reject) => { held.push({ on, resolve, reject }); });
        if (server.send === 'fails') return Promise.reject(unreachable());
        server.consent = on ? 'yes' : 'no';
        return Promise.resolve();
      },
    },
  });
  return {
    analytics,
    server,
    answers,
    captured,
    stored: () => (stored === null ? null : { ...stored }),
    signIn: () => analytics.setAccount(FAKE_CONSENT_ACCOUNT),
    settle(next) {
      server.send = next;
      for (const call of held.splice(0)) {
        if (next === 'fails') {
          call.reject(unreachable());
        } else {
          server.consent = call.on ? 'yes' : 'no';
          call.resolve();
        }
      }
    },
  };
}
