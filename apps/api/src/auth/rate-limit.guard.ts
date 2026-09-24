import { createHash, timingSafeEqual } from 'crypto';

import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import {
  isThenable,
  rateLimitStoreFor,
  type RateLimitConsumeResult,
  type RateLimitHitStore,
} from './rate-limit.store';

/**
 * Per-IP rate limiter. Default storage is in-memory per Nest application
 * (isolated in tests via the Reflector identity). Production installs
 * MongoRateLimitHitStore (#2068) so API replicas share one budget.
 *
 * Applied via `@RateLimit({ windowMs, max })` on a route; falls back to the
 * defaults below when the decorator is omitted.
 */

export const RATE_LIMIT_KEY = 'rate-limit:config';

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  /**
   * Optional explicit bucket key. When set, the guard keys the per-IP hit
   * map on this string instead of `req.route.path` — this is what lets two
   * distinct Express routes that both reach the same downstream resource
   * (e.g. two HTTP endpoints delegating to one paid external mint call)
   * share a single combined budget instead of each getting its own
   * independent bucket. Omit to keep the default per-route behavior; every
   * existing `@RateLimit({ windowMs, max })` caller is unaffected.
   */
  key?: string;
  /**
   * For a route whose preceding guard has authenticated `req.user.sub`, use
   * that stable principal for the normal budget while retaining a second
   * per-client ceiling. This prevents unrelated signed-in members behind one
   * edge/NAT from sharing the small principal budget without turning direct
   * origin access into an unbounded paid-API bypass.
   *
   * If the principal is unexpectedly absent, the guard fails safe to the
   * existing per-client `max` bucket.
   */
  authenticatedPrincipal?: {
    maxPerClient: number;
  };
}

