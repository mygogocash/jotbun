import type { Pool, PoolClient } from 'pg';

import { JobRepository } from '../jobs/job.repository';
import type { JobLease } from '../jobs/job-types';
import { ObjectStoreError } from './object-store';
import type { ObjectStore } from './object-store';

export type PublishedObject = { key: string; bytes: number; sha256: string };

const PURPOSE = /^[a-z][a-z0-9_]{0,31}$/;
const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SHA256 = /^[0-9a-f]{64}$/;
/**
 * Every purpose an object key can have. The sweep (and the deletion objects
 * stage, through it) lists each for orphans, so a purpose missing here would
 * leave unregistered objects behind.
 */
export const PUBLICATION_PURPOSES = ['sync_snapshot', 'export', 'import_image', 'import_quarantine', 'receipt'] as const;
export type PublicationPurpose = (typeof PUBLICATION_PURPOSES)[number];
/**
 * The job kind that may reserve each lease-published purpose: a snapshot or
 * export job its own output; an import_parse job (P2b) its sanitized receipt
 * image.
 */
const PUBLISHER_KIND: Readonly<Partial<Record<PublicationPurpose, string>>> = {
  sync_snapshot: 'sync_snapshot',
  export: 'export',
  import_image: 'import_parse',
};
/**
 * Purposes registered by the API's own routines rather than a worker lease,
 * never reservable through reserveKey: P2a's upload quarantine (the intake
 * token takes the lease-token slot) and P2c's retained receipts (a copy
 * token does; gogospend_reserve_receipt_copy, then
 * gogospend_retain_attachment publishes with no expiry while a record holds
 * the receipt).
 */
