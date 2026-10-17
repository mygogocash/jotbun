// Local adapters for the P6a rehearsal on the loopback Docker PostgreSQL 17
// (gogospend-postgres-v1-local, 127.0.0.1:55432). They only ever create, use
// and drop databases whose names they generated in this process
// (`gogospend_rehearsal_src_*`, `gogospend_restore_*`), never the dev
// database `gogospend_v1` or any role. pg_dump/pg_restore run inside the
// container over its Unix socket, so no password or connection string is in
// any argument; tool output is discarded.
import { spawn } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';

import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

import { LOCAL_CONTAINER, localDockerDump, localRecoveryStore, memoryAttachmentSource, runDailyBackup } from './backup.mjs';
import { memoryMarkerSource, principalDigest, SubjectLookupKey } from './erasure-markers.mjs';
import { asOpsError, isLoopbackAddress, OpsError, REPO_ROOT, silentLog } from './ops-safety.mjs';
import { readRecoveryKeyFromFd, RecoveryKey } from './recovery-crypto.mjs';
import { HOSTED_INVENTORY_SKIPPED, localRestoreLedger, RecoveryInventory, recoveryStoreSource, restoreLedgerSource } from './recovery-inventory.mjs';

const { Client } = pg;
const LOCAL_ADMIN = 'gogospend_local_admin';
const LOCAL_PORT = 55432;
const DEFAULT_ADMIN_URL = `postgres://gogospend_local_admin:gogospend-local-only@127.0.0.1:${LOCAL_PORT}/postgres`;
const OWNED_NAME = /^gogospend_(rehearsal_src|restore)_[a-z0-9]{8,32}$/;

/**
 * A pg client for `database`, refused unless the host and port pg will really
 * dial are the local container's: pg itself resolves the URL (its hostname,
 * a `host=` query parameter, PGHOST/PGPORT when the URL has none, a socket
 * path), and that resolved value is what is checked. pg_dump/pg_restore run
 * inside the container, so the client must reach that same server (port
 * 55432 on a loopback address, as `npm run db:v1:up` publishes it).
 */
function localClient(database) {
  let url;
  try {
    url = new URL(process.env.GOGOSPEND_TEST_ADMIN_URL ?? DEFAULT_ADMIN_URL);
  } catch {
    throw new OpsError('RESTORE_TARGET_NOT_ISOLATED');
  }
  url.pathname = `/${database}`;
  const client = new Client({ connectionString: url.href });
  if (!isLoopbackAddress(client.host) || Number(client.port) !== LOCAL_PORT) throw new OpsError('RESTORE_TARGET_NOT_ISOLATED');
  client.on('error', () => undefined);
  return client;
}

/** The endpoint every local connection uses (checked as above). */
export function localEndpoint() {
  const client = localClient('postgres');
  return { host: client.host, port: Number(client.port) };
}

async function withClient(database, fn) {
  const client = localClient(database);
  try {
    await client.connect();
  } catch {
    throw new OpsError('LOCAL_DATABASE_UNAVAILABLE');
  }
  try {
    return await fn(client);
  } finally {
    await client.end().catch(() => undefined);
  }
}

/**
 * Creates and drops only databases it named itself. A new database admits no
 * login but the superuser running this: CONNECT and TEMPORARY are revoked
 * from PUBLIC at once, so nothing can read a restored copy before its
 * erasure markers are applied and checked.
 */
