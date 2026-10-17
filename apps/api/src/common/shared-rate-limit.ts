import { createHmac } from 'node:crypto';
import { isIPv4, isIPv6 } from 'node:net';

import type { ApiIdentity, SessionContext } from '@gogospend/contracts';
import type { Request } from 'express';
import type { Pool } from 'pg';

import { needsBinding } from '../auth/route-policy';
import type { RouteAccess } from '../auth/route-policy';
import { ProblemException } from './api-problem.filter';
import { writeLog } from './safe-request-logger';

/** Requests per minute. Bucket keys are keyed hashes; raw IPs/subjects are never stored. */
export const RATE_BUDGETS = {
  read: 120, // per resolved session (binding)
  write: 60, // per resolved session (binding)
  principal: 360, // all bound requests of one verified principal, before session lookup
  auth_principal: 10, // challenge/bootstrap per verified principal
  auth_network: 30, // challenge/bootstrap per trusted network address (IPv6 per /64)
} as const;
export type RateBudget = keyof typeof RATE_BUDGETS;

export type RateDecision = { allowed: boolean; retryAfterSeconds: number };

export const RATE_LIMITER = Symbol('RATE_LIMITER');

export interface RateLimiter {
  consume(budget: RateBudget, subject: string): Promise<RateDecision>;
}

const WINDOW_SECONDS = 60;
// Roughly one request in 200 also clears expired buckets.
const PURGE_PROBABILITY = 1 / 200;

/**
 * Fixed one-minute windows counted in PostgreSQL, so every API replica shares
 * one budget. Only HMAC(RATE_LIMIT_KEY, budget + subject) is stored, and rows
 * expire within the hour. The app role reaches the table only through two
 * SECURITY DEFINER routines.
 */
export class PostgresRateLimiter implements RateLimiter {
  constructor(private readonly pool: Pool, private readonly key: Buffer) {}

  async consume(budget: RateBudget, subject: string): Promise<RateDecision> {
    const bucketKey = createHmac('sha256', this.key).update(`${budget}\u0000${subject}`).digest('hex');
    const { rows } = await this.pool.query<{ hits: number; retry_after_seconds: number }>(
      'SELECT hits, retry_after_seconds FROM gogospend_consume_rate_limit($1, $2)',
      [bucketKey, WINDOW_SECONDS],
    );
    if (Math.random() < PURGE_PROBABILITY) {
      this.purgeExpired().catch(() => writeLog({ level: 'warn', event: 'rate_limit_purge_failed' }));
    }
    return { allowed: rows[0].hits <= RATE_BUDGETS[budget], retryAfterSeconds: Math.max(1, rows[0].retry_after_seconds) };
  }

  async purgeExpired(): Promise<number> {
    const { rows } = await this.pool.query<{ purged: number }>('SELECT gogospend_purge_rate_limits() AS purged');
    return rows[0].purged;
  }
}

/** RATE_LIMIT_KEY: at least 32 characters, used only to key bucket hashes. */
export function rateLimitKeyFromEnv(env: NodeJS.ProcessEnv): Buffer {
  const key = env.RATE_LIMIT_KEY ?? '';
  if (key.length < 32) throw new Error('RATE_LIMIT_KEY must be at least 32 characters.');
  return Buffer.from(key, 'utf8');
}

/**
 * The network bucket for an address: IPv4 as is (including IPv4-mapped IPv6),
 * IPv6 by its /64, since one client typically controls a whole /64. Anything
 * unparseable shares a single "unknown" bucket.
 */
export function networkSubject(ip: string | undefined): string {
  if (!ip) return 'unknown';
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped && isIPv4(mapped[1])) return mapped[1];
  if (isIPv4(ip)) return ip;
  if (!isIPv6(ip)) return 'unknown';
  const [head, tail = ''] = ip.toLowerCase().split('::');
  const headGroups = head ? head.split(':') : [];
  const tailGroups = ip.includes('::') ? (tail ? tail.split(':') : []) : [];
  const groups = [...headGroups, ...Array<string>(8 - headGroups.length - tailGroups.length).fill('0'), ...tailGroups];
  return `${groups.slice(0, 4).map((group) => Number.parseInt(group, 16).toString(16)).join(':')}::/64`;
}

/**
 * Charges made before the session lookup. Public routes are free (health
 * checks must not depend on the database). Token-only routes are charged to
 * the verified principal and to the network bucket derived under the
 * configured trust-proxy setting. Bound routes are charged to the principal,
 * so a flood of invented bindings is limited before any session query.
 */
export async function chargeBeforeSession(limiter: RateLimiter, access: RouteAccess, identity: ApiIdentity, req: Request): Promise<void> {
  if (access === 'public') return;
  const principal = `${identity.issuer}\u0000${identity.subject}`;
  if (!needsBinding(access)) {
    await charge(limiter, [['auth_principal', principal], ['auth_network', networkSubject(req.ip)]]);
  } else {
    await charge(limiter, [['principal', principal]]);
  }
}

/** Per-session read/write budgets, keyed by the server's binding id, never the client's string. */
export async function chargeSession(limiter: RateLimiter, req: Request, session: SessionContext): Promise<void> {
  await charge(limiter, [[req.method === 'GET' || req.method === 'HEAD' ? 'read' : 'write', session.bindingId]]);
}

async function charge(limiter: RateLimiter, charges: [RateBudget, string][]): Promise<void> {
  let decisions: RateDecision[];
  try {
    decisions = await Promise.all(charges.map(([budget, subject]) => limiter.consume(budget, subject)));
  } catch {
    throw new ProblemException(503, 'SERVICE_UNAVAILABLE', { retryAfterSeconds: 5 });
  }
  const denied = decisions.filter((decision) => !decision.allowed);
  if (denied.length > 0) {
    throw new ProblemException(429, 'RATE_LIMITED', { retryAfterSeconds: Math.max(...denied.map((decision) => decision.retryAfterSeconds)) });
  }
}
