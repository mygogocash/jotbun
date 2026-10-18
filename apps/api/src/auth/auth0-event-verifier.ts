// F6b: the signed envelope an Auth0 Action (post-change-password) or the
// operator tooling sends to POST /v1/auth/provider-events.
//
//   x-gogospend-event-signature: t=<unix seconds>,v1=<hex HMAC-SHA256>
//   body: {"id","type","issuer","subject","occurred_at"} (exactly these keys)
//
// The MAC covers `${t}.${raw body}` under a shared secret (AUTH0_EVENTS_SIGNING_SECRETS,
// comma-separated so a new secret can be added before the old one is removed).
import { createHmac, timingSafeEqual } from 'node:crypto';
import { ConfigurationError } from '../common/configuration-error';

export const EVENT_SIGNATURE_HEADER = 'x-gogospend-event-signature';
export const SECURITY_EVENT_TYPES = ['password_changed', 'user_blocked'] as const;
export type SecurityEventType = (typeof SECURITY_EVENT_TYPES)[number];

export type VerifiedSecurityEvent = { id: string; type: SecurityEventType; issuer: string; subject: string; occurredAt: Date };
export type EventVerifierConfig = { secrets: readonly string[]; issuer: string };

export type RejectionCode = 'too_large' | 'signature_invalid' | 'timestamp_out_of_range' | 'envelope_invalid' | 'source_invalid' | 'event_out_of_range';

export class SecurityEventRejected extends Error {
  constructor(readonly code: RejectionCode) {
    super(`security event rejected: ${code}`);
    this.name = 'SecurityEventRejected';
  }
}

/** The header value for a body signed at `timestampSeconds` (the Action's side; also used by tests). */
export function signSecurityEvent(rawBody: string, secret: string, timestampSeconds: number): string {
  const mac = createHmac('sha256', secret).update(`${timestampSeconds}.${rawBody}`).digest('hex');
  return `t=${timestampSeconds},v1=${mac}`;
}

const MAX_BODY_BYTES = 8 * 1024;
// The signature timestamp may be this far from now (replay window).
const SIGNATURE_TOLERANCE_SECONDS = 300;
// An event may be at most this far in the future (clock skew) or in the past.
const FUTURE_SKEW_MS = 60_000;
const MAX_EVENT_AGE_MS = 7 * 24 * 3600_000;
const EVENT_ID = /^[A-Za-z0-9_.:-]{8,128}$/;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;
const KEYS = ['id', 'issuer', 'occurred_at', 'subject', 'type'];

function parseHeader(header: string | undefined): { timestamp: number; macs: Buffer[] } {
  if (typeof header !== 'string' || header.length > 1024) throw new SecurityEventRejected('signature_invalid');
  let timestamp: number | null = null;
  const macs: Buffer[] = [];
  for (const part of header.split(',')) {
    const [name, value, ...rest] = part.trim().split('=');
    if (rest.length > 0 || value === undefined) throw new SecurityEventRejected('signature_invalid');
    if (name === 't' && /^\d{1,12}$/.test(value) && timestamp === null) timestamp = Number(value);
    else if (name === 'v1' && /^[0-9a-f]{64}$/.test(value)) macs.push(Buffer.from(value, 'hex'));
    else throw new SecurityEventRejected('signature_invalid');
  }
  if (timestamp === null || macs.length === 0 || macs.length > 4) throw new SecurityEventRejected('signature_invalid');
  return { timestamp, macs };
}

/**
 * Checks, in order: size, signature (any configured secret, any listed v1
 * MAC, constant time), the signature's replay window, then the envelope
 * (exact keys, known type, id and subject shape, a real instant), the issuer,
 * and the event time (not in the future, at most seven days old). Nothing
 * from an unauthenticated body is trusted or reported.
 */
export function verifySecurityEvent(rawBody: Buffer, header: string | undefined, config: EventVerifierConfig, nowMs: number = Date.now()): VerifiedSecurityEvent {
  if (rawBody.length > MAX_BODY_BYTES) throw new SecurityEventRejected('too_large');
  const { timestamp, macs } = parseHeader(header);
  const signed = Buffer.concat([Buffer.from(`${timestamp}.`, 'utf8'), rawBody]);
  const valid = config.secrets.some((secret) => {
    const expected = createHmac('sha256', secret).update(signed).digest();
    return macs.some((mac) => timingSafeEqual(mac, expected));
  });
  if (!valid) throw new SecurityEventRejected('signature_invalid');
  if (Math.abs(nowMs / 1000 - timestamp) > SIGNATURE_TOLERANCE_SECONDS) throw new SecurityEventRejected('timestamp_out_of_range');

  let body: unknown;
  try {
    body = JSON.parse(rawBody.toString('utf8'));
  } catch {
    throw new SecurityEventRejected('envelope_invalid');
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new SecurityEventRejected('envelope_invalid');
  const fields = body as Record<string, unknown>;
  if (Object.keys(fields).sort().join(',') !== KEYS.join(',')) throw new SecurityEventRejected('envelope_invalid');
  const { id, type, issuer, subject, occurred_at: occurred } = fields;
  // `reconcile:` ids belong to reconciliation's own receipts.
  if (typeof id !== 'string' || !EVENT_ID.test(id) || id.startsWith('reconcile:')) throw new SecurityEventRejected('envelope_invalid');
  if (typeof type !== 'string' || !(SECURITY_EVENT_TYPES as readonly string[]).includes(type)) throw new SecurityEventRejected('envelope_invalid');
  if (typeof subject !== 'string' || subject.length < 1 || subject.length > 255) throw new SecurityEventRejected('envelope_invalid');
  if (typeof issuer !== 'string' || typeof occurred !== 'string' || !ISO_INSTANT.test(occurred)) throw new SecurityEventRejected('envelope_invalid');
  const occurredAt = new Date(occurred);
  if (Number.isNaN(occurredAt.getTime())) throw new SecurityEventRejected('envelope_invalid');
  if (issuer !== config.issuer) throw new SecurityEventRejected('source_invalid');
  if (occurredAt.getTime() > nowMs + FUTURE_SKEW_MS || occurredAt.getTime() < nowMs - MAX_EVENT_AGE_MS) throw new SecurityEventRejected('event_out_of_range');
  return { id, type: type as SecurityEventType, issuer, subject, occurredAt };
}

/** Null when unset (the route then answers 404); refuses short secrets. */
export function eventVerifierConfigFromEnv(env: NodeJS.ProcessEnv): EventVerifierConfig | null {
  const secrets = (env.AUTH0_EVENTS_SIGNING_SECRETS ?? '').split(',').map((secret) => secret.trim()).filter(Boolean);
  if (secrets.length === 0 || !env.AUTH0_ISSUER) return null;
  if (secrets.some((secret) => secret.length < 32)) throw new ConfigurationError('Each AUTH0_EVENTS_SIGNING_SECRETS entry must be at least 32 characters.');
  return { secrets, issuer: env.AUTH0_ISSUER };
}
