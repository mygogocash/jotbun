import type { Pool } from 'pg';

const OVERDUE_GRACE_SECONDS = 3600;

/**
 * Receipt objects whose scheduled deletion is overdue (a released receipt, or
 * a copy nothing published, whose deadline passed over an hour ago) or whose
 * storage delete failed and awaits retry - one account's, or all. A receipt a
 * record still holds has no deadline and is never counted. The worker alerts
 * on a non-zero count after each sweep.
 */
export async function receiptCleanupOverdue(pool: Pool, accountId?: string): Promise<number> {
  const { rows } = await pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM object_publications
      WHERE purpose = 'receipt' AND ($1::uuid IS NULL OR account_id = $1)
        AND (status = 'deleting' OR (status IN ('reserved', 'published') AND delete_after < now() - make_interval(secs => $2)))`,
    [accountId ?? null, OVERDUE_GRACE_SECONDS],
  );
  return rows[0]?.n ?? 0;
}
