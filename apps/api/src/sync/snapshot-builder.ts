import { SNAPSHOT_SCHEMA_VERSION, SNAPSHOT_TTL_HOURS, SYNC_ENTITY_VALIDATORS, isEntityChange } from '@gogospend/contracts';
import type { EntityChange, Revision } from '@gogospend/contracts';

import type { LeasedAccountRead } from '../database/leased-account-read';
import type { JobRepository } from '../jobs/job.repository';
import type { JobLease } from '../jobs/job-types';
import type { ObjectPublicationService, PublishedObject } from '../storage/object-publication.service';
import type { ObjectStore } from '../storage/object-store';

/** Internal metadata of a published snapshot; never returned to clients as is. */
export type SnapshotManifest = {
  snapshot_id: string;
  account_id: string;
  high_water: Revision;
  schema_version: 1;
  chunks: readonly { key: string; sha256: string; bytes: number }[];
  expires_at: string;
};

export type SnapshotBuilderOptions = {
  /** Target serialized chunk size (a chunk always holds at least one entity). */
  chunkBytes?: number;
  /** Entities read per leased page. */
  pageSize?: number;
  validators?: Readonly<Record<string, (snapshot: unknown) => boolean>>;
  /** Test hook: runs after each chunk is stored. */
  afterChunk?: (index: number) => Promise<void>;
};

export type SnapshotDeps = { reader: LeasedAccountRead; jobs: JobRepository; store: ObjectStore; publication: ObjectPublicationService };

const DEFAULT_CHUNK_BYTES = 1024 * 1024;
const DEFAULT_PAGE_SIZE = 500;

/**
 * Builds one account snapshot for a sync_snapshot lease. Every entity's
 * latest state (deleted ones as tombstones) and the high-water revision come
 * from one REPEATABLE READ view through the leased-read role, so a snapshot
 * plus deltas strictly above its high-water is complete and has no
 * duplicates. Entities are validated against their persisted DTOs and
 * streamed into bounded JSON chunks, each registered before its PUT. The
 * manifest is recorded, the chunks published (24-hour expiry) and the job
 * completed in one transaction that re-checks the lease, account and
 * lifecycle generation - so a deadline, cancellation or account deletion
 * leaves no manifest and no published chunk (the sweep deletes the rest).
 * Returns the manifest, or null when the lease could no longer publish.
 */
export class SnapshotBuilder {
  constructor(private readonly deps: SnapshotDeps, private readonly options: SnapshotBuilderOptions = {}) {}

  async build(lease: JobLease): Promise<SnapshotManifest | null> {
    if (lease.accountId === null) throw new Error('a snapshot job needs an account');
    const accountId = lease.accountId;
    const validators = this.options.validators ?? SYNC_ENTITY_VALIDATORS;
    const chunkBytes = this.options.chunkBytes ?? DEFAULT_CHUNK_BYTES;
    const pageSize = this.options.pageSize ?? DEFAULT_PAGE_SIZE;
    const expiresAt = new Date(Date.now() + SNAPSHOT_TTL_HOURS * 3_600_000);
    const objects: PublishedObject[] = [];

    const highWater = await this.deps.reader.withSnapshot(lease, 'sync_snapshot', async (read) => {
      const high = await read.highWater();
      let parts: string[] = [];
      let size = 0;
      const flush = async () => {
        lease.signal.throwIfAborted();
        const index = objects.length;
        const body = `{"schema_version":${SNAPSHOT_SCHEMA_VERSION},"snapshot_id":${JSON.stringify(lease.jobId)},"high_water":${JSON.stringify(high)},"index":${index},"entities":[${parts.join(',')}]}`;
        const key = await this.deps.publication.reserve(lease, 'sync_snapshot', `chunk-${String(index).padStart(4, '0')}.json`);
        const stored = await this.deps.store.putStream(key, Buffer.from(body, 'utf8'), { contentType: 'application/json', signal: lease.signal });
        objects.push({ key, ...stored });
        parts = [];
        size = 0;
        await this.options.afterChunk?.(index);
      };
      let after: { entity: string; id: string } | null = null;
      for (;;) {
        lease.signal.throwIfAborted();
        const page = await read.entities(after, pageSize);
        for (const entity of page) {
          const change: EntityChange = { entity: entity.entity, id: entity.id, version: entity.version, state: entity.state, snapshot: entity.snapshot };
          if (!isEntityChange(change, validators)) throw new Error(`A ${entity.entity} in the snapshot does not match its persisted DTO.`);
          const json = JSON.stringify(change);
          const bytes = Buffer.byteLength(json) + 1;
          if (parts.length > 0 && size + bytes > chunkBytes) await flush();
          parts.push(json);
          size += bytes;
        }
        if (page.length < pageSize) break;
        after = { entity: page[page.length - 1].entity, id: page[page.length - 1].id };
      }
      if (parts.length > 0 || objects.length === 0) await flush();
      return high;
    });

    lease.signal.throwIfAborted();
    const chunks = objects.map((object, index) => ({ index, key: object.key, bytes: object.bytes, sha256: object.sha256 }));
    const done = await this.deps.publication.finishWithObjects(this.deps.jobs, lease, objects, expiresAt, async (client) => {
      const { rows } = await client.query<{ ok: boolean }>('SELECT gogospend_record_snapshot($1, $2, $3, $4, $5) AS ok', [lease.jobId, lease.leaseToken, highWater, JSON.stringify(chunks), expiresAt]);
      return rows[0]?.ok === true;
    });
    if (!done) return null;
    return {
      snapshot_id: lease.jobId,
      account_id: accountId,
      high_water: highWater,
      schema_version: SNAPSHOT_SCHEMA_VERSION,
      chunks: objects.map((object) => ({ key: object.key, sha256: object.sha256, bytes: object.bytes })),
      expires_at: expiresAt.toISOString(),
    };
  }
}
