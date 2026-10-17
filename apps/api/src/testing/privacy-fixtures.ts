// P5 fixtures for integration specs: a scripted Auth0 erasure gateway, a
// registry that can fail, the deletion worker wired as in production and
// owner-row accounting over every table with an account_id. Test use only.
import { randomBytes } from 'node:crypto';

import type { IdentityErasureGateway, MaintenanceOutcome } from '../auth/auth0-management.client';
import { HandlerRegistry } from '../jobs/handler-registry';
import { JobRepository } from '../jobs/job.repository';
import { JobWorker } from '../jobs/worker';
import { DeletionHandler, DeletionRepository } from '../privacy/deletion-handler';
import type { DeletionHandlerOptions } from '../privacy/deletion-handler';
import { LookupKey, PostgresErasureRegistry } from '../privacy/erasure-registry';
import type { ErasureMarker, ErasureRegistry, MarkerReceipt, ProviderSubjectKey } from '../privacy/erasure-registry';
import type { PrivacySteps } from '../privacy/privacy-steps';
import { ObjectPublicationService } from '../storage/object-publication.service';
import type { MemoryObjectStore } from '../storage/object-store';
import { TEST_CLIENT_ID } from './jwks-server';
import type { TestDatabase } from './postgres-harness';

export type GatewayCall = { op: 'revokeGrants' | 'deleteUser' | 'confirmDeleted'; subject: string };

/** Records every call; `next` scripts outcomes (or throws) per operation, consumed in order. */
export function scriptedGateway() {
  const calls: GatewayCall[] = [];
  const next: Partial<Record<GatewayCall['op'], (MaintenanceOutcome | 'throw')[]>> = {};
  const always: Partial<Record<GatewayCall['op'], MaintenanceOutcome>> = {};
  const answer = async (op: GatewayCall['op'], subject: string): Promise<MaintenanceOutcome> => {
    calls.push({ op, subject });
    const scripted = next[op]?.shift();
    if (scripted === 'throw') throw new Error('synthetic provider crash');
    return scripted ?? always[op] ?? { status: 'done', count: 1 };
  };
  const gateway: IdentityErasureGateway = {
    revokeGrants: (subject) => answer('revokeGrants', subject),
    deleteUser: (subject) => answer('deleteUser', subject),
    confirmDeleted: (subject) => answer('confirmDeleted', subject),
    credentialState: async () => ({ status: 'done', lastPasswordReset: null }),
  };
  return {
    gateway,
    calls,
    next,
    always,
    reset() {
      calls.length = 0;
      for (const op of Object.keys(next) as GatewayCall['op'][]) delete next[op];
      for (const op of Object.keys(always) as GatewayCall['op'][]) delete always[op];
    },
  };
}

/** Wraps a registry: counts writes and can be switched to fail. */
export function switchableRegistry(inner: ErasureRegistry) {
  const state = { failing: false, records: 0 };
  const registry: ErasureRegistry = {
    async record(accountId: string, keys: readonly ProviderSubjectKey[]): Promise<MarkerReceipt> {
      if (state.failing) throw new Error('synthetic registry outage');
      state.records += 1;
      return inner.record(accountId, keys);
    },
    async listMarkers(): Promise<ErasureMarker[]> {
      if (state.failing) throw new Error('synthetic registry outage');
      return inner.listMarkers();
    },
  };
  return { registry, state };
}

/** Counts storage deletes (destructive calls) on a memory store. */
export function countDeletes(store: MemoryObjectStore): { deletes: number } {
  const counter = { deletes: 0 };
  const original = store.delete.bind(store);
  store.delete = async (key: string) => {
    counter.deletes += 1;
    return original(key);
  };
  return counter;
}