export const API_PUBLISHED_PURPOSES: readonly PublicationPurpose[] = ['import_quarantine', 'receipt'];
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
   * Registers a key for a current lease of a job whose kind publishes
   * `purpose` (PUBLICATION_PURPOSES / PUBLISHER_KIND). Takes the pool, not a
   * transaction client: the reservation must be committed before the PUT, or
   * a concurrent sweep would see the object as an unregistered orphan.
   */
  async reserveKey(client: Pool, lease: JobLease, purpose: string, name: string): Promise<string> {
    const kind = PUBLISHER_KIND[purpose as PublicationPurpose];
    if (!PURPOSE.test(purpose) || kind === undefined || !NAME.test(name)) throw new ObjectStoreError('invalid_key');
    if (lease.accountId === null) throw new Error('only account jobs publish objects');
    const key = `${purpose}/${lease.accountId}/${lease.jobId}/${lease.leaseToken}/${name}`;
    const { rowCount } = await client.query(
      `INSERT INTO object_publications (key, job_id, account_id, lease_token, lifecycle_generation, purpose, delete_after)
       SELECT $1, j.id, j.account_id, j.lease_token, j.lifecycle_generation, $5,
              j.attempt_started_at + make_interval(secs => j.max_runtime_seconds + $6)
         FROM jobs j
        WHERE j.id = $2 AND j.lease_token = $3 AND j.account_id = $4 AND j.kind = $7 AND j.status = 'leased' AND j.lease_expires_at > now()`,
      [key, lease.jobId, lease.leaseToken, lease.accountId, purpose, RESERVATION_GRACE_SECONDS, kind],
    );
    if (rowCount !== 1) throw new Error('this lease cannot reserve an object key');
    return key;
  }

  /** reserveKey on this service's own pool. */
  reserve(lease: JobLease, purpose: string, name: string): Promise<string> {
    return this.reserveKey(this.pool, lease, purpose, name);
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
   * completes the job in one transaction. `record` runs in that transaction
   * after publication (e.g. a manifest naming the objects); false from it
   * rolls everything back. True only if all of it happened.
   */
  async finishWithObjects(jobs: JobRepository, lease: JobLease, objects: readonly PublishedObject[], expiresAt: Date, record?: (client: PoolClient) => Promise<boolean>): Promise<boolean> {
    for (const object of objects) {
      const stored = await this.store.head(object.key);
      if (!stored || stored.bytes !== object.bytes || stored.sha256 !== object.sha256) throw new Error('an object to publish is missing or differs from what was written');
    }
    const client = await this.pool.connect();
    let broken = false;
    try {
      await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
      const done =
        (await this.publishIfCurrent(client, lease, objects, expiresAt)) &&
        (record ? await record(client) : true) &&
        (await jobs.complete(lease, 'succeeded', client));
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
   * Deletes, registry first and storage second:
   *   1. rows left `deleting` by an earlier failed storage delete (retried);
   *   2. reservations whose final deadline and published objects whose expiry
   *      is before the cutoff - the database clock unless `cutoff` is given
   *      (tests and operators) - marked `deleting` (SKIP LOCKED) and then
   *      deleted from storage;
   *   3. stored objects under the account's prefixes (every account's when
   *      null; receipts only of accounts with a reservation in the last week)
   *      with no live registry row (unregistered, or already deleted);
   * and purges `deleted` rows after 30 days. A row becomes `deleted` only once
   * its object is gone. Returns the keys deleted from storage.
   */
  async sweep(accountId: string | null, cutoff?: Date): Promise<string[]> {
    const deleted = new Set<string>();
    const remove = async (keys: readonly string[]) => {
      for (const key of keys) {
        if (!(await this.tryDelete(key))) continue;
        deleted.add(key);
        await this.pool.query(`UPDATE object_publications SET status = 'deleted', deleted_at = now() WHERE key = $1 AND status = 'deleting'`, [key]);
      }
    };
    const retry = await this.pool.query<{ key: string }>(
      `SELECT key FROM object_publications WHERE status = 'deleting' AND ($1::uuid IS NULL OR account_id = $1) ORDER BY key LIMIT $2`,
      [accountId, SWEEP_BATCH],
    );
    await remove(retry.rows.map((row) => row.key));
    for (;;) {
      const { rows } = await this.pool.query<{ key: string }>(
        `UPDATE object_publications SET status = 'deleting'
          WHERE key IN (SELECT key FROM object_publications
                         WHERE status IN ('reserved', 'published') AND delete_after < coalesce($1::timestamptz, now())
                           AND ($2::uuid IS NULL OR account_id = $2)
                         ORDER BY delete_after LIMIT $3 FOR UPDATE SKIP LOCKED)
        RETURNING key`,
        [cutoff ?? null, accountId, SWEEP_BATCH],
      );
      await remove(rows.map((row) => row.key));
      if (rows.length < SWEEP_BATCH) break;
    }
    for (const prefix of await this.orphanPrefixes(accountId)) {
      // A page at a time: the listing is never held whole.
      for await (const stored of this.store.listPages(prefix)) {
        for (let start = 0; start < stored.length; start += SWEEP_BATCH) {
          const batch = stored.slice(start, start + SWEEP_BATCH).map((object) => object.key);
          // Rows still `deleting` are left to the next sweep's retry.
          const live = await this.pool.query<{ key: string }>(
            `SELECT key FROM object_publications WHERE key = ANY($1) AND status IN ('reserved', 'published', 'deleting')`,
            [batch],
          );
          const keep = new Set(live.rows.map((row) => row.key));
          for (const key of batch) if (!keep.has(key) && !deleted.has(key) && (await this.tryDelete(key))) deleted.add(key);
        }
      }
    }
    await this.pool.query(
      `DELETE FROM object_publications WHERE status = 'deleted' AND deleted_at < now() - interval '30 days' AND ($1::uuid IS NULL OR account_id = $1)`,
      [accountId],
    );
    return [...deleted];
  }

  /**
   * Where to look for unregistered objects. One account's sweep lists every
   * purpose under that account. The global sweep lists every purpose except
   * receipts under the whole purpose, and receipts only under accounts that
   * reserved a receipt copy in the last week: a receipt is registered before
   * its copy exists, so an unregistered one can only follow a recent
   * reservation, and the listing's cost then grows with recent activity
   * rather than with every receipt ever kept.
   */
  private async orphanPrefixes(accountId: string | null): Promise<string[]> {
    if (accountId) return PUBLICATION_PURPOSES.map((purpose) => `${purpose}/${accountId}/`);
    const prefixes: string[] = PUBLICATION_PURPOSES.filter((purpose) => purpose !== 'receipt').map((purpose) => `${purpose}/`);
    const { rows } = await this.pool.query<{ account_id: string }>(
      `SELECT DISTINCT account_id FROM object_publications WHERE purpose = 'receipt' AND created_at > now() - interval '7 days' ORDER BY account_id`,
    );
    return [...prefixes, ...rows.map((row) => `receipt/${row.account_id}/`)];
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