const DEFAULTS: RateLimitOptions = { windowMs: 60_000, max: 20 };

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(private readonly reflector: Reflector) {}

  /**
   * Live lookup. Do not cache in the constructor: the Mongo store is
   * installed in RateLimitSharedModule.onModuleInit, after Nest has already
   * constructed every RateLimitGuard.
   */
  private store(): RateLimitHitStore {
    return rateLimitStoreFor(this.reflector);
  }

  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    // Local E2E only — never honor this bypass in production even if mis-set.
    if (
      process.env.NODE_ENV !== 'production' &&
      process.env.E2E_DISABLE_RATE_LIMIT === '1'
    ) {
      return true;
    }

    const req = context.switchToHttp().getRequest<{
      ip?: string;
      route?: { path?: string };
      headers?: Record<string, string | string[] | undefined>;
      socket?: { remoteAddress?: string };
      user?: { sub?: unknown };
    }>();

    const opts =
      this.reflector.get<RateLimitOptions>(
        RATE_LIMIT_KEY,
        context.getHandler(),
      ) ?? DEFAULTS;

    const header = (name: string): string | undefined => {
      const v = req.headers?.[name];
      return (Array.isArray(v) ? v[0] : v)?.toString();
    };
    // Two independent dimensions, composed: `opts.key` groups distinct Express
    // routes into one shared budget (see RateLimitOptions.key), while
    // `resolveClientKey` decides which client the budget belongs to.
    const routeKey = opts.key || req.route?.path || context.getHandler().name;
    const clientKey = this.resolveClientKey(req, header);
    // A collapsed client key means every direct-origin caller shares one bucket
    // (see resolveClientKey). Surfaced in the 429 `bucket` so a shared-budget
    // 429 is distinguishable from a genuine per-client one.
    const edgeUnverified = clientKey === 'edge-unverified';
    const clientKind = (base: string): string =>
      edgeUnverified ? `${base}:edge-unverified` : base;
    const now = Date.now();
    const principal = this.resolveAuthenticatedPrincipal(req);
    const configuredClientMax =
      opts.authenticatedPrincipal?.maxPerClient ?? Number.NaN;
    const principalConfigured =
      Number.isSafeInteger(configuredClientMax) && configuredClientMax > 0;
    const usesPrincipal = principal !== undefined && principalConfigured;
    const buckets = usesPrincipal
      ? [
          {
            key: `${routeKey}::principal:${this.hashPrincipal(principal)}`,
            max: opts.max,
            kind: 'principal',
          },
          {
            key: `${routeKey}::client:${clientKey}`,
            max: configuredClientMax,
            kind: clientKind('client'),
          },
        ]
      : [
          {
            key: `${routeKey}::${clientKey}`,
            max: opts.max,
            // A route that asked for a per-principal budget but got no principal
            // collapses all its authenticated members into this one client
            // bucket — the shared-budget failure mode. Name it `client-fallback`
            // so a 429 here says "the principal went missing", not "one client is
            // hot". Routes with no principal config keep the plain `client` kind.
            kind: clientKind(
              principalConfigured ? 'client-fallback' : 'client',
            ),
          },
        ];
    const reject = (blocked: {
      key: string;
      max: number;
      kind: string;
      recent: number[];
    }): never => {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil(((blocked.recent[0] ?? now) + opts.windowMs - now) / 1000),
      );
      this.logger.warn(
        `rate-limit hit ${blocked.key} (${blocked.recent.length}/${blocked.max}) bucket=${blocked.kind}`,
      );
      const res = context.switchToHttp().getResponse?.<{
        setHeader?: (name: string, value: string | number) => void;
      }>();
      res?.setHeader?.('Retry-After', retryAfterSeconds);
      throw new HttpException(
        {
          code: 'RATE_LIMITED',
          message:
            "You're making requests too quickly. Please wait a moment and try again.",
          retry_after_seconds: retryAfterSeconds,
          bucket: blocked.kind,
        },
        429,
      );
    };

    // Sequential tryConsume: a principal reject must not consume the client
    // ceiling. A client-ceiling reject can spend one principal slot.
    const store = this.store();
    const consumeBucket = (
      bucket: (typeof buckets)[number],
    ): true | Promise<true> => {
      const result = store.tryConsume(
        bucket.key,
        now,
        opts.windowMs,
        bucket.max,
      );
      const apply = (consumed: RateLimitConsumeResult): true => {
        if (!consumed.allowed) {
          reject({ ...bucket, recent: consumed.recent });
        }
        return true;
      };
      if (isThenable(result)) {
        return result.then(apply);
      }
      return apply(result);
    };

    const first = consumeBucket(buckets[0]);
    if (isThenable(first)) {
      return (async () => {
        await first;
        if (buckets.length === 1) return true;
        await consumeBucket(buckets[1]);
        return true;
      })();
    }
    if (buckets.length === 1) return true;
    const second = consumeBucket(buckets[1]);
    if (isThenable(second)) {
      return second.then(() => true);
    }
    return true;
  }

  private resolveAuthenticatedPrincipal(req: {
    user?: { sub?: unknown };
  }): string | undefined {
    const sub = req.user?.sub;
    if (typeof sub !== 'string') return undefined;
    const trimmed = sub.trim();
    return trimmed || undefined;
  }

  private hashPrincipal(principal: string): string {
    return createHash('sha256').update(principal).digest('hex').slice(0, 24);
  }

  /**
   * SECURITY (prod-readiness F10): derive the per-client bucket key in a way an
   * attacker cannot rotate to defeat the limiter.
   *
   * The origin is directly reachable (e.g. Railway `*.up.railway.app`), so a
   * caller who bypasses Cloudflare can forge `CF-Connecting-IP` / `X-Forwarded-For`
   * per request and land each guess in a distinct bucket — unbounded brute force
   * against `/admin/login`, OTP-send, etc. The socket peer is our own edge, not
   * the client, so it can't distinguish real client IPs either.
   *
   * Fix: only trust the client-IP headers when the request carries a shared
   * secret that Cloudflare injects at the edge (a CF Transform Rule adds
   * `<CF_EDGE_HEADER>: <CF_EDGE_SECRET>`; direct-to-origin callers can't know it):
   *  - secret present + valid  -> trust `cf-connecting-ip` (real client, per-IP bucket)
   *  - secret set but missing/wrong -> request bypassed the edge: pin ALL such
   *    traffic to ONE shared bucket per route so it can't be spread out.
   *  - secret NOT configured -> preserve the prior behavior (backward compatible)
   *    and warn in production, since the CF Transform Rule is an infra step.
   */
  private resolveClientKey(
    req: {
      ip?: string;
      headers?: Record<string, string | string[] | undefined>;
      socket?: { remoteAddress?: string };
    },
    header: (name: string) => string | undefined,
  ): string {
    const cfIp = header('cf-connecting-ip')?.trim();
    const fwd = header('x-forwarded-for')?.split(',')[0]?.trim();
    const clientIp = cfIp || fwd || req.ip || req.socket?.remoteAddress;

    const edgeSecret = process.env.CF_EDGE_SECRET?.trim();
    if (!edgeSecret) {
      // Not yet locked to the edge (infra TODO). Preserve prior behavior.
      if (process.env.NODE_ENV === 'production') {
        this.logger.warn(
          'CF_EDGE_SECRET not set: rate-limit client IP is header-derived and ' +
            'spoofable unless the origin is locked to Cloudflare. Set CF_EDGE_SECRET ' +
            'and add a Cloudflare Transform Rule injecting it.',
        );
      }
      return clientIp || 'unknown';
    }

    const headerName = process.env.CF_EDGE_HEADER?.trim() || 'x-edge-auth';
    const presented = header(headerName)?.trim();
    if (presented && this.secretsMatch(presented, edgeSecret)) {
      // Proven to have transited our Cloudflare edge: the client IP is trusted.
      return clientIp || 'unknown';
    }

    // Bypassed the edge (or forged headers): cannot trust any client IP. Pin all
    // such traffic to a single per-route bucket so it can't be rotated apart.
    return 'edge-unverified';
  }

  private secretsMatch(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) {
      return false;
    }
    return timingSafeEqual(bufA, bufB);
  }
}