function databaseRegistry() {
  const created = new Set();
  return {
    async create(name) {
      if (!OWNED_NAME.test(name)) throw new OpsError('RESTORE_TARGET_NOT_ISOLATED');
      await withClient('postgres', async (client) => {
        const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
        if (exists.rowCount > 0) throw new OpsError('RESTORE_TARGET_EXISTS');
        await client.query(`CREATE DATABASE ${client.escapeIdentifier(name)}`);
        created.add(name);
        await client.query(`REVOKE CONNECT, TEMPORARY ON DATABASE ${client.escapeIdentifier(name)} FROM PUBLIC`);
      });
    },
    async drop(name) {
      if (!created.has(name)) return;
      await withClient('postgres', (client) => client.query(`DROP DATABASE IF EXISTS ${client.escapeIdentifier(name)} WITH (FORCE)`));
      created.delete(name);
    },
    async exists(name) {
      return withClient('postgres', async (client) => (await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name])).rowCount > 0);
    },
    /** True when no role other than superusers can connect. */
    async isPrivate(name) {
      return withClient('postgres', async (client) => {
        const result = await client.query(
          `SELECT NOT has_database_privilege('public', $1, 'CONNECT')
              AND NOT coalesce(bool_or(has_database_privilege(r.oid, d.oid, 'CONNECT')), false) AS private
             FROM pg_database d LEFT JOIN pg_roles r ON NOT r.rolsuper
            WHERE d.datname = $1
            GROUP BY d.oid`,
          [name],
        );
        return result.rows[0]?.private === true;
      });
    },
  };
}

const OWNER_TABLES = `
  SELECT c.relname AS name,
         COALESCE((SELECT bool_or(k.confdeltype IN ('c', 'n')) FROM pg_constraint k
                    WHERE k.conrelid = c.oid AND k.contype = 'f' AND k.confrelid = to_regclass('public.accounts')), false) AS follows_accounts
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'account_id' AND NOT a.attisdropped
   WHERE c.relkind IN ('r', 'p')
   ORDER BY c.relname`;

// Tables keyed by a provider principal digest (event receipts, reconcile
// checks, sessions, challenges). blocked_principals is excluded: it must keep
// the erased aliases' digests so a stale token cannot bootstrap.
const DIGEST_TABLES = `
  SELECT c.relname AS name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'principal_digest' AND NOT a.attisdropped
   WHERE c.relkind IN ('r', 'p') AND c.relname <> 'blocked_principals'
   ORDER BY c.relname`;

const DIGESTS = `(SELECT decode(d, 'hex') FROM unnest($1::text[]) AS d)`;

/**
 * Restore adapter for the local container. `attachmentReferenceSql` returns
 * `account_id, ref[, sha256]` for every retained attachment reference; P2c
 * supplies the real query. Without it, a schema that has attachment tables is
 * refused rather than passed unchecked.
 */
