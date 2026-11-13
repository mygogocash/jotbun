// The edge's gate scopes (P3-T3, H17): the API's five, and `ai`, which pauses
// every route that calls a model with 503 AI_PAUSED (§4, C12). The API's
// FeatureGates is used as it is, so apps/api is not edited, and an EdgeGates
// passes wherever 1B takes a FeatureGates (the parse consumer, pending work).
import type { ApiErrorCode } from '@gogospend/contracts'

import { ProblemException } from '@api/common/api-problem.filter'
import { FeatureGates, GATE_PROBLEM_CODES, GATE_SCOPES } from '@api/common/feature-gates'
import type { GateScope } from '@api/common/feature-gates'

import type { WorkerRouteId } from './protocol'

/** The scopes config:v1 may pause: the API's, then ai. */
export const EDGE_GATE_SCOPES = [...GATE_SCOPES, 'ai'] as const
export type EdgeGateScope = (typeof EDGE_GATE_SCOPES)[number]

/** Each scope's 503 code: the API's own, and AI_PAUSED for ai. */
const PAUSED_CODES: Readonly<Record<EdgeGateScope, ApiErrorCode>> = { ...GATE_PROBLEM_CODES, ai: 'AI_PAUSED' }

/**
 * The API's gates with `ai` beside them. The API's scopes go to FeatureGates,
 * which still refuses an unknown one; `ai` is kept here. `ai` is never an
 * unreleased feature. pausedScopes() stays the API's list (a wider return
 * type would stop an EdgeGates being a FeatureGates); pausedEdgeScopes() adds ai.
 */
export class EdgeGates extends FeatureGates {
  private readonly aiPaused: boolean

  constructor(config: { paused?: readonly EdgeGateScope[]; unexposed?: readonly GateScope[]; retryAfterSeconds?: number } = {}) {
    super({ ...config, paused: config.paused?.filter((scope): scope is GateScope => scope !== 'ai') })
    this.aiPaused = config.paused?.includes('ai') ?? false
  }

  override isPaused(scope: EdgeGateScope): boolean {
    return scope === 'ai' ? this.aiPaused : super.isPaused(scope)
  }

  override isExposed(scope: EdgeGateScope): boolean {
    return scope === 'ai' || super.isExposed(scope)
  }

  /** 404 when any scope is an unreleased feature, else 503 for the first paused scope in the order given (AI_PAUSED for ai). */
  override assertOpen(...scopes: EdgeGateScope[]): void {
    if (scopes.some((scope) => !this.isExposed(scope))) throw new ProblemException(404, 'NOT_FOUND')
    const paused = scopes.find((scope) => this.isPaused(scope))
    if (paused) throw new ProblemException(503, PAUSED_CODES[paused], { retryAfterSeconds: this.retryAfterSeconds, messageKey: `errors.${paused}_paused` })
  }

  /** pausedScopes() in their order, then ai when it is paused. */
  pausedEdgeScopes(): EdgeGateScope[] {
    return this.aiPaused ? [...this.pausedScopes(), 'ai'] : this.pausedScopes()
  }
}

/** The Worker routes that call a model. Each carries the `ai` gate (route-coverage.test.ts); P4 adds its slips route. */
export const MODEL_ROUTE_WORKERS: readonly WorkerRouteId[] = ['ai.parse', 'ai.slip', 'ai.note', 'ai.ask']