/** The deletion worker as deployed: login in gogospend_jobs + gogospend_security, a separate registry login. */
export async function deletionWorker(db: TestDatabase, store: MemoryObjectStore, gateway: IdentityErasureGateway, options: { registry?: ErasureRegistry; steps?: PrivacySteps; handler?: DeletionHandlerOptions } = {}) {
  const pool = await db.loginPool(['gogospend_jobs', 'gogospend_security'], 4);
  const registryPool = await db.loginPool(['gogospend_erasure_registry'], 2);
  const lookupKey = new LookupKey(randomBytes(32));
  const realRegistry = new PostgresErasureRegistry(registryPool, lookupKey);
  const jobs = new JobRepository(pool);
  const repository = new DeletionRepository(pool);
  const publication = new ObjectPublicationService(pool, store);
  const handlerOptions: DeletionHandlerOptions = { ...options.handler };
  const handler = new DeletionHandler(
    { jobs, repository, registry: options.registry ?? realRegistry, gateway, publication, pool, nativeClientIds: [TEST_CLIENT_ID], steps: options.steps },
    handlerOptions,
  );
  const worker = new JobWorker(jobs, new HandlerRegistry({ security: true }).register('account_deletion', (job) => handler.run(job.lease)));
  /** Runs deletion jobs until none is runnable (at most `max`). */
  const drain = async (max = 10) => {
    let ran = 0;
    while (ran < max && (await worker.runOnce()) === 'ran') ran += 1;
    return ran;
  };
  return { pool, registryPool, lookupKey, realRegistry, jobs, repository, publication, handler, handlerOptions, worker, drain };
}

/** Every public table with an account_id column, and whether its foreign key cascades from accounts. */
export async function accountTables(db: TestDatabase): Promise<{ table: string; cascades: boolean }[]> {
  const { rows } = await db.admin((client) =>
    client.query<{ table: string; cascades: boolean }>(
      `SELECT c.table_name AS table,
              EXISTS (SELECT 1 FROM pg_constraint k
                       WHERE k.conrelid = format('public.%I', c.table_name)::regclass AND k.contype = 'f'
                         AND k.confrelid = 'public.accounts'::regclass AND k.confdeltype = 'c'
                         AND k.conkey = ARRAY[(SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = format('public.%I', c.table_name)::regclass AND a.attname = 'account_id')]) AS cascades
         FROM information_schema.columns c
         JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
        WHERE c.table_schema = 'public' AND c.column_name = 'account_id'
        ORDER BY c.table_name`,
    ),
  );
  return rows;
}

/** Rows left for an account: accounts itself plus every table with an account_id. */
export async function ownerRows(db: TestDatabase, accountId: string, except: readonly string[] = []): Promise<Record<string, number>> {
  const left: Record<string, number> = {};
  const tables = (await accountTables(db)).map((row) => row.table).filter((table) => !except.includes(table));
  await db.admin(async (client) => {
    const accounts = await client.query<{ n: number }>('SELECT count(*)::int AS n FROM accounts WHERE id = $1', [accountId]);
    if (accounts.rows[0].n > 0) left.accounts = accounts.rows[0].n;
    for (const table of tables) {
      const { rows } = await client.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${client.escapeIdentifier(table)} WHERE account_id = $1`, [accountId]);
      if (rows[0].n > 0) left[table] = rows[0].n;
    }
  });
  return left;
}

/** Moves a queued job's next run (and nothing else) to now, as if its backoff had passed. */
export async function runNow(db: TestDatabase, jobId: string): Promise<void> {
  await db.admin((client) => client.query(`UPDATE jobs SET run_after = now() WHERE id = $1 AND status = 'queued'`, [jobId]));
}

export const deletionRequestOf = async (db: TestDatabase, accountId: string) =>
  (await db.admin((client) => client.query('SELECT * FROM deletion_requests WHERE account_id = $1', [accountId]))).rows[0] as
    | { request_id: string; command_id: string; marker_recorded_at: Date | null; provider_verified_at: Date | null; objects_swept_at: Date | null; purged_at: Date | null; requested_at: Date }
    | undefined;

export const deletionJobOf = async (db: TestDatabase, accountId: string) =>
  (await db.admin((client) => client.query(`SELECT id, status, attempts, last_error, run_after FROM jobs WHERE account_id = $1 AND kind = 'account_deletion' ORDER BY created_at`, [accountId]))).rows as
    { id: string; status: string; attempts: number; last_error: string | null; run_after: Date }[];