export function localDockerRestorer({ attachmentReferenceSql, spawnImpl = spawn } = {}) {
  const databases = databaseRegistry();
  return {
    kind: 'local-docker',
    endpoint: localEndpoint,
    create: (target) => databases.create(target.database),
    drop: (target) => databases.drop(target.database),

    async restore(target, plaintext) {
      const child = spawnImpl('docker', ['exec', '-i', LOCAL_CONTAINER, 'pg_restore', '--exit-on-error', '--single-transaction', '-w', `--username=${LOCAL_ADMIN}`, `--dbname=${target.database}`], { stdio: ['pipe', 'ignore', 'pipe'] });
      child.stderr.resume();
      const exited = new Promise((resolve) => {
        child.on('error', () => resolve(-1));
        child.on('close', (code) => resolve(code));
      });
      let streamed = null;
      try {
        await pipeline(plaintext, child.stdin);
      } catch (error) {
        streamed = error;
      }
      const code = await exited;
      if (streamed) throw asOpsError(streamed, 'RESTORE_FAILED');
      if (code !== 0) throw new OpsError('RESTORE_FAILED', { exit_code: typeof code === 'number' ? code : -1 });
      // A per-database dump carries no database-level ACL, so the revokes made
      // at creation still hold; check before anything else reads the copy.
      if (!(await databases.isPrivate(target.database))) throw new OpsError('RESTORE_TARGET_NOT_ISOLATED');
    },

    identities: (target) => withClient(target.database, async (client) => {
      const present = await client.query(`SELECT to_regclass('public.account_identities') IS NOT NULL AS present`);
      if (!present.rows[0].present) return [];
      const rows = await client.query('SELECT issuer, subject, account_id::text AS account_id, created_at FROM account_identities');
      return rows.rows.map((row) => ({ ...row, created_at: new Date(row.created_at).toISOString() }));
    }),

    existingAccounts: (target, accountIds) => withClient(target.database, async (client) => {
      const rows = await client.query('SELECT id::text AS id FROM accounts WHERE id = ANY($1::uuid[])', [accountIds]);
      return rows.rows.map((row) => row.id);
    }),

    // One transaction: re-block the erased aliases with the block end their
    // markers record (no end = permanent; an existing permanent hold stays),
    // delete principal-digest rows of those aliases, delete rows in account
    // tables that do not follow accounts, then the accounts (rows cascade).
    applyErasure: (target, { accountIds, principalDigests = [], blocks = [] }) => withClient(target.database, async (client) => {
      await client.query('BEGIN');
      try {
        let principalsBlocked = 0;
        const blocking = await client.query(`SELECT to_regclass('public.blocked_principals') IS NOT NULL AS ok`);
        if (blocking.rows[0].ok && blocks.length > 0) {
          const blocked = await client.query(
            `INSERT INTO blocked_principals (principal_digest, reason, blocked_until)
             SELECT decode(b.digest, 'hex'), 'deleted', b.until FROM unnest($1::text[], $2::timestamptz[]) AS b(digest, until)
             ON CONFLICT (principal_digest) DO UPDATE SET reason = 'deleted',
               blocked_until = CASE WHEN blocked_principals.blocked_until IS NULL OR EXCLUDED.blocked_until IS NULL THEN NULL
                                    ELSE greatest(blocked_principals.blocked_until, EXCLUDED.blocked_until) END`,
            [blocks.map((block) => block.digest), blocks.map((block) => block.until)],
          );
          principalsBlocked = blocked.rowCount;
        }
        for (const table of (await client.query(DIGEST_TABLES)).rows) {
          await client.query(`DELETE FROM ${client.escapeIdentifier(table.name)} WHERE principal_digest IN ${DIGESTS}`, [principalDigests]);
        }
        for (const table of (await client.query(OWNER_TABLES)).rows) {
          if (!table.follows_accounts) await client.query(`DELETE FROM ${client.escapeIdentifier(table.name)} WHERE account_id = ANY($1::uuid[])`, [accountIds]);
        }
        await client.query('DELETE FROM accounts WHERE id = ANY($1::uuid[])', [accountIds]);
        await client.query('COMMIT');
        return { principalsBlocked };
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw asOpsError(error, 'ERASURE_NOT_APPLIED');
      }
    }),

    // What must be gone: the accounts, every row in an account_id table, and
    // every row keyed by an erased alias's principal digest.
    ownerRows: (target, { accountIds, principalDigests = [] }) => withClient(target.database, async (client) => {
      const remaining = [];
      const accounts = await client.query('SELECT count(*)::int AS rows FROM accounts WHERE id = ANY($1::uuid[])', [accountIds]);
      if (accounts.rows[0].rows > 0) remaining.push({ table: 'accounts', rows: accounts.rows[0].rows });
      for (const table of (await client.query(OWNER_TABLES)).rows) {
        const count = await client.query(`SELECT count(*)::int AS rows FROM ${client.escapeIdentifier(table.name)} WHERE account_id = ANY($1::uuid[])`, [accountIds]);
        if (count.rows[0].rows > 0) remaining.push({ table: table.name, rows: count.rows[0].rows });
      }
      for (const table of (await client.query(DIGEST_TABLES)).rows) {
        const count = await client.query(`SELECT count(*)::int AS rows FROM ${client.escapeIdentifier(table.name)} WHERE principal_digest IN ${DIGESTS}`, [principalDigests]);
        if (count.rows[0].rows > 0 && !remaining.some((entry) => entry.table === table.name)) remaining.push({ table: table.name, rows: count.rows[0].rows });
      }
      return remaining;
    }),

    attachmentReferences: (target) => withClient(target.database, async (client) => {
      if (attachmentReferenceSql) {
        const rows = await client.query(attachmentReferenceSql);
        return rows.rows.map((row) => ({ account_id: String(row.account_id), ref: String(row.ref), ...(row.sha256 ? { sha256: String(row.sha256) } : {}) }));
      }
      const tables = await client.query(`SELECT to_regclass('public.attachments') IS NOT NULL OR to_regclass('public.transaction_attachments') IS NOT NULL AS present`);
      if (tables.rows[0].present) throw new OpsError('ATTACHMENT_VALIDATOR_MISSING');
      return null;
    }),

    databases,
  };
}

