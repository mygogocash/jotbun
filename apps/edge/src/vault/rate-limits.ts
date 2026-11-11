import { ProblemException } from '@api/common/api-problem.filter'
import { RATE_BUDGETS } from '@api/common/shared-rate-limit'

const WINDOW_MS = 60_000

/**
 * The API's per-minute budgets, counted in the vault's memory (P4). Every
 * request for a person reaches that person's vault, so its counts see all of
 * that person's traffic. Each window is fixed, and eviction resets the counts,
 * which happens only after the vault has been idle.
 */
export class RateBuckets {
  private readonly windows = new Map<string, { window: number; hits: number }>()

  constructor(private readonly now: () => number) {}

  /** Counts one request against a budget and key; the request past the limit is 429 RATE_LIMITED. */
  charge(budget: 'principal' | 'read' | 'write', key: string): void {
    const at = this.now()
    const window = Math.floor(at / WINDOW_MS)
    const bucket = `${budget}\u0000${key}`
    const previous = this.windows.get(bucket)
    const hits = previous && previous.window === window ? previous.hits + 1 : 1
    this.windows.set(bucket, { window, hits })
    if (hits > RATE_BUDGETS[budget]) {
      const retryAfterSeconds = Math.max(1, Math.ceil(((window + 1) * WINDOW_MS - at) / 1000))
      throw new ProblemException(429, 'RATE_LIMITED', { retryAfterSeconds })
    }
  }
}
