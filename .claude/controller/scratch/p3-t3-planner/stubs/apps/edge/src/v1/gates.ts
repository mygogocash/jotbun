// RED stub (P3-T3): the plan's interface; EdgeGates ignores ai.
import { FeatureGates, GATE_SCOPES } from '@api/common/feature-gates'
import type { GateScope } from '@api/common/feature-gates'

import type { WorkerRouteId } from './protocol'

export const EDGE_GATE_SCOPES = [...GATE_SCOPES, 'ai'] as const
export type EdgeGateScope = (typeof EDGE_GATE_SCOPES)[number]

export class EdgeGates extends FeatureGates {
  constructor(config: { paused?: readonly EdgeGateScope[]; unexposed?: readonly GateScope[]; retryAfterSeconds?: number } = {}) {
    super({ ...config, paused: config.paused?.filter((scope): scope is GateScope => scope !== 'ai') })
  }

  override isPaused(scope: EdgeGateScope): boolean {
    return scope === 'ai' ? false : super.isPaused(scope)
  }

  override isExposed(scope: EdgeGateScope): boolean {
    return scope === 'ai' || super.isExposed(scope)
  }

  override assertOpen(...scopes: EdgeGateScope[]): void {
    super.assertOpen(...scopes.filter((scope): scope is GateScope => scope !== 'ai'))
  }

  pausedEdgeScopes(): EdgeGateScope[] {
    return this.pausedScopes()
  }
}

export const MODEL_ROUTE_WORKERS: readonly WorkerRouteId[] = ['ai.parse', 'ai.slip', 'ai.note', 'ai.ask']