const ISSUER = 'https://auth.gogospend.invalid/';
const ATTACHMENT_REFS_SQL = 'SELECT account_id::text AS account_id, object_key AS ref, sha256 FROM rehearsal_attachment_refs';

/**
 * Synthetic data in a fresh migrated database: three accounts, each with an
 * Auth0 alias, a wallet, a category, three expenses, a queued job, a verified
 * provider-event receipt, a reconcile check and one retained-attachment
 * reference. `rehearsal_attachment_refs` stands in for P2c's attachment
 * tables (not built yet) and cascades from accounts.
 */
async function seedSyntheticSource(name) {
  await withClient(name, async (client) => {
    await migrate(drizzle(client), { migrationsFolder: join(REPO_ROOT, 'apps/api/drizzle') });
    await client.query(`CREATE TABLE rehearsal_attachment_refs (
      account_id uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
      object_key text PRIMARY KEY,
      sha256 text NOT NULL)`);
  });
  const people = {
    kept: { id: randomUUID(), subject: `apple|synthetic-kept-${randomBytes(4).toString('hex')}` },
    erased: { id: randomUUID(), subject: `apple|synthetic-erased-${randomBytes(4).toString('hex')}` },
    linked: { id: randomUUID(), subject: `auth0|synthetic-linked-${randomBytes(4).toString('hex')}` },
  };
  const objects = new Map();
  await withClient(name, async (client) => {
    for (const person of Object.values(people)) {
      const wallet = randomUUID();
      const category = randomUUID();
      await client.query('INSERT INTO accounts (id, created_at) VALUES ($1, now() - interval \'10 days\')', [person.id]);
      await client.query('INSERT INTO account_sync_state (account_id) VALUES ($1)', [person.id]);
      await client.query('INSERT INTO account_identities (issuer, subject, account_id, created_at) VALUES ($1, $2, $3, now() - interval \'10 days\')', [ISSUER, person.subject, person.id]);
      await client.query(`INSERT INTO wallets (account_id, id, name, opening_minor, tracking_start) VALUES ($1, $2, 'Synthetic wallet', 100000, DATE '2026-10-01')`, [person.id, wallet]);
      await client.query(`INSERT INTO categories (account_id, id, type, builtin_key) VALUES ($1, $2, 'expense', 'food')`, [person.id, category]);
      for (let index = 1; index <= 3; index += 1) {
        await client.query(
          `INSERT INTO transactions (account_id, id, type, amount_minor, occurred_on, wallet_id, category_id, note)
           VALUES ($1, $2, 'expense', $3, DATE '2026-10-10', $4, $5, 'synthetic rehearsal row')`,
          [person.id, randomUUID(), 1000 * index + 7, wallet, category],
        );
      }
      await client.query(`INSERT INTO jobs (id, kind, account_id, payload, max_attempts) VALUES ($1, 'export', $2, '{}'::jsonb, 3)`, [randomUUID(), person.id]);
      const ref = `receipt/${person.id}/${randomUUID()}.jpg`;
      const bytes = Buffer.concat([Buffer.from('synthetic jpeg '), randomBytes(512)]);
      objects.set(ref, bytes);
      await client.query('INSERT INTO rehearsal_attachment_refs (account_id, object_key, sha256) VALUES ($1, $2, $3)', [person.id, ref, createHash('sha256').update(bytes).digest('hex')]);
      await client.query(
        `INSERT INTO auth_event_receipts (event_id, source, type, principal_digest, occurred_at, outcome, account_id)
         VALUES ($1, 'event', 'password_changed', gogospend_principal_digest($2, $3), now() - interval '9 days', 'applied', $4)`,
        [`evt_${randomBytes(8).toString('hex')}`, ISSUER, person.subject, person.id],
      );
      await client.query(`INSERT INTO security_reconcile_checks (principal_digest, checked_at) VALUES (gogospend_principal_digest($1, $2), now())`, [ISSUER, person.subject]);
    }
  });
  return { people, objects };
}

