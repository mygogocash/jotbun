import { readFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';

import { Inject, Injectable, Optional } from '@nestjs/common';
import type { Pool } from 'pg';

import { writeLog } from '../common/safe-request-logger';
import { PG_POOL } from '../database/database.service';

/**
 * Release receipts the API needs before it may take traffic (P6b). Each is
 * the redacted outcome of a hosted gate, recorded by operations:
 *
 * - `restore_rehearsal`: P6a's hosted restore rehearsal
 *   (`restore-rehearsal.mjs --target isolated-synthetic`: restore, erasure
 *   reapplied, attachments resolved) - a local rehearsal never counts;
 * - `storage_contract`: P1's hosted gate, `STORAGE_CONTRACT_TARGET=r2-test
 *   npm run test:storage-contract -w gogospend-api`.
 *
 * Source: `READINESS_RECEIPTS` (inline JSON) or `READINESS_RECEIPTS_FILE`
 * (an absolute path to the same JSON), read once at startup; never both.
 * Locally neither is set, so `/ready` correctly fails. The JSON is an object
 * keyed by receipt kind:
 *
 *   { "restore_rehearsal": { "status": "passed", "recorded_at": ISO,
 *       "valid_until": ISO, "target": "isolated-synthetic",
 *       "evidence_sha256": "<SHA-256 of the stored redacted receipt>" }, … }
 *
 * See docs/implementation/beta-receipts.md for how each is produced.
 */
export const MANDATORY_RECEIPTS = ['restore_rehearsal', 'storage_contract'] as const;
export type ReceiptKind = (typeof MANDATORY_RECEIPTS)[number];
/** The hosted targets whose receipts count; a local or other target never makes the API ready. */
export const RECEIPT_TARGETS: Readonly<Record<ReceiptKind, readonly string[]>> = {
  restore_rehearsal: ['isolated-synthetic'],
  storage_contract: ['r2-test'],
};
/** A receipt is valid for at most this long after it was recorded (rehearse at least monthly). */
export const RECEIPT_MAX_VALIDITY_DAYS = 31;
export type ReceiptState = 'passed' | 'missing' | 'failed' | 'expired' | 'invalid';
/** Raw entries by kind; each is evaluated at check time (expiry depends on the clock). */
export type ReadinessReceipts = Partial<Record<ReceiptKind, unknown>>;

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

function isReceiptKind(value: string): value is ReceiptKind {
  return (MANDATORY_RECEIPTS as readonly string[]).includes(value);
}

/** Reads the receipt source strictly; a malformed source stops startup. */
export function readinessReceiptsFromEnv(env: NodeJS.ProcessEnv, readFile: (path: string) => string = (path) => readFileSync(path, 'utf8')): ReadinessReceipts {
  const inline = env.READINESS_RECEIPTS ?? '';
  const file = env.READINESS_RECEIPTS_FILE ?? '';
  if (inline && file) throw new Error('Set READINESS_RECEIPTS or READINESS_RECEIPTS_FILE, not both.');
  if (!inline && !file) return {};
  if (file && !isAbsolute(file)) throw new Error('READINESS_RECEIPTS_FILE must be an absolute path.');
  let text: string;
  try {
    text = inline || readFile(file);
  } catch {
    throw new Error('READINESS_RECEIPTS_FILE is not readable.');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('READINESS_RECEIPTS is not valid JSON.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('READINESS_RECEIPTS must be a JSON object keyed by receipt kind.');
  const unknown = Object.keys(parsed).filter((key) => !isReceiptKind(key));
  if (unknown.length > 0) {
    // Receipt kinds are fixed identifiers, so naming the unexpected key is safe only when it looks like one.
    const shown = unknown.map((key) => (/^[a-z][a-z0-9_]{0,40}$/.test(key) ? key : '?')).join(', ');
    throw new Error(`READINESS_RECEIPTS has unknown receipt kinds (${shown}); expected ${MANDATORY_RECEIPTS.join(', ')}.`);
  }
  return parsed as ReadinessReceipts;
}

const RECEIPT_KEYS = ['evidence_sha256', 'recorded_at', 'status', 'target', 'valid_until'];
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const CLOCK_SKEW_MS = 5 * 60_000;

/** The state of one mandatory receipt at `now`. */
export function receiptState(kind: ReceiptKind, entry: unknown, now: Date): ReceiptState {
  if (entry === undefined) return 'missing';
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return 'invalid';
  const value = entry as Record<string, unknown>;
  if (Object.keys(value).sort().join(',') !== RECEIPT_KEYS.join(',')) return 'invalid';
  const { status, recorded_at: recordedAt, valid_until: validUntil, target, evidence_sha256: evidence } = value;
  if (status !== 'passed' && status !== 'failed') return 'invalid';
  if (typeof recordedAt !== 'string' || typeof validUntil !== 'string' || !ISO_UTC.test(recordedAt) || !ISO_UTC.test(validUntil)) return 'invalid';
  if (typeof target !== 'string' || !RECEIPT_TARGETS[kind].includes(target)) return 'invalid';
  if (typeof evidence !== 'string' || !/^[0-9a-f]{64}$/.test(evidence)) return 'invalid';
  const recorded = Date.parse(recordedAt);
  const until = Date.parse(validUntil);
  if (!Number.isFinite(recorded) || !Number.isFinite(until) || until <= recorded) return 'invalid';
  if (recorded > now.getTime() + CLOCK_SKEW_MS) return 'invalid';
  if (until - recorded > RECEIPT_MAX_VALIDITY_DAYS * 86_400_000) return 'invalid';
  if (status === 'failed') return 'failed';
  return now.getTime() < until ? 'passed' : 'expired';
}

export type Readiness = { ready: boolean; checks: Record<string, string> };

const TIMEOUT = Symbol('timeout');

/**
 * `/live` is the process alone. `/ready` adds a bounded database round trip
 * and every mandatory receipt, and fails while the process drains. Results
 * are cached (`cacheMs`) and computed single-flight, so health probes cannot
 * drive database load. Failures carry only check names and states; driver
 * text is never logged or returned. A change of state logs one line.
 */
@Injectable()
export class HealthService {
  private readonly timeoutMs: number;
  private readonly cacheMs: number;
  private readonly now: () => Date;
  private readonly log: (entry: Record<string, unknown>) => void;
  private draining = false;
  private cached: { at: number; result: Readiness } | undefined;
  private inflight: Promise<Readiness> | undefined;
  private lastLogged: string | undefined;

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

  private async database(): Promise<'ok' | 'failed' | 'timeout'> {
    let timer: NodeJS.Timeout | undefined;
    try {
      const outcome = await Promise.race([
        this.pool.query('SELECT 1 AS ok').then(() => 'ok' as const),
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
