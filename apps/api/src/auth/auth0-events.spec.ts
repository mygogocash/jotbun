import { EVENT_SIGNATURE_HEADER, SecurityEventRejected, eventVerifierConfigFromEnv, signSecurityEvent, verifySecurityEvent } from './auth0-event-verifier';
import type { EventVerifierConfig } from './auth0-event-verifier';

const ISSUER = 'https://tenant.example.auth0.com/';
const SECRET = 'synthetic-event-secret-0123456789abcdef0123456789';
const OLD_SECRET = 'synthetic-old-event-secret-0123456789abcdef01234';
const config: EventVerifierConfig = { secrets: [SECRET], issuer: ISSUER };
const NOW = Date.parse('2026-10-17T09:00:00.000Z');
const seconds = (ms: number) => Math.floor(ms / 1000);

function envelope(overrides: Record<string, unknown> = {}, drop: string[] = []) {
  const body: Record<string, unknown> = { id: 'evt_0123456789abcdef', type: 'password_changed', issuer: ISSUER, subject: 'auth0|abc123', occurred_at: '2026-10-17T08:59:30.000Z', ...overrides };
  for (const key of drop) delete body[key];
  return JSON.stringify(body);
}

function rejection(run: () => unknown): string {
  try {
    run();
    return 'accepted';
  } catch (error) {
    if (error instanceof SecurityEventRejected) return error.code;
    throw error;
  }
}

const verify = (raw: string, header: string | undefined, at = NOW, with_ = config) => verifySecurityEvent(Buffer.from(raw, 'utf8'), header, with_, at);

describe('signed provider security events', () => {
  it('accepts a correctly signed, fresh event from the configured issuer', () => {
    const raw = envelope();
    const event = verify(raw, signSecurityEvent(raw, SECRET, seconds(NOW)));
    expect(event).toEqual({ id: 'evt_0123456789abcdef', type: 'password_changed', issuer: ISSUER, subject: 'auth0|abc123', occurredAt: new Date('2026-10-17T08:59:30.000Z') });
    expect(EVENT_SIGNATURE_HEADER).toBe('x-gogospend-event-signature');
  });

  it('refuses forged, missing, malformed and tampered signatures', () => {
    const raw = envelope();
    expect(rejection(() => verify(raw, undefined))).toBe('signature_invalid');
    expect(rejection(() => verify(raw, 'v1=abc'))).toBe('signature_invalid');
    expect(rejection(() => verify(raw, `t=${seconds(NOW)},v1=nothex`))).toBe('signature_invalid');
    expect(rejection(() => verify(raw, signSecurityEvent(raw, 'another-secret-entirely-0123456789abcdef', seconds(NOW))))).toBe('signature_invalid');
    // The body changed after signing (another subject).
    expect(rejection(() => verify(envelope({ subject: 'auth0|victim' }), signSecurityEvent(raw, SECRET, seconds(NOW))))).toBe('signature_invalid');
    // The timestamp changed after signing.
    const signed = signSecurityEvent(raw, SECRET, seconds(NOW));
    expect(rejection(() => verify(raw, signed.replace(`t=${seconds(NOW)}`, `t=${seconds(NOW) + 1}`)))).toBe('signature_invalid');
  });

  it('accepts any configured secret during rotation, and any listed v1 value', () => {
    const raw = envelope();
    const rotating = { secrets: [SECRET, OLD_SECRET], issuer: ISSUER };
    expect(verify(raw, signSecurityEvent(raw, OLD_SECRET, seconds(NOW)), NOW, rotating).id).toBe('evt_0123456789abcdef');
    const both = `${signSecurityEvent(raw, 'wrong-secret-0123456789abcdef0123456789', seconds(NOW))},v1=${signSecurityEvent(raw, SECRET, seconds(NOW)).split('v1=')[1]}`;
    expect(verify(raw, both).subject).toBe('auth0|abc123');
  });

  it('refuses a signature timestamp more than five minutes from now (replay window)', () => {
    const raw = envelope();
    expect(rejection(() => verify(raw, signSecurityEvent(raw, SECRET, seconds(NOW) - 301)))).toBe('timestamp_out_of_range');
    expect(rejection(() => verify(raw, signSecurityEvent(raw, SECRET, seconds(NOW) + 301)))).toBe('timestamp_out_of_range');
    expect(verify(raw, signSecurityEvent(raw, SECRET, seconds(NOW) - 299)).id).toBe('evt_0123456789abcdef');
  });

  it('refuses another issuer, unknown types and malformed envelopes after the signature checks out', () => {
    const cases: [string, string][] = [
      [envelope({ issuer: 'https://other.example.auth0.com/' }), 'source_invalid'],
      [envelope({ type: 'password_reset_requested' }), 'envelope_invalid'],
      [envelope({ id: 'short' }), 'envelope_invalid'],
      [envelope({ id: 'has spaces in it 123' }), 'envelope_invalid'],
      // Reconciliation's own receipt ids are reserved.
      [envelope({ id: 'reconcile:0123456789abcdef' }), 'envelope_invalid'],
      [envelope({ subject: '' }), 'envelope_invalid'],
      [envelope({ subject: 'x'.repeat(256) }), 'envelope_invalid'],
      [envelope({ occurred_at: 'yesterday' }), 'envelope_invalid'],
      [envelope({ extra: true }), 'envelope_invalid'],
      [envelope({}, ['subject']), 'envelope_invalid'],
      ['[1,2,3]', 'envelope_invalid'],
      ['not json', 'envelope_invalid'],
    ];
    for (const [raw, code] of cases) expect([raw, rejection(() => verify(raw, signSecurityEvent(raw, SECRET, seconds(NOW))))]).toEqual([raw, code]);
  });

  it('refuses events from the future or older than seven days', () => {
    for (const [occurred, code] of [
      ['2026-10-17T09:01:01.000Z', 'event_out_of_range'],
      ['2026-10-10T08:59:59.000Z', 'event_out_of_range'],
      ['2026-10-17T09:00:59.000Z', 'accepted'],
      ['2026-10-10T09:00:01.000Z', 'accepted'],
    ] as const) {
      const raw = envelope({ occurred_at: occurred });
      expect([occurred, rejection(() => verify(raw, signSecurityEvent(raw, SECRET, seconds(NOW))))]).toEqual([occurred, code]);
    }
  });

  it('refuses bodies over 8 KiB before anything else', () => {
    const raw = `{"pad":"${'x'.repeat(8200)}"}`;
    expect(rejection(() => verify(raw, signSecurityEvent(raw, SECRET, seconds(NOW))))).toBe('too_large');
  });

  it('reads its secrets from the environment and refuses short ones', () => {
    expect(eventVerifierConfigFromEnv({})).toBeNull();
    expect(eventVerifierConfigFromEnv({ AUTH0_EVENTS_SIGNING_SECRETS: `${SECRET}, ${OLD_SECRET}`, AUTH0_ISSUER: ISSUER })).toEqual({ secrets: [SECRET, OLD_SECRET], issuer: ISSUER });
    expect(() => eventVerifierConfigFromEnv({ AUTH0_EVENTS_SIGNING_SECRETS: 'too-short', AUTH0_ISSUER: ISSUER })).toThrow(/32/);
  });
});
