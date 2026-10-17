import { Global, Module, SetMetadata } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { ApiErrorCode } from '@gogospend/contracts';

import { ProblemException } from './api-problem.filter';

/**
 * Operational gates (P6b). Each scope can be paused on its own, without a
 * deploy of new code, by restarting the process with `OPERATIONAL_PAUSE` set:
 *
 * - `writes`:  business mutations (wallets, categories, records, budgets,
 *              identity linking) - every route that commits through M1's
 *              command executor except privacy and security operations;
 * - `imports`: starting an import (`POST /v1/imports`) and the worker's
 *              import parsing (`import_parse`); P3 confirmation joins it;
 * - `ocr`:     image imports: image uploads are refused at the door, and
 *              image parsing (P2b) must not start;
 * - `uploads`: accepting file bytes into quarantine (`POST /v1/imports`);
 * - `jobs`:    requests that only queue background work (exports, snapshot
 *              builds), and every worker's claim loop (job, security and
 *              deletion workers). Maintenance passes, alert reports and
 *              running jobs carry on.
 *
 * A paused scope answers `503` with an `ApiProblem` (`WRITES_PAUSED`, …),
 * `retry_after_seconds` and `Retry-After`, before authentication and before
 * any database work, so nothing is reserved and the same request (same
 * Idempotency-Key and body) can be resent later. Sign-in, sign-out, global
 * logout, account deletion, policy acceptance and every read stay available.
 *
 * Some scopes are also release features that are not exposed until enabled
 * (`uploads`: `IMPORT_UPLOADS_ENABLED`). An unexposed feature answers `404`
 * even while paused, so a pause never reveals an unreleased route.
 *
 * For P2b/P3: put `@Gated('imports')` (and `'writes'` for confirmation,
 * which writes records) on each new mutating route; call
 * `gates.assertOpen('ocr')` (inject `FEATURE_GATES`) where a request would
 * start image work; list a new job kind that needs more than `jobs` in
 * `JOB_KIND_GATES` (an image-parsing kind would be `['imports', 'ocr']`, so
 * a paused OCR gate leaves those jobs queued without spending attempts).
 * `operational-safety.spec.ts` fails until a new mutating route is either
 * gated or listed as deliberately exempt.
 */
export const GATE_SCOPES = ['writes', 'imports', 'ocr', 'uploads', 'jobs'] as const;
export type GateScope = (typeof GATE_SCOPES)[number];

export const GATE_PROBLEM_CODES: Readonly<Record<GateScope, ApiErrorCode>> = {
  writes: 'WRITES_PAUSED',
  imports: 'IMPORTS_PAUSED',
  ocr: 'OCR_PAUSED',
  uploads: 'UPLOADS_PAUSED',
  jobs: 'JOBS_PAUSED',
};

/** Release flags: a scope listed here is hidden (404) until its flag is on. */
export const RELEASE_FLAGS: Readonly<Partial<Record<GateScope, string>>> = {
  uploads: 'IMPORT_UPLOADS_ENABLED',
};

export const GATE_METADATA = 'gogospend:route-gates';

/** The gates that can pause a route (all of them must be open). */
export const Gated = (...scopes: GateScope[]): MethodDecorator & ClassDecorator => SetMetadata(GATE_METADATA, scopes);

export function routeGatesOf(reflector: Reflector, context: ExecutionContext): GateScope[] {
  return reflector.getAllAndOverride<GateScope[] | undefined>(GATE_METADATA, [context.getHandler(), context.getClass()]) ?? [];
}

/**
 * Job kinds that need more than the `jobs` gate open before a worker claims
 * them. Every kind needs `jobs`. Cleanup and expiry kinds (`import_expire`)
 * are deliberately absent: privacy deadlines hold during an import pause.
 */
export const JOB_KIND_GATES: Readonly<Record<string, readonly GateScope[]>> = {
  import_parse: ['imports'],
};

export type FeatureGateConfig = { paused?: readonly GateScope[]; unexposed?: readonly GateScope[]; retryAfterSeconds?: number };

const DEFAULT_RETRY_AFTER_SECONDS = 300;

function isScope(value: string): value is GateScope {
  return (GATE_SCOPES as readonly string[]).includes(value);
}