const KEPT_DIGEST_SQL = `
  SELECT md5(coalesce(string_agg(row_text, '|' ORDER BY row_text), '')) AS digest FROM (
    SELECT 'a:' || a::text AS row_text FROM accounts a WHERE id = $1::uuid
    UNION ALL SELECT 'i:' || i::text FROM account_identities i WHERE account_id = $1::uuid
    UNION ALL SELECT 'w:' || w::text FROM wallets w WHERE account_id = $1::uuid
    UNION ALL SELECT 't:' || t::text FROM transactions t WHERE account_id = $1::uuid
    UNION ALL SELECT 'r:' || r::text FROM rehearsal_attachment_refs r WHERE account_id = $1::uuid
  ) rows`;

/**
 * End-to-end local rehearsal: back up a synthetic database (encrypted
 * stream), erase two accounts in the source (markers first, as P5 will), then
 * restore the pre-deletion backup into a fresh private database, reapply the
 * markers and prove the erased accounts' rows are absent, the kept account is
 * byte-identical and its attachment resolves. Also proves a tampered backup is
 * refused with no database left behind, and a serving target is refused.
 * Everything it creates is removed at the end.
 */
// `restoreRehearsal` is passed in by the CLI in restore-rehearsal.mjs (importing
// it here would deadlock on that module's top-level await).
export async function runLocalSyntheticRehearsal({ restoreRehearsal, keyFd, log = silentLog }) {
  if (typeof restoreRehearsal !== 'function') throw new OpsError('ARGUMENT_REFUSED');
  const suffix = randomBytes(5).toString('hex');
  const sourceName = `gogospend_rehearsal_src_${suffix}`;
  const restoreName = `gogospend_restore_${suffix}`;
  const tamperedName = `gogospend_restore_${suffix}t`;
  const recoveryDir = await mkdtemp(join(tmpdir(), 'gogospend-recovery-'));
  const sources = databaseRegistry();
  const restorer = localDockerRestorer({ attachmentReferenceSql: ATTACHMENT_REFS_SQL });
  const key = keyFd === undefined ? RecoveryKey.generate() : readRecoveryKeyFromFd(keyFd);
  const lookupKey = SubjectLookupKey.generate();
  try {
    await sources.create(sourceName);
    const { people, objects } = await seedSyntheticSource(sourceName);
    log.event('rehearsal_source_seeded', { accounts: 3 });
    const keptDigest = await withClient(sourceName, async (client) => (await client.query(KEPT_DIGEST_SQL, [people.kept.id])).rows[0].digest);

    const store = localRecoveryStore({ dir: recoveryDir });
    const ledger = localRestoreLedger({ dir: recoveryDir });
    const backup = await runDailyBackup({
      database: localDockerDump({ database: sourceName }), attachments: memoryAttachmentSource(objects),
      store, key, environment: 'non_production', synthetic: true, log,
    });

    // P5 order: durable markers first, then destructive cleanup in the source.
    const recordedAt = new Date().toISOString();
    const linkedBlockEnd = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const markers = [
      // No recorded block end: re-blocked with no end (see the P5 TODO).
      { marker_id: randomUUID(), account_id: people.erased.id, subject_lookups: [lookupKey.lookup(ISSUER, people.erased.subject)], lookup_key_id: lookupKey.id, recorded_at: recordedAt },
      // The alias was later linked into another account, which was then
      // erased; its marker records when P5 ends the block.
      { marker_id: randomUUID(), account_id: randomUUID(), subject_lookups: [lookupKey.lookup(ISSUER, people.linked.subject)], lookup_key_id: lookupKey.id, recorded_at: recordedAt, blocked_until: linkedBlockEnd },
      { marker_id: randomUUID(), account_id: randomUUID(), subject_lookups: [lookupKey.lookup(ISSUER, 'apple|synthetic-never-backed-up')], lookup_key_id: lookupKey.id, recorded_at: recordedAt },
    ];
    await withClient(sourceName, (client) => client.query('DELETE FROM accounts WHERE id = ANY($1::uuid[])', [[people.erased.id, people.linked.id]]));

    const registry = memoryMarkerSource({ markers, key: lookupKey });
    const target = (database) => ({ label: 'local-isolated-synthetic', kind: 'local-docker', environment: 'rehearsal', serving: false, isolated: true, host: '127.0.0.1', database });

    // Refusal before any connection: the dev database is a serving target.
    let servingRefused = false;
    try {
      await restoreRehearsal({ target: target('gogospend_v1'), restorer, store, recoveryKey: key, markers: registry, ledger });
    } catch (error) {
      servingRefused = error?.code === 'RESTORE_TARGET_SERVING';
    }

    const receipt = await restoreRehearsal({
      target: target(restoreName), restorer, store, backupId: backup.backup_id, recoveryKey: key, markers: registry, ledger, log,
      extraChecks: (restored) => withClient(restored.database, async (client) => {
        const digest = (await client.query(KEPT_DIGEST_SQL, [people.kept.id])).rows[0].digest;
        const blocked = await client.query(
          `SELECT count(*)::int AS n FROM blocked_principals WHERE reason = 'deleted' AND principal_digest = ANY(ARRAY[gogospend_principal_digest($1, $2), gogospend_principal_digest($1, $3)])`,
          [ISSUER, people.erased.subject, people.linked.subject],
        );
        const keptRows = await client.query('SELECT count(*)::int AS n FROM transactions WHERE account_id = $1::uuid', [people.kept.id]);
        const ends = await client.query(
          `SELECT principal_digest = gogospend_principal_digest($1, $2) AS erased, blocked_until FROM blocked_principals
            WHERE principal_digest IN (gogospend_principal_digest($1, $2), gogospend_principal_digest($1, $3))`,
          [ISSUER, people.erased.subject, people.linked.subject],
        );
        const endOf = (erased) => ends.rows.find((row) => row.erased === erased)?.blocked_until;
        const erasedIds = [people.erased.id, people.linked.id];
        const jobs = await client.query('SELECT count(*)::int AS n FROM jobs WHERE account_id = ANY($1::uuid[])', [erasedIds]);
        const digests = [principalDigest(ISSUER, people.erased.subject), principalDigest(ISSUER, people.linked.subject)];
        const digestRows = await client.query(
          `SELECT (SELECT count(*) FROM auth_event_receipts WHERE principal_digest IN ${DIGESTS})::int
                + (SELECT count(*) FROM security_reconcile_checks WHERE principal_digest IN ${DIGESTS})::int AS n`,
          [digests],
        );
        const keptReceipts = await client.query(`SELECT count(*)::int AS n FROM auth_event_receipts WHERE principal_digest = gogospend_principal_digest($1, $2)`, [ISSUER, people.kept.subject]);
        const access = await client.query(
          `SELECT has_database_privilege('public', current_database(), 'TEMPORARY') AS public_temp,
                  has_database_privilege('public', current_database(), 'CONNECT') AS public_connect,
                  coalesce((SELECT bool_or(has_database_privilege(r.oid, d.oid, 'CONNECT')) FROM pg_roles r, pg_database d
                             WHERE NOT r.rolsuper AND d.datname = current_database()), false) AS role_connect`,
        );
        return {
          kept_account_identical: digest === keptDigest,
          kept_transactions: keptRows.rows[0].n,
          erased_principals_blocked: blocked.rows[0].n,
          block_end_replayed: endOf(true) === null && endOf(false) instanceof Date && endOf(false).toISOString() === linkedBlockEnd,
          erased_jobs: jobs.rows[0].n,
          erased_digest_rows: digestRows.rows[0].n,
          kept_digest_rows: keptReceipts.rows[0].n,
          temp_revoked_from_public: access.rows[0].public_temp === false,
          connect_revoked_from_public: access.rows[0].public_connect === false,
          connect_revoked_from_app_roles: access.rows[0].role_connect === false,
        };
      }),
    });
    const restoreDropped = !(await sources.exists(restoreName));

    // A tampered copy is refused, and the private target it created is gone.
    const inventoryBefore = await new RecoveryInventory({ sources: [recoveryStoreSource(store), restoreLedgerSource(ledger)], skipped: HOSTED_INVENTORY_SKIPPED }).report();
    const dbFile = (await readdir(recoveryDir)).find((name) => name === `${backup.backup_id}.db.enc`);
    const bytes = await readFile(join(recoveryDir, dbFile));
    bytes[Math.floor(bytes.length / 2)] ^= 0x01;
    await writeFile(join(recoveryDir, dbFile), bytes);
    let tamperedCode = null;
    try {
      await restoreRehearsal({ target: target(tamperedName), restorer, store, backupId: backup.backup_id, recoveryKey: key, markers: registry, ledger, log });
    } catch (error) {
      tamperedCode = error?.code ?? null;
    }
    const tamperedAbsent = !(await sources.exists(tamperedName));

    const checks = {
      serving_target_refused: servingRefused,
      ...receipt.checks,
      restore_target_dropped: restoreDropped,
      tampered_backup_refused: tamperedCode === 'BACKUP_INTEGRITY',
      tampered_target_absent: tamperedAbsent,
    };
    const passed = checks.serving_target_refused && checks.kept_account_identical && checks.kept_transactions === 3
      && checks.erased_principals_blocked === 2 && checks.block_end_replayed && checks.erased_jobs === 0
      && checks.erased_digest_rows === 0 && checks.kept_digest_rows === 1
      && checks.temp_revoked_from_public && checks.connect_revoked_from_public && checks.connect_revoked_from_app_roles
      && checks.restore_target_dropped && checks.tampered_backup_refused && checks.tampered_target_absent
      && receipt.erased_owner_rows.length === 0 && receipt.missing_retained_objects.length === 0 && receipt.accounts_erased === 2;
    const result = {
      rehearsal: 'local-isolated-synthetic',
      passed,
      suffix,
      backup: { id: backup.backup_id, database_bytes: backup.database_bytes, attachment_objects: backup.attachment_objects, duration_ms: backup.duration_ms },
      receipt,
      checks,
      inventory: { complete: inventoryBefore.complete, copies: inventoryBefore.copies.map(({ id, kind, expires_at, created_at }) => ({ id, kind, created_at, expires_at })), skipped: inventoryBefore.skipped },
      measured: { scope: 'local Docker PostgreSQL 17, synthetic data; not a hosted RPO/RTO', backup_ms: backup.duration_ms, restore_total_ms: receipt.timings_ms.total },
      skipped: [
        'hosted PITR restore RPO <=1h / RTO <=4h (Neon, E1 not authorized)',
        'hosted daily-backup fallback RPO <=24h (Neon + R2 recovery scope, E1 not authorized)',
        'R2 accepted-attachment copy and 7-day lifecycle rule (E1, P2c)',
        'hosted erasure registry in the R2 recovery-control scope (E1, P5)',
        'hosted inventory sources: neon-history, neon-branches, neon-snapshots, r2-recovery-objects',
      ],
    };
    if (!passed) throw Object.assign(new OpsError('REHEARSAL_CHECK_FAILED', { checks }), { result });
    return result;
  } finally {
    await sources.drop(sourceName).catch(() => undefined);
    await restorer.databases.drop(restoreName).catch(() => undefined);
    await restorer.databases.drop(tamperedName).catch(() => undefined);
    await rm(recoveryDir, { recursive: true, force: true });
  }
}
