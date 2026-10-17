import { Injectable } from '@nestjs/common';
import { SNAPSHOT_SCHEMA_VERSION } from '@gogospend/contracts';
import type { SnapshotDto } from '@gogospend/contracts';

import { derivedUuid } from '../commands/derived-id';
import type { OwnerTx } from '../database/owner-transaction';
import { SnapshotGrants } from './snapshot-grants';
import { encodeSyncCursor } from './sync-cursor';

export type StoredChunk = { key: string; bytes: number; sha256: string };

/**
 * The owner's side of snapshots (inside owner transactions): requesting a
 * build, reading its status with fresh chunk grants, and resolving a grant to
 * the stored chunk. Object keys stay server-side.
 */
@Injectable()
export class SnapshotRepository {
  constructor(private readonly grants: SnapshotGrants) {}

  /** Idempotent by key: the job id is derived from the account and the key. */
  async request(tx: OwnerTx, idempotencyKey: string): Promise<string> {
    const [row] = await tx.query<{ id: string }>('SELECT gogospend_request_snapshot($1) AS id', [derivedUuid(tx.accountId, 'snapshot-request', idempotencyKey)]);
    return row.id;
  }

  /** Null when the caller has no such snapshot. */
  async status(tx: OwnerTx, snapshotId: string, now: Date = new Date()): Promise<SnapshotDto | null> {
    const [manifest] = await tx.query<{ high_water: string; expires_at: Date }>(
      'SELECT high_water::text AS high_water, expires_at FROM snapshot_manifests WHERE snapshot_id = $1',
      [snapshotId],
    );
    if (manifest) {
      if (manifest.expires_at.getTime() <= now.getTime()) return { snapshot_id: snapshotId, status: 'expired' };
      const chunks = await tx.query<{ chunk_index: number; bytes: string; sha256: string }>(
        `SELECT chunk_index, bytes::text AS bytes, encode(sha256, 'hex') AS sha256 FROM snapshot_chunks WHERE snapshot_id = $1 ORDER BY chunk_index`,
        [snapshotId],
      );
      return {
        snapshot_id: snapshotId,
        status: 'ready',
        schema_version: SNAPSHOT_SCHEMA_VERSION,
        high_water: manifest.high_water,
        cursor: encodeSyncCursor(tx.accountId, manifest.high_water),
        expires_at: manifest.expires_at.toISOString(),
        chunks: chunks.map((chunk) => {
          const { grant, expiresAt } = this.grants.issue(tx.accountId, { snapshotId, index: chunk.chunk_index }, now, manifest.expires_at);
          return { index: chunk.chunk_index, bytes: Number(chunk.bytes), sha256: chunk.sha256, grant, grant_expires_at: expiresAt.toISOString() };
        }),
      };
    }
    const [job] = await tx.query<{ status: string | null }>('SELECT gogospend_snapshot_job_status($1) AS status', [snapshotId]);
    switch (job?.status) {
      case null:
      case undefined:
        return null;
      case 'queued':
      case 'leased':
        return { snapshot_id: snapshotId, status: 'pending' };
      // Succeeded without a manifest: the manifest was dropped after expiry.
      case 'succeeded':
        return { snapshot_id: snapshotId, status: 'expired' };
      default:
        return { snapshot_id: snapshotId, status: 'failed' };
    }
  }

  /** The stored chunk a current grant names, if the caller's snapshot is still unexpired. */
  async chunk(tx: OwnerTx, grant: string, now: Date = new Date()): Promise<StoredChunk | null> {
    const target = this.grants.verify(tx.accountId, grant, now);
    if (!target) return null;
    const [row] = await tx.query<{ object_key: string; bytes: string; sha256: string }>(
      `SELECT c.object_key, c.bytes::text AS bytes, encode(c.sha256, 'hex') AS sha256
         FROM snapshot_chunks c JOIN snapshot_manifests m ON m.snapshot_id = c.snapshot_id
        WHERE c.snapshot_id = $1 AND c.chunk_index = $2 AND m.expires_at > $3`,
      [target.snapshotId, target.index, now],
    );
    return row ? { key: row.object_key, bytes: Number(row.bytes), sha256: row.sha256 } : null;
  }
}
