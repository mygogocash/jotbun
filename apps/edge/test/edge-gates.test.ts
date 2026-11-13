// The edge's gates (P3-T3, H17): the API's FeatureGates with `ai` beside it.
// Pure Node: no Worker, no vault.
import { describe, expect, it } from 'vitest'

import { ProblemException } from '@api/common/api-problem.filter'
import { FeatureGates, GATE_SCOPES } from '@api/common/feature-gates'

import { EDGE_GATE_SCOPES, EdgeGates } from '../src/v1/gates'
import type { EdgeGateScope } from '../src/v1/gates'

/** Builds gates inside an assertion, so a constructor that throws fails as one. */
function gatesOf(config?: ConstructorParameters<typeof EdgeGates>[0]): EdgeGates {
  let made: EdgeGates | null = null
  expect(() => {
    made = new EdgeGates(config)
  }).not.toThrow()
  return made as unknown as EdgeGates
}

type Refusal = { status: number; code: string; retryAfterSeconds?: number; messageKey?: string }

/** What assertOpen threw, as plain data, or null when it threw nothing. */
function refusalOf(open: () => void): Refusal | null {
  try {
    open()
    return null
  } catch (error) {
    expect(error).toBeInstanceOf(ProblemException)
    const problem = error as ProblemException
    return { status: problem.getStatus(), code: problem.code, ...problem.problem }
  }
}

describe('EdgeGates', () => {
  it('ai is paused on its own and answers AI_PAUSED with its retry', () => {
    const gates = gatesOf({ paused: ['ai'], retryAfterSeconds: 120 })
    expect(gates.isPaused('ai')).toBe(true)
    expect(refusalOf(() => gates.assertOpen('ai'))).toEqual({ status: 503, code: 'AI_PAUSED', retryAfterSeconds: 120, messageKey: 'errors.ai_paused' })
    for (const scope of GATE_SCOPES) {
      expect(gates.isPaused(scope), scope).toBe(false)
      expect(refusalOf(() => gates.assertOpen(scope)), scope).toBeNull()
    }
    // The API's five paused leave ai open, and gates with nothing paused leave it open too.
    const api = gatesOf({ paused: [...GATE_SCOPES] })
    expect(api.isPaused('ai')).toBe(false)
    expect(refusalOf(() => api.assertOpen('ai'))).toBeNull()
    expect(gatesOf().isPaused('ai')).toBe(false)
  })

  it('an EdgeGates is a FeatureGates', () => {
    const gates = gatesOf({ paused: ['imports', 'ai'] })
    expect(gates).toBeInstanceOf(FeatureGates)
    // Typed as the API's gates, as 1B-T3 and 1B-T4 take them (typecheck:edge checks the assignment).
    const api: FeatureGates = gates
    expect(api.isPaused('imports')).toBe(true)
    // claimableKinds answers as the API's: import_parse waits for imports, and ai holds no job.
    expect(gates.claimableKinds(['import_parse', 'export'])).toEqual(new FeatureGates({ paused: ['imports'] }).claimableKinds(['import_parse', 'export']))
    expect(gates.claimableKinds(['import_parse', 'export'])).toEqual(['export'])
    expect(gatesOf({ paused: ['ai'] }).claimableKinds(['import_parse'])).toEqual(['import_parse'])
    expect(gatesOf({ paused: ['jobs', 'ai'] }).claimableKinds(['import_parse'])).toEqual([])
  })

  it("pausedEdgeScopes lists ai after the API's scopes", () => {
    const gates = gatesOf({ paused: ['ai', 'jobs', 'writes'] })
    expect(gates.pausedEdgeScopes()).toEqual(['writes', 'jobs', 'ai'])
    // pausedScopes() is still the API's list, in the API's order.
    expect(gates.pausedScopes()).toEqual(['writes', 'jobs'])
    expect(gatesOf({ paused: ['jobs'] }).pausedEdgeScopes()).toEqual(['jobs'])
    expect(gatesOf({ paused: ['ai'] }).pausedEdgeScopes()).toEqual(['ai'])
    expect(EDGE_GATE_SCOPES).toEqual(['writes', 'imports', 'ocr', 'uploads', 'jobs', 'ai'])
  })

  it('an unreleased scope is 404 before any pause, and ai is always exposed', () => {
    const gates = gatesOf({ paused: ['ai', 'uploads'], unexposed: ['uploads'] })
    expect(gates.isExposed('ai')).toBe(true)
    expect(gates.isExposed('uploads')).toBe(false)
    expect(refusalOf(() => gates.assertOpen('ai', 'uploads'))).toEqual({ status: 404, code: 'NOT_FOUND' })
    expect(refusalOf(() => gates.assertOpen('ai'))).toEqual({ status: 503, code: 'AI_PAUSED', retryAfterSeconds: 300, messageKey: 'errors.ai_paused' })
  })

  it("the first paused scope in the order given answers, and the API's scopes keep their own codes", () => {
    const gates = gatesOf({ paused: ['writes', 'ai'], retryAfterSeconds: 60 })
    expect(refusalOf(() => gates.assertOpen('ai', 'writes'))).toEqual({ status: 503, code: 'AI_PAUSED', retryAfterSeconds: 60, messageKey: 'errors.ai_paused' })
    expect(refusalOf(() => gates.assertOpen('writes', 'ai'))).toEqual({ status: 503, code: 'WRITES_PAUSED', retryAfterSeconds: 60, messageKey: 'errors.writes_paused' })
    expect(refusalOf(() => gates.assertOpen('imports', 'ai'))).toEqual({ status: 503, code: 'AI_PAUSED', retryAfterSeconds: 60, messageKey: 'errors.ai_paused' })
    expect(refusalOf(() => gates.assertOpen('imports'))).toBeNull()
    expect(refusalOf(() => gates.assertOpen())).toBeNull()
  })

  it('an unknown scope is still refused, as FeatureGates refuses it', () => {
    expect(() => new EdgeGates({ paused: ['ai', 'nope' as EdgeGateScope] })).toThrow(RangeError)
  })
})
