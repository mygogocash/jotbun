import type { CommandAck, CommandStatus, EntityState } from '@gogospend/contracts'

import type { NewReceipt, StoredReceipt } from '@api/commands/command-receipts.repository'

import type { VaultContext } from '../context'

type AckRow = {
  command_id: string
  entity_id: string
  entity_version: number
  revision: string
  outcome: CommandAck['outcome']
  entity_state: EntityState
}

type ReceiptRow = AckRow & { request_digest: ArrayBuffer | null; digest_key_id: string | null }

/** The receipt's own columns, with the entity's current state from its head (a deleted or purged entity is reported as such). */
const ACK_COLUMNS = `r.command_id, r.entity_id, r.entity_version, CAST(r.revision AS TEXT) AS revision, r.outcome, coalesce(h.state, r.entity_state) AS entity_state`
const HEAD_JOIN = 'LEFT JOIN entity_heads h ON h.entity = r.entity AND h.entity_id = r.entity_id'

const toAck = (row: AckRow): CommandAck => ({
  command_id: row.command_id,
  entity_id: row.entity_id,
  version: row.entity_version,
  committed_revision: row.revision,
  outcome: row.outcome,
  entity_state: row.entity_state,
})

/** The receipt for a command id, or null. Its digest is null once retention dropped it (the API's find). */
export function findReceipt(c: VaultContext, commandId: string): StoredReceipt | null {
  const [row] = c.sql
    .exec<ReceiptRow>(`SELECT ${ACK_COLUMNS}, r.request_digest, r.digest_key_id FROM command_receipts r ${HEAD_JOIN} WHERE r.command_id = ?`, commandId)
    .toArray()
  if (!row) return null
  const digest = row.request_digest && row.digest_key_id ? { keyId: row.digest_key_id, digest: Buffer.from(row.request_digest) } : null
  return { ack: toAck(row), digest }
}

/** Writes the receipt of a committed command, under its revision (the API's insert). */
export function insertReceipt(c: VaultContext, receipt: NewReceipt): void {
  const { ack } = receipt
  c.sql
    .exec(
      `INSERT INTO command_receipts (command_id, kind, schema_version, request_digest, digest_key_id, entity, entity_id, entity_version, outcome, entity_state, revision, committed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS INTEGER), ?)`,
      ack.command_id,
      receipt.kind,
      receipt.schemaVersion,
      new Uint8Array(receipt.digest.digest),
      receipt.digest.keyId,
      receipt.entity,
      ack.entity_id,
      ack.version,
      ack.outcome,
      ack.entity_state,
      ack.committed_revision,
      c.now.toISOString(),
    )
    .toArray()
}

/**
 * The status of each command id, in request order: its original acknowledgement
 * with the entity's current state, or unknown when no such command committed.
 */
export function lookupStatuses(c: VaultContext, ids: readonly string[]): CommandStatus[] {
  const rows =
    ids.length === 0
      ? []
      : c.sql
          .exec<AckRow>(`SELECT ${ACK_COLUMNS} FROM command_receipts r ${HEAD_JOIN} WHERE r.command_id IN (${ids.map(() => '?').join(', ')})`, ...ids)
          .toArray()
  const known = new Map(rows.map((row) => [row.command_id, toAck(row)]))
  return ids.map((id): CommandStatus => {
    const ack = known.get(id)
    return ack ? { command_id: id, state: 'known', ack } : { command_id: id, state: 'unknown' }
  })
}
