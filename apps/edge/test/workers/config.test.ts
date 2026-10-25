import { ProblemException } from '@api/common/api-problem.filter'
import { GATE_SCOPES } from '@api/common/feature-gates'
import { expect, it } from 'vitest'

import { readEdgeConfig } from '../../src/v1/config'
import type { V1Env } from '../../src/v1/env'
import { TEST_POLICIES, startV1 } from './support/v1-client'

it('an unreadable or malformed config pauses every gate scope, with a retry', async () => {
  for (const kv of [{ get: async () => { throw new Error('kv down') } }, { get: async () => ({ gates: 'nope' }) }]) {
    const config = await readEdgeConfig(kv as unknown as KVNamespace, {} as V1Env)
    for (const scope of GATE_SCOPES) expect(() => config.gates.assertOpen(scope)).toThrow(ProblemException)
    expect(config.policies).toBeNull()
  }
})

it('an absent config leaves gates open and policies unpublished', async () => {
  const config = await readEdgeConfig({ get: async () => null } as unknown as KVNamespace, { MIN_CLIENT_VERSION_IOS: '1.0.0', MIN_CLIENT_VERSION_ANDROID: '1.0.0' } as V1Env)
  expect(() => config.gates.assertOpen('writes')).not.toThrow()
  expect(config.policies).toBeNull()
})

it('client minimums missing from both config and env answer 503 with a retry, never 426', async () => {
  const config = await readEdgeConfig({ get: async () => null } as unknown as KVNamespace, {} as V1Env)
  try {
    config.clientVersions.check('bound_session', {} as never)
    expect.unreachable()
  } catch (e) {
    expect(e).toBeInstanceOf(ProblemException)
    expect((e as ProblemException).getStatus()).toBe(503)
    expect((e as ProblemException).problem.retryAfterSeconds).toBe(30)
  }
  expect(() => config.clientVersions.check('public', {} as never)).not.toThrow()
})

it('GET /v1/policies answers the published policies from KV', async () => {
  const res = await (await startV1()).raw(new Request('http://vault.test/v1/policies'))
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual(TEST_POLICIES)
})
