// Job fixtures for integration specs: queue an account's job the way the app's
// routines do (the worker login cannot create user-startable kinds). Test use only.
import { randomUUID } from 'node:crypto';

import type { TestDatabase } from './postgres-harness';

export async function queueAccountJob(db: TestDatabase, accountId: string, kind: 'sync_snapshot' | 'export', options: { maxAttempts?: number; maxRuntimeSeconds?: number } = {}): Promise<string> {
  const id = randomUUID();
  await db.admin((client) =>
    client.query(
      `INSERT INTO jobs (id, kind, account_id, lifecycle_generation, payload, max_attempts, max_runtime_seconds)
       SELECT $1, $2, a.id, a.lifecycle_generation, '{}'::jsonb, $4, $5 FROM accounts a WHERE a.id = $3`,
      [id, kind, accountId, options.maxAttempts ?? 3, options.maxRuntimeSeconds ?? 120],
    ),
  );
  return id;
}
