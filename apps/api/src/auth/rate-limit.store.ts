/**
 * #2068 — rate-limit hit storage.
 *
 * The in-memory map is one Nest process. A second API replica gets a second
 * map and therefore a second budget. Implementations of this interface share
 * one budget; MemoryRateLimitHitStore can be constructed over a shared Map
 * to prove that, and MongoRateLimitHitStore is what production uses.
 *
 * Guards must call `rateLimitStoreFor` per request, not cache the result in
 * the constructor: RateLimitSharedModule installs the Mongo store in
 * `onModuleInit`, after Nest has already constructed every RateLimitGuard.
 *
 * `tryConsume` is the only mutation the guard uses. It must be atomic for
 * the (key, window) pair: a concurrent caller either increments the count
 * or is denied. Last-write-wins `$set` of a peeked array is not enough.
 */

export const RATE_LIMIT_MAX_TRACKED_WINDOW_MS = 60 * 60_000;

export type RateLimitConsumeResult = {
  allowed: boolean;
  recent: number[];
};

export interface RateLimitHitStore {
  tryConsume(
    key: string,
    now: number,
    windowMs: number,
    max: number,
  ): RateLimitConsumeResult | Promise<RateLimitConsumeResult>;
}

export function isThenable<T>(value: T | Promise<T>): value is Promise<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}

const MEMORY_BY_REFLECTOR = new WeakMap<object, MemoryRateLimitHitStore>();

let processStore: RateLimitHitStore | undefined;

export function setSharedRateLimitStore(
  store: RateLimitHitStore | undefined,
): void {
  processStore = store;
}

export function rateLimitStoreFor(reflector: object): RateLimitHitStore {
  if (processStore) return processStore;
  const existing = MEMORY_BY_REFLECTOR.get(reflector);
  if (existing) return existing;
  const created = new MemoryRateLimitHitStore();
  MEMORY_BY_REFLECTOR.set(reflector, created);
  return created;
}

export class MemoryRateLimitHitStore implements RateLimitHitStore {
  constructor(private readonly hits = new Map<string, number[]>()) {}

  peek(key: string, now: number, windowMs: number): number[] {
    const cutoff = now - windowMs;
    return (this.hits.get(key) ?? []).filter((ts) => ts > cutoff);
  }

  tryConsume(
    key: string,
    now: number,
    windowMs: number,
    max: number,
  ): RateLimitConsumeResult {
    const recent = this.peek(key, now, windowMs);
    if (recent.length >= max) {
      return { allowed: false, recent };
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 10_000) {
      const pruneCutoff = now - RATE_LIMIT_MAX_TRACKED_WINDOW_MS;
      for (const [k, arr] of this.hits.entries()) {
        const lastHit = arr[arr.length - 1];
        if (lastHit !== undefined && lastHit < pruneCutoff) {
          this.hits.delete(k);
        }
      }
    }
    return { allowed: true, recent };
  }
}
