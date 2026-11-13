import { ProblemException } from '@api/common/api-problem.filter'
import { GATE_SCOPES } from '@api/common/feature-gates'
import { expect, it } from 'vitest'

import { readEdgeConfig } from '../../src/v1/config'
import type { EdgeConfig } from '../../src/v1/config'
import type { V1Env } from '../../src/v1/env'
import { EDGE_GATE_SCOPES } from '../../src/v1/gates'
import { TEST_POLICIES, startV1 } from './support/v1-client'

/** readEdgeConfig's answer for what KV holds. It never throws, so a throw fails here as an assertion. */
async function configFor(stored: () => Promise<unknown>): Promise<EdgeConfig> {
  const read = await readEdgeConfig({ get: stored } as unknown as KVNamespace, {} as V1Env).then(
    (config) => ({ config }),
    (error: unknown) => ({ error: String(error) }),
  )
  expect(read).not.toHaveProperty('error')
  return (read as { config: EdgeConfig }).config
}

/** What assertOpen threw, as plain data, or null when it threw nothing. */
function refusalOf(open: () => void): { status: number; code: string; retryAfterSeconds?: number; messageKey?: string } | null {
  try {
    open()
    return null
  } catch (e) {
    expect(e).toBeInstanceOf(ProblemException)
    return { status: (e as ProblemException).getStatus(), code: (e as ProblemException).code, ...(e as ProblemException).problem }
  }
}

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

it('a config whose published_at is not a date is malformed', async () => {
  const policy = { ...TEST_POLICIES[0], published_at: 'not a date' }
  const config = await readEdgeConfig({ get: async () => ({ policies: [policy] }) } as unknown as KVNamespace, {} as V1Env)
  for (const scope of GATE_SCOPES) expect(() => config.gates.assertOpen(scope)).toThrow(ProblemException)
  expect(config.policies).toBeNull()
})

it('uploads stay unexposed unless IMPORT_UPLOADS_ENABLED is 1 or true, on the fail-closed path too', async () => {
  const absent = { get: async () => null } as unknown as KVNamespace
  for (const [value, exposed] of [
    [undefined, false],
    ['false', false],
    ['yes', false],
    ['1', true],
    ['true', true],
  ] as const) {
    const config = await readEdgeConfig(absent, { IMPORT_UPLOADS_ENABLED: value })
    expect(config.gates.isExposed('uploads'), String(value)).toBe(exposed)
  }
  const down = { get: async () => { throw new Error('kv down') } } as unknown as KVNamespace
  expect((await readEdgeConfig(down, {})).gates.isExposed('uploads')).toBe(false)
  const opened = await readEdgeConfig(down, { IMPORT_UPLOADS_ENABLED: 'true' })
  expect(opened.gates.isExposed('uploads')).toBe(true)
  try {
    opened.gates.assertOpen('uploads')
    expect.unreachable()
  } catch (e) {
    expect((e as ProblemException).getStatus()).toBe(503)
  }
})

it('GET /v1/policies answers the published policies from KV', async () => {
  const res = await (await startV1()).raw(new Request('http://vault.test/v1/policies'))
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual(TEST_POLICIES)
})

// The ai gate (P3-T3): config:v1 may pause `ai`, and a config that fails closed pauses it too.
it('a config that pauses ai is read, not malformed', async () => {
  const config = await configFor(async () => ({ gates: { paused: ['ai'] }, policies: TEST_POLICIES }))
  expect(config.gates.isPaused('ai')).toBe(true)
  expect(config.gates.pausedScopes()).toEqual([])
  expect(refusalOf(() => config.gates.assertOpen('writes'))).toBeNull()
  expect(config.policies).toEqual(TEST_POLICIES)
})

it('an unreadable or malformed config pauses ai too', async () => {
  const stored = [
    async () => {
      throw new Error('kv down')
    },
    async () => ({ gates: 'nope' }),
  ]
  for (const read of stored) {
    const config = await configFor(read)
    expect(config.gates.isPaused('ai')).toBe(true)
    expect(config.gates.pausedEdgeScopes()).toEqual([...EDGE_GATE_SCOPES])
    expect(refusalOf(() => config.gates.assertOpen('ai'))).toEqual({ status: 503, code: 'AI_PAUSED', retryAfterSeconds: 30, messageKey: 'errors.ai_paused' })
  }
})

it('an unknown scope still fails the config closed', async () => {
  const config = await configFor(async () => ({ gates: { paused: ['ai', 'nope'] }, policies: TEST_POLICIES }))
  expect(config.gates.pausedEdgeScopes()).toEqual([...EDGE_GATE_SCOPES])
  expect(config.gates.retryAfterSeconds).toBe(30)
  expect(config.policies).toBeNull()
})
