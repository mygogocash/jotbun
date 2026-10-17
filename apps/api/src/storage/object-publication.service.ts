import type { Pool, PoolClient } from 'pg';

import { JobRepository } from '../jobs/job.repository';
import type { JobLease } from '../jobs/job-types';
import { ObjectStoreError } from './object-store';
import type { ObjectStore } from './object-store';

export type PublishedObject = { key: string; bytes: number; sha256: string };

const PURPOSE = /^[a-z][a-z0-9_]{0,31}$/;
const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SHA256 = /^[0-9a-f]{64}$/;
/** Purposes whose objects the sweep lists for orphans. */
export const PUBLICATION_PURPOSES = ['sync_snapshot', 'export'] as const;
// A reservation outlives its publisher's last possible moment (the attempt's
// runtime bound) by this much before the sweep may delete it.
const RESERVATION_GRACE_SECONDS = 15 * 60;
const MAX_EXPIRY_MS = 7 * 24 * 3_600_000;
const SWEEP_BATCH = 500;

/**
 * Fenced publication of job output to private object storage. A database
 * rollback never undoes a PUT, so the registry (object_publications) is the
 * source of truth:
 *   1. reserveKey registers <purpose>/<account>/<job>/<lease token>/<name>
 *      for a current lease before anything is written;
 *   2. the worker PUTs (never overwriting);
 *   3. finishWithObjects, in one READ COMMITTED transaction, takes the
 *      account lock and the job row (gogospend_lock_current_job), re-checks
 *      that the lease is current and the account active at the job's
 *      lifecycle generation, marks the objects published and completes the
 *      job - or does nothing;
 *   4. sweep deletes reservations past their final deadline, published
 *      objects past their expiry, and objects nobody registered.
 * Output of a lease that was cancelled, reclaimed or outlived its account is
 * therefore never published, and is deleted.
 */
export class ObjectPublicationService {
  constructor(private readonly pool: Pool, private readonly store: ObjectStore) {}

  /**
   * Registers a key for a current lease. Takes the pool, not a transaction
   * client: the reservation must be committed before the PUT, or a concurrent
   * sweep would see the object as an unregistered orphan.
   */
  async reserveKey(client: Pool, lease: JobLease, purpose: string, name: string): Promise<string> {
    if (!PURPOSE.test(purpose) || !NAME.test(name)) throw new ObjectStoreError('invalid_key');
    if (lease.accountId === null) throw new Error('only account jobs publish objects');
    const key = `${purpose}/${lease.accountId}/${lease.jobId}/${lease.leaseToken}/${name}`;
    const { rowCount } = await client.query(
      `INSERT INTO object_publications (key, job_id, account_id, lease_token, lifecycle_generation, purpose, delete_after)
       SELECT $1, j.id, j.account_id, j.lease_token, j.lifecycle_generation, $5,
              j.attempt_started_at + make_interval(secs => j.max_runtime_seconds + $6)
         FROM jobs j
        WHERE j.id = $2 AND j.lease_token = $3 AND j.account_id = $4 AND j.status = 'leased' AND j.lease_expires_at > now()`,
      [key, lease.jobId, lease.leaseToken, lease.accountId, purpose, RESERVATION_GRACE_SECONDS],
    );
    if (rowCount !== 1) throw new Error('this lease cannot reserve an object key');
    return key;
  }

