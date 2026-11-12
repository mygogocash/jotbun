// RED stub (1D-T11): the vault half's interface, with no behaviour yet.
import type { ServerEvent } from '../analytics/server-analytics'
import type { VaultAnalytics, VaultRouteId } from '../v1/protocol'
import type { VaultContext } from './context'

export type AnalyticsConsent = VaultAnalytics['consent']

export const MAX_WEEKS_SINCE_SIGNUP = 1040

export function analyticsConsent(_c: VaultContext): AnalyticsConsent {
  return 'unasked'
}

export function weeksSinceSignup(_c: VaultContext): number {
  return 0
}

export function committedEvents(_c: VaultContext, _route: VaultRouteId, _before: string, _after: string): ServerEvent[] {
  return []
}

export function analyticsAfterCall(_c: VaultContext, _route: VaultRouteId, _before: string, failure: string | null): VaultAnalytics {
  return { consent: 'unasked', events: [], failure }
}
