import { ATTACHMENT_GRANT_MINUTES } from '@gogospend/contracts'

import { SnapshotGrants } from '@api/sync/snapshot-grants'

import type { VaultClaims } from '../../v1/protocol'
import type { VaultContext } from '../context'

export type GrantPurpose = 'snapshot' | 'export' | 'attachment'

/** One key label per purpose, as the API's modules and the edge's buildContainer derive them. */
const GRANT_LABELS: Readonly<Record<GrantPurpose, string>> = {
  snapshot: 'gogospend.snapshot-grant.v1',
  export: 'gogospend.export-grant.v1',
  attachment: 'gogospend.attachment-grant.v1',
}

/**
 * Download grants for one purpose, under keys derived for that purpose only,
 * so a grant of one purpose never verifies as another. Attachment grants last
 * ATTACHMENT_GRANT_MINUTES; the others SnapshotGrants' default.
 */
export function vaultGrants(c: Pick<VaultContext, 'digester'>, purpose: GrantPurpose): SnapshotGrants {
  const keys = c.digester.deriveKeys(GRANT_LABELS[purpose])
  return purpose === 'attachment' ? new SnapshotGrants(keys, { minutes: ATTACHMENT_GRANT_MINUTES }) : new SnapshotGrants(keys)
}

/** The MAC context of a receipt grant: the account and the session that asked, so another device's session cannot use it. */
export function receiptGrantScope(claims: VaultClaims): string {
  return `${claims.accountId}\u0000${claims.sessionId}`
}