  /**
   * Inside the caller's transaction: locks the job, re-checks the lease and
   * the account, and publishes this lease's reserved objects. False (publish
   * nothing; the caller must roll back) when anything no longer holds.
   */
  async publishIfCurrent(client: PoolClient, lease: JobLease, objects: readonly PublishedObject[], expiresAt: Date): Promise<boolean> {
    const expiresIn = expiresAt.getTime() - Date.now();
    if (!(expiresIn > 0 && expiresIn <= MAX_EXPIRY_MS)) throw new RangeError('objects expire within 7 days');
    for (const object of objects) {
      if (!SHA256.test(object.sha256) || !Number.isSafeInteger(object.bytes) || object.bytes < 0) throw new RangeError('published objects need their size and sha256');
    }
    const { rows } = await client.query<{ current: boolean }>('SELECT gogospend_lock_current_job($1, $2) AS current', [lease.jobId, lease.leaseToken]);
    if (!rows[0]?.current) return false;
    for (const object of objects) {
      const { rowCount } = await client.query(
        `UPDATE object_publications
            SET status = 'published', delete_after = $5, bytes = $6, sha256 = decode($7, 'hex'), published_at = now()
          WHERE key = $1 AND job_id = $2 AND lease_token = $3 AND account_id = $4 AND status = 'reserved'`,
        [object.key, lease.jobId, lease.leaseToken, lease.accountId, expiresAt, object.bytes, object.sha256],
      );
      if (rowCount !== 1) return false;
    }
    return true;
  }

  /**
   * Verifies the objects landed as described, then publishes them and
   * completes the job in one transaction. True only if both happened.
   */
  async finishWithObjects(jobs: JobRepository, lease: JobLease, objects: readonly PublishedObject[], expiresAt: Date): Promise<boolean> {
    for (const object of objects) {
      const stored = await this.store.head(object.key);
      if (!stored || stored.bytes !== object.bytes || stored.sha256 !== object.sha256) throw new Error('an object to publish is missing or differs from what was written');
    }
    const client = await this.pool.connect();
    let broken = false;
    try {
      await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
      const done = (await this.publishIfCurrent(client, lease, objects, expiresAt)) && (await jobs.complete(lease, 'succeeded', client));
      await client.query(done ? 'COMMIT' : 'ROLLBACK');
      return done;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {
        broken = true;
      });
      throw error;
    } finally {
      client.release(broken);
    }
  }

  /**
   * Deletes (registry first, then storage): reservations whose final deadline
   * is before `before`, published objects that expired before it, and stored
   * objects under the account's prefixes (every account's when null) that are
   * unregistered or already marked deleted. Returns the keys deleted from
   * storage. A storage failure leaves the key to the next sweep's orphan pass.
   */
  async sweep(accountId: string | null, before: Date): Promise<string[]> {
    const deleted = new Set<string>();
    for (;;) {
      // Rows a publisher holds are skipped (SKIP LOCKED) and seen next time.
      const { rows } = await this.pool.query<{ key: string }>(
        `UPDATE object_publications SET status = 'deleted', deleted_at = now()
          WHERE key IN (SELECT key FROM object_publications
                         WHERE status IN ('reserved', 'published') AND delete_after < $1 AND ($2::uuid IS NULL OR account_id = $2)
                         ORDER BY delete_after LIMIT $3 FOR UPDATE SKIP LOCKED)
        RETURNING key`,
        [before, accountId, SWEEP_BATCH],
      );
      for (const { key } of rows) if (await this.tryDelete(key)) deleted.add(key);
      if (rows.length < SWEEP_BATCH) break;
    }
    for (const purpose of PUBLICATION_PURPOSES) {
      const stored = await this.store.list(accountId ? `${purpose}/${accountId}/` : `${purpose}/`);
      for (let start = 0; start < stored.length; start += SWEEP_BATCH) {
        const batch = stored.slice(start, start + SWEEP_BATCH).map((object) => object.key);
        const live = await this.pool.query<{ key: string }>(
          `SELECT key FROM object_publications WHERE key = ANY($1) AND status IN ('reserved', 'published')`,
          [batch],
        );
        const keep = new Set(live.rows.map((row) => row.key));
        for (const key of batch) if (!keep.has(key) && !deleted.has(key) && (await this.tryDelete(key))) deleted.add(key);
      }
    }
    return [...deleted];
  }

  private async tryDelete(key: string): Promise<boolean> {
    try {
      await this.store.delete(key);
      return true;
    } catch {
      return false;
    }
  }
}
