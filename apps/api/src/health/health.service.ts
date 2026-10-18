import { readFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';

import { Inject, Injectable, Optional } from '@nestjs/common';
import type { OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import type { Pool, QueryConfig } from 'pg';

import { ConfigurationError } from '../common/configuration-error';
import { writeLog } from '../common/safe-request-logger';
import { PG_POOL } from '../database/database.service';
import { MANDATORY_RECEIPTS, RECEIPT_EXPIRY_WARNING_DAYS, isReceiptKind, receiptExpiryWarnings, receiptState } from './readiness-receipts';
import type { ReadinessReceipts, ReceiptKind } from './readiness-receipts';

export { MANDATORY_RECEIPTS, RECEIPT_EXPIRY_WARNING_DAYS, RECEIPT_MAX_VALIDITY_DAYS, RECEIPT_TARGETS, receiptExpiryWarnings, receiptState } from './readiness-receipts';
export type { ReadinessReceipts, ReceiptKind, ReceiptState } from './readiness-receipts';

export const READINESS_RECEIPTS = Symbol('READINESS_RECEIPTS');
export const HEALTH_OPTIONS = Symbol('HEALTH_OPTIONS');
export type HealthOptions = {
  /** Database round-trip bound (default 2 s). */
  timeoutMs?: number;
  /** How long one readiness result is reused (default 5 s). */
  cacheMs?: number;
  now?: () => Date;
  log?: (entry: Record<string, unknown>) => void;
};

/**
 * Reads the receipt source strictly; a malformed source stops startup.
 * Source: `READINESS_RECEIPTS` (inline JSON) or `READINESS_RECEIPTS_FILE`
 * (an absolute path to the same JSON), read once at startup; never both.
 * Locally neither is set, so `/ready` correctly fails. Rules and format:
 * readiness-receipts.ts and docs/implementation/beta-receipts.md.
 */
export function readinessReceiptsFromEnv(env: NodeJS.ProcessEnv, readFile: (path: string) => string = (path) => readFileSync(path, 'utf8')): ReadinessReceipts {
  const inline = env.READINESS_RECEIPTS ?? '';
  const file = env.READINESS_RECEIPTS_FILE ?? '';
  if (inline && file) throw new ConfigurationError('Set READINESS_RECEIPTS or READINESS_RECEIPTS_FILE, not both.');
  if (!inline && !file) return {};
  if (file && !isAbsolute(file)) throw new ConfigurationError('READINESS_RECEIPTS_FILE must be an absolute path.');
  let text: string;
  try {
    text = inline || readFile(file);
  } catch {
    throw new ConfigurationError('READINESS_RECEIPTS_FILE is not readable.');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ConfigurationError('READINESS_RECEIPTS is not valid JSON.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new ConfigurationError('READINESS_RECEIPTS must be a JSON object keyed by receipt kind.');
  const unknown = Object.keys(parsed).filter((key) => !isReceiptKind(key));
  if (unknown.length > 0) {
    // Receipt kinds are fixed identifiers, so naming the unexpected key is safe only when it looks like one.
    const shown = unknown.map((key) => (/^[a-z][a-z0-9_]{0,40}$/.test(key) ? key : '?')).join(', ');
    throw new ConfigurationError(`READINESS_RECEIPTS has unknown receipt kinds (${shown}); expected ${MANDATORY_RECEIPTS.join(', ')}.`);
  }
  return parsed as ReadinessReceipts;
}

export type Readiness = { ready: boolean; checks: Record<string, string> };

const TIMEOUT = Symbol('timeout');
const HOUR_MS = 3_600_000;

/**
 * `/live` is the process alone. `/ready` adds a bounded database round trip
 * and every mandatory receipt, and fails while the process drains. Results
 * are cached (`cacheMs`) and computed single-flight, so health probes cannot
 * drive database load. Check states and driver text never reach a response;
 * a change of state logs one line with the states. At startup and every
 * hour, a passed receipt within RECEIPT_EXPIRY_WARNING_DAYS of its expiry
 * logs `receipt_expiring` (at most once a day per receipt), so it is renewed
 * before `/ready` fails.
 */
@Injectable()
export class HealthService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly timeoutMs: number;
  private readonly cacheMs: number;
  private readonly now: () => Date;
  private readonly log: (entry: Record<string, unknown>) => void;
  private draining = false;
  private cached: { at: number; result: Readiness } | undefined;
  private inflight: Promise<Readiness> | undefined;
  private lastLogged: string | undefined;
  private readonly expiryWarnedAt = new Map<ReceiptKind, number>();
  private expiryTimer: NodeJS.Timeout | undefined;

  constructor(
    @Inject(PG_POOL) private readonly pool: Pick<Pool, 'query'>,
    @Inject(READINESS_RECEIPTS) private readonly receipts: ReadinessReceipts,
    @Optional() @Inject(HEALTH_OPTIONS) options: HealthOptions = {},
  ) {
    this.timeoutMs = options.timeoutMs ?? 2_000;
    this.cacheMs = options.cacheMs ?? 5_000;
    this.now = options.now ?? (() => new Date());
    this.log = options.log ?? ((entry) => writeLog(entry));
  }

  live(): { status: 'live' } {
    return { status: 'live' };
  }

  /** Logs `receipt_expiring` for each passed receipt within the warning window, at most once a day per receipt. */
  checkReceiptExpiry(): void {
    const now = this.now();
    for (const { kind, hoursLeft } of receiptExpiryWarnings(this.receipts, now)) {
      const last = this.expiryWarnedAt.get(kind);
      if (last !== undefined && now.getTime() - last < 24 * HOUR_MS) continue;
      this.expiryWarnedAt.set(kind, now.getTime());
      this.log({ level: 'warn', event: 'receipt_expiring', receipt: kind, hours_left: hoursLeft, warning_days: RECEIPT_EXPIRY_WARNING_DAYS });
    }
  }

  onApplicationBootstrap(): void {
    this.checkReceiptExpiry();
    this.expiryTimer = setInterval(() => this.checkReceiptExpiry(), HOUR_MS);
    this.expiryTimer.unref();
  }

  onApplicationShutdown(): void {
    clearInterval(this.expiryTimer);
    this.expiryTimer = undefined;
  }

  /** From now on `/ready` fails, so a load balancer stops routing here while requests drain. */
  markDraining(): void {
    this.draining = true;
    this.cached = undefined;
  }

  async ready(): Promise<Readiness> {
    const at = Date.now();
    if (!this.draining && this.cached && at - this.cached.at < this.cacheMs) return this.cached.result;
    this.inflight ??= this.evaluate().finally(() => {
      this.inflight = undefined;
    });
    return this.inflight;
  }

  private async evaluate(): Promise<Readiness> {
    const checks: Record<string, string> = { process: this.draining ? 'draining' : 'ok', database: await this.database() };
    const now = this.now();
    for (const kind of MANDATORY_RECEIPTS) checks[`receipt.${kind}`] = receiptState(kind, this.receipts[kind], now);
    const ready = checks.process === 'ok' && checks.database === 'ok' && MANDATORY_RECEIPTS.every((kind) => checks[`receipt.${kind}`] === 'passed');
    const result: Readiness = { ready, checks };
    this.cached = { at: Date.now(), result };
    const summary = JSON.stringify(result);
    if (summary !== this.lastLogged) {
      this.lastLogged = summary;
      this.log({ level: ready ? 'info' : 'warn', event: 'readiness', status: ready ? 'ready' : 'not_ready', checks });
    }
    return result;
  }

  // pg honours a per-query `query_timeout`; @types/pg does not declare it.
  private get readinessQuery(): QueryConfig {
    const query: QueryConfig & { query_timeout: number } = { text: 'SELECT 1 AS ok', query_timeout: this.timeoutMs };
    return query;
  }

  private async database(): Promise<'ok' | 'failed' | 'timeout'> {
    let timer: NodeJS.Timeout | undefined;
    try {
      const outcome = await Promise.race([
        // query_timeout ends the query (and discards its connection) too, so a
        // hung database cannot pin pooled connections behind the race.
        this.pool.query(this.readinessQuery).then(() => 'ok' as const),
        new Promise<typeof TIMEOUT>((resolve) => {
          timer = setTimeout(() => resolve(TIMEOUT), this.timeoutMs);
        }),
      ]);
      return outcome === TIMEOUT ? 'timeout' : 'ok';
    } catch {
      return 'failed';
    } finally {
      clearTimeout(timer);
    }
  }
}
