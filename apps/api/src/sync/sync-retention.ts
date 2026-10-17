import { SYNC_RETENTION_DAYS } from '@gogospend/contracts';
import type { Pool } from 'pg';

/**
 * 30-day change retention (worker role, maintenance loop). Superseded changes
 * committed before the cutoff are deleted under each account's lock; every
 * entity's head change stays (snapshots are built from heads), and the
 * account's pruned_through moves up so older cursors get 410 RESYNC_REQUIRED.
 */
export class SyncRetention {
  constructor(private readonly pool: Pool) {}

  /** Returns the number of accounts pruned (at most `maxAccounts` per call). */
  async prune(now: Date = new Date(), maxAccounts = 100): Promise<number> {
    const cutoff = new Date(now.getTime() - SYNC_RETENTION_DAYS * 86_400_000);
    const { rows } = await this.pool.query<{ n: number }>('SELECT gogospend_prune_changes($1, $2) AS n', [cutoff, maxAccounts]);
    return rows[0].n;
  }
}
