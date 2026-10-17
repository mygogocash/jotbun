import type { Pool } from 'pg';

/**
 * 30-day change retention (worker role, maintenance loop), by the database
 * clock. Accounts are visited in order, each pruned in its own short
 * transaction that skips the account if a user write holds its lock (the
 * next run retries). Superseded changes go; every entity's head change stays
 * (snapshots are built from heads), and pruned_through moves up so older
 * cursors get 410 RESYNC_REQUIRED. Also drops manifests a week past expiry.
 */
export class SyncRetention {
  constructor(private readonly pool: Pool) {}

  /** Prunes every due account, `batchSize` candidates at a time; returns how many were pruned. */
  async prune(batchSize = 100): Promise<number> {
    let pruned = 0;
    let after: string | null = null;
    for (;;) {
      const { rows }: { rows: { id: string }[] } = await this.pool.query<{ id: string }>('SELECT gogospend_retention_candidates($1, $2) AS id', [after, batchSize]);
      for (const { id } of rows) {
        const result = await this.pool.query<{ done: boolean }>('SELECT gogospend_prune_account($1) AS done', [id]);
        if (result.rows[0].done) pruned += 1;
      }
      if (rows.length < batchSize) break;
      after = rows[rows.length - 1].id;
    }
    await this.pool.query('SELECT gogospend_prune_expired_manifests()');
    return pruned;
  }
}
