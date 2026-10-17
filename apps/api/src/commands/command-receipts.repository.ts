import { Injectable } from '@nestjs/common';
import type { CommandAck, CommandOutcome, CommandStatus, EntityState } from '@gogospend/contracts';

import type { OwnerTx } from '../database/owner-transaction';
import type { StoredDigest } from './command-digest';

export type StoredReceipt = { ack: CommandAck; digest: StoredDigest };
export type NewReceipt = { ack: CommandAck; kind: string; schemaVersion: number; digest: StoredDigest; entity: string };

type ReceiptRow = { command_id: string; entity_id: string; entity_version: number; revision: string; outcome: CommandOutcome; entity_state: EntityState };

const toAck = (row: ReceiptRow): CommandAck => ({
  command_id: row.command_id,
  entity_id: row.entity_id,
  version: row.entity_version,
  committed_revision: row.revision,
  outcome: row.outcome,
  entity_state: row.entity_state,
});

/**
 * Command receipts: the idempotency record and compact acknowledgement for
 * each (account, command id). Rows hold a salted digest and ids, never
 * payload values. Owner RLS scopes every read.
 */
@Injectable()
export class CommandReceiptRepository {
  /** Call under the account lock, so a concurrent same-key command's receipt is visible. */
  async find(tx: OwnerTx, commandId: string): Promise<StoredReceipt | null> {
    // The acknowledgement as committed, with the entity's current state, so a
    // replay after a delete or purge says so.
    const [row] = await tx.query<ReceiptRow & { request_digest: Buffer; digest_key_id: string }>(
      `SELECT r.command_id, r.entity_id, r.entity_version, r.revision::text, r.outcome, coalesce(h.state, r.entity_state) AS entity_state,
              r.request_digest, r.digest_key_id
         FROM command_receipts r
         LEFT JOIN entity_heads h ON h.account_id = r.account_id AND h.entity = r.entity AND h.entity_id = r.entity_id
        WHERE r.command_id = $1`,
      [commandId],
    );
    return row ? { ack: toAck(row), digest: { keyId: row.digest_key_id, digest: row.request_digest } } : null;
  }

  async insert(tx: OwnerTx, receipt: NewReceipt): Promise<void> {
    const { ack } = receipt;
    await tx.query(
      `INSERT INTO command_receipts (account_id, command_id, kind, schema_version, request_digest, digest_key_id, entity, entity_id, entity_version, outcome, entity_state, revision)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [tx.accountId, ack.command_id, receipt.kind, receipt.schemaVersion, receipt.digest.digest, receipt.digest.keyId, receipt.entity, ack.entity_id, ack.version, ack.outcome, ack.entity_state, ack.committed_revision],
    );
  }

  /**
   * Status for up to 100 command ids, in request order: the original
   * acknowledgement with the entity's current state, or `unknown`. Waits
   * (FOR SHARE on the account lock row) for a command already holding the
   * lock, so an in-flight command is reported once it commits.
   */
  async lookup(tx: OwnerTx, ids: readonly string[]): Promise<CommandStatus[]> {
    await tx.query('SELECT 1 FROM account_sync_state WHERE account_id = $1 FOR SHARE', [tx.accountId]);
    const rows = await tx.query<ReceiptRow>(
      `SELECT r.command_id, r.entity_id, r.entity_version, r.revision::text, r.outcome, coalesce(h.state, r.entity_state) AS entity_state
         FROM command_receipts r
         LEFT JOIN entity_heads h ON h.account_id = r.account_id AND h.entity = r.entity AND h.entity_id = r.entity_id
        WHERE r.command_id = ANY($1::uuid[])`,
      [ids],
    );
    const known = new Map(rows.map((row) => [row.command_id, toAck(row)]));
    return ids.map((id) => {
      const ack = known.get(id);
      return ack ? { command_id: id, state: 'known' as const, ack } : { command_id: id, state: 'unknown' as const };
    });
  }
}
