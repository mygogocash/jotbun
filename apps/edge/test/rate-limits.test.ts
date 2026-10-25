import { ProblemException } from '@api/common/api-problem.filter'
import { expect, it } from 'vitest'

import { RateBuckets } from '../src/vault/rate-limits'

it('the 361st request from one person in a minute is 429 RATE_LIMITED with a retry, and the next window opens', () => {
  let now = 1_000_000
  const buckets = new RateBuckets(() => now)
  for (let i = 0; i < 360; i++) buckets.charge('principal', 'a')
  try { buckets.charge('principal', 'a'); expect.unreachable() } catch (e) {
    expect(e).toBeInstanceOf(ProblemException)
    expect((e as ProblemException).getStatus()).toBe(429)
    expect((e as ProblemException).problem.retryAfterSeconds).toBeGreaterThan(0)
  }
  now += 60_000
  expect(() => buckets.charge('principal', 'a')).not.toThrow()
})
