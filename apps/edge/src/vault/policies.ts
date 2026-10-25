import { ContractValidationError, POLICY_KINDS } from '@gogospend/contracts'
import type { MeDto, PolicyKind, PrivacyPreferences } from '@gogospend/contracts'

import { ProblemException } from '@api/common/api-problem.filter'

import type { VaultContext } from './context'

/**
 * Published policies and this account's consents, on the vault's consents table
 * and the policy versions in the call (PolicyService in apps/api).
 */

type PolicyState = 'accepted' | 'pending' | 'unpublished'

/** Whether the account has accepted this kind's version or any later one. */
function accepted(c: VaultContext, kind: PolicyKind, version: number): boolean {
  return c.sql.exec('SELECT 1 FROM consents WHERE kind = ? AND version >= ? AND granted = 1 LIMIT 1', kind, version).toArray().length > 0
}

/**
 * Each kind whose newest required version this account has not accepted, with
 * the kind's latest published version to present. Accepting that version or a
 * later one satisfies it, so a non-required revision never blocks.
 */
export function pendingPolicies(c: VaultContext): { kind: PolicyKind; version: number }[] {
  const published = c.policies ?? []
  const pending: { kind: PolicyKind; version: number }[] = []
  for (const kind of [...POLICY_KINDS].sort()) {
    const versions = published.filter((policy) => policy.kind === kind)
    const required = versions.filter((policy) => policy.required).map((policy) => policy.version)
    if (required.length === 0) continue
    if (accepted(c, kind, Math.max(...required))) continue
    pending.push({ kind, version: Math.max(...versions.map((policy) => policy.version)) })
  }
  return pending
}

/**
 * Required terms and a privacy policy must both be published. Until they are,
 * the state is `unpublished`: missing configuration is never implicit acceptance.
 */
function stateOf(c: VaultContext): PolicyState {
  const published = c.policies ?? []
  const configured = published.some((policy) => policy.kind === 'terms' && policy.required) && published.some((policy) => policy.kind === 'privacy')
  if (!configured) return 'unpublished'
  return pendingPolicies(c).length === 0 ? 'accepted' : 'pending'
}

/** A current_policy call needs every required policy accepted. Unpublished is 503, pending is 403 (assertPolicyAccepted). */
export function assertPolicyAccepted(c: VaultContext): void {
  const state = stateOf(c)
  if (state === 'unpublished') throw new ProblemException(503, 'SERVICE_UNAVAILABLE', { messageKey: 'errors.policy_unpublished' })
  if (state === 'pending') throw new ProblemException(403, 'POLICY_ACCEPTANCE_REQUIRED')
}

/** Records acceptance of a published version. Repeating it changes nothing. */
export function acceptPolicy(c: VaultContext, kind: unknown, version: unknown): void {
  if (!POLICY_KINDS.includes(kind as PolicyKind)) throw new ContractValidationError('VALIDATION_FAILED', 'Unknown policy kind.', 'kind')
  if (!Number.isSafeInteger(version) || (version as number) < 1) throw new ContractValidationError('VALIDATION_FAILED', 'Invalid policy version.', 'version')
  if (!(c.policies ?? []).some((policy) => policy.kind === kind && policy.version === version)) {
    throw new ContractValidationError('VALIDATION_FAILED', 'That policy version is not published.', 'version')
  }
  c.sql.exec('INSERT INTO consents (kind, version, granted, updated_at) VALUES (?, ?, 1, ?) ON CONFLICT (kind, version) DO NOTHING', kind, version, c.now.toISOString())
}

/** Optional analytics, off unless the account turned it on. */
export function privacyOf(c: VaultContext): PrivacyPreferences {
  const [row] = c.sql.exec<{ granted: number }>("SELECT granted FROM consents WHERE kind = 'analytics' AND version = 0").toArray()
  return { analytics: row?.granted === 1 }
}

export function setPrivacy(c: VaultContext, analytics: unknown): PrivacyPreferences {
  if (typeof analytics !== 'boolean') throw new ContractValidationError('VALIDATION_FAILED', 'analytics must be true or false.', 'analytics')
  c.sql.exec(
    "INSERT INTO consents (kind, version, granted, updated_at) VALUES ('analytics', 0, ?, ?) ON CONFLICT (kind, version) DO UPDATE SET granted = excluded.granted, updated_at = excluded.updated_at",
    analytics ? 1 : 0,
    c.now.toISOString(),
  )
  return { analytics }
}

/** The signed-in account's own summary for GET /v1/me: no tokens, no sessions. */
export function describeMe(c: VaultContext): MeDto {
  const account = c.sql.exec<{ account_id: string; status: string }>('SELECT account_id, status FROM account_state WHERE id = 1').one()
  return {
    account_id: account.account_id,
    status: account.status as MeDto['status'],
    pending_policies: pendingPolicies(c),
    privacy: privacyOf(c),
  }
}
