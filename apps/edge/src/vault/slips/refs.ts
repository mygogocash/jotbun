// A single read's slip reference (P4-T7, for P4-T16b; S13). After a person saves a record from one
// slip read on /v1/ai/slip, the phone sends the slip's salted reference and the record's id, so the
// same slip is known when the albums are read. A plain write (S1): no command and no change log, and
// the record's version does not move (its slip reference is not part of its DTO). The route answers
// before slip import opens.
import { parseSlipRefRequest } from '@gogospend/contracts'

import { ProblemException } from '@api/common/api-problem.filter'

import type { VaultCall } from '../../v1/protocol'
import type { VaultContext } from '../context'

/**
 * POST /v1/slips/refs: a record that is not live (deleted, purged or unknown) is 404. An unknown
 * hash becomes a `recorded` reference to the record, and the record takes it as its slip reference
 * when it has none. A known hash (a draft, a confirmed, dismissed or expired slip, or a reference
 * recorded before) is left as it is.
 */
export function recordSlipRef(c: VaultContext, call: VaultCall): void {
  const { ref_hash: refHash, transaction_id: transactionId } = parseSlipRefRequest(call.body)
  const [record] = c.sql.exec<{ id: string }>('SELECT id FROM transactions WHERE id = ? AND deleted_at IS NULL', transactionId).toArray()
  if (!record) throw new ProblemException(404, 'NOT_FOUND')
  const now = c.now.toISOString()
  const [recorded] = c.sql
    .exec<{ id: string }>(
      "INSERT INTO slip_refs (id, ref_hash, state, transaction_id, first_seen_at, updated_at) VALUES (?, ?, 'recorded', ?, ?, ?) ON CONFLICT (ref_hash) DO NOTHING RETURNING id",
      crypto.randomUUID(),
      refHash,
      transactionId,
      now,
      now,
    )
    .toArray()
  // Only the slip reference: the record's source, version and change log stay as they are (H9).
  if (recorded) c.sql.exec('UPDATE transactions SET slip_ref_id = ? WHERE id = ? AND slip_ref_id IS NULL', recorded.id, transactionId).toArray()
}