export class FeatureGates {
  private readonly paused: ReadonlySet<GateScope>;
  private readonly unexposed: ReadonlySet<GateScope>;
  readonly retryAfterSeconds: number;

  constructor(config: FeatureGateConfig = {}) {
    for (const scope of [...(config.paused ?? []), ...(config.unexposed ?? [])]) {
      if (!isScope(scope)) throw new RangeError(`unknown gate scope ${String(scope)}`);
    }
    this.paused = new Set(config.paused ?? []);
    this.unexposed = new Set(config.unexposed ?? []);
    this.retryAfterSeconds = config.retryAfterSeconds ?? DEFAULT_RETRY_AFTER_SECONDS;
  }

  isPaused(scope: GateScope): boolean {
    return this.paused.has(scope);
  }

  isExposed(scope: GateScope): boolean {
    return !this.unexposed.has(scope);
  }

  pausedScopes(): GateScope[] {
    return GATE_SCOPES.filter((scope) => this.paused.has(scope));
  }

  /**
   * Throws `404 NOT_FOUND` when any scope is an unreleased feature, else a
   * `503` problem for the first paused scope in the order given.
   */
  assertOpen(...scopes: GateScope[]): void {
    if (scopes.some((scope) => !this.isExposed(scope))) throw new ProblemException(404, 'NOT_FOUND');
    const paused = scopes.find((scope) => this.isPaused(scope));
    if (paused) {
      throw new ProblemException(503, GATE_PROBLEM_CODES[paused], {
        retryAfterSeconds: this.retryAfterSeconds,
        messageKey: `errors.${paused}_paused`,
      });
    }
  }

  /** The kinds a worker may claim now: none while `jobs` is paused, else those whose JOB_KIND_GATES are open. */
  claimableKinds<K extends string>(kinds: readonly K[]): K[] {
    if (this.isPaused('jobs')) return [];
    return kinds.filter((kind) => !(JOB_KIND_GATES[kind] ?? []).some((scope) => this.isPaused(scope)));
  }
}

/** A release flag: off unless `1`/`true`; any value other than `0`/`false`/empty stops startup. */
export function releaseFlagFromEnv(env: NodeJS.ProcessEnv, name: string): boolean {
  const value = env[name];
  if (value === undefined || value === '' || value === '0' || value === 'false') return false;
  if (value === '1' || value === 'true') return true;
  throw new Error(`${name} must be 1/true or 0/false (off by default).`);
}

/**
 * `OPERATIONAL_PAUSE`: comma-separated scopes to pause (empty: none). An
 * unknown scope stops startup rather than silently pausing nothing.
 * `OPERATIONAL_PAUSE_RETRY_AFTER_SECONDS`: 30-3600 (default 300).
 */
export function featureGatesFromEnv(env: NodeJS.ProcessEnv): FeatureGates {
  const names = (env.OPERATIONAL_PAUSE ?? '').split(',').map((name) => name.trim()).filter(Boolean);
  const unknown = names.filter((name) => !isScope(name));
  if (unknown.length > 0) throw new Error(`OPERATIONAL_PAUSE may list only ${GATE_SCOPES.join(', ')}.`);
  const retryRaw = env.OPERATIONAL_PAUSE_RETRY_AFTER_SECONDS;
  const retryAfterSeconds = retryRaw === undefined || retryRaw === '' ? DEFAULT_RETRY_AFTER_SECONDS : Number(retryRaw);
  if (!Number.isInteger(retryAfterSeconds) || retryAfterSeconds < 30 || retryAfterSeconds > 3600) {
    throw new Error('OPERATIONAL_PAUSE_RETRY_AFTER_SECONDS must be 30-3600.');
  }
  const unexposed = (Object.entries(RELEASE_FLAGS) as [GateScope, string][]).filter(([, flag]) => !releaseFlagFromEnv(env, flag)).map(([scope]) => scope);
  return new FeatureGates({ paused: names as GateScope[], unexposed, retryAfterSeconds });
}

export const FEATURE_GATES = Symbol('FEATURE_GATES');

/** One FeatureGates per process, read from the environment at startup. */
@Global()
@Module({
  providers: [{ provide: FEATURE_GATES, useFactory: () => featureGatesFromEnv(process.env) }],
  exports: [FEATURE_GATES],
})
export class FeatureGatesModule {}
