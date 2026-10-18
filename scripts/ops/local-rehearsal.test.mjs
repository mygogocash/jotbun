// P6a: the end-to-end rehearsal against the loopback Docker PostgreSQL 17,
// so the SQL erasure paths (alias re-blocking, deletes from tables that do not
// follow accounts, principal-digest tables) and the private-target grants run
// in the gate. It creates and drops only its own `gogospend_rehearsal_src_*`
// and `gogospend_restore_*` databases. If the local server is unreachable the
// test is skipped with that reason, unless GOGOSPEND_OPS_REQUIRE_DB=1 makes it
// a failure.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import pg from 'pg';

import { runLocalSyntheticRehearsal } from './local-postgres.mjs';
import { restoreRehearsal } from './restore-rehearsal.mjs';

const ADMIN_URL = process.env.GOGOSPEND_TEST_ADMIN_URL ?? 'postgres://gogospend_local_admin:gogospend-local-only@127.0.0.1:55432/postgres';

async function localServerReachable() {
  const client = new pg.Client({ connectionString: ADMIN_URL, connectionTimeoutMillis: 2000 });
  client.on('error', () => undefined);
  try {
    await client.connect();
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function leftovers() {
  const client = new pg.Client({ connectionString: ADMIN_URL });
  client.on('error', () => undefined);
  await client.connect();
  try {
    const rows = await client.query(`SELECT datname FROM pg_database WHERE datname LIKE 'gogospend_rehearsal_src_%' OR datname LIKE 'gogospend_restore_%'`);
    return rows.rows.map((row) => row.datname);
  } finally {
    await client.end();
  }
}

test('local rehearsal: erased accounts stay erased in a private restored copy', async (t) => {
  if (!(await localServerReachable())) {
    if (process.env.GOGOSPEND_OPS_REQUIRE_DB === '1') assert.fail('local PostgreSQL on 127.0.0.1:55432 is unreachable');
    t.skip('local PostgreSQL on 127.0.0.1:55432 is unreachable; start it with `npm run db:v1:up` (or set GOGOSPEND_OPS_REQUIRE_DB=1 to fail instead)');
    return;
  }
  const result = await runLocalSyntheticRehearsal({ restoreRehearsal });
  const { receipt, checks } = result;
  assert.equal(result.passed, true);
  assert.deepEqual(receipt.erased_owner_rows, []);
  assert.deepEqual(receipt.missing_retained_objects, []);
  assert.equal(receipt.accounts_erased, 3);
  // P2c's real reference query: the kept account's retained receipts - one held
  // by an active record, one by a record deleted within its undo window - are
  // in the copy; its released receipt (object gone) is not a reference, and the
  // erased accounts' receipt objects are not restored.
  assert.equal(receipt.attachments.schema_has_references, true);
  assert.equal(receipt.attachments.references_checked, 2);
  assert.equal(receipt.attachments.objects_in_copy, 5);
  assert.equal(receipt.attachments.unreferenced_objects_not_restored, 3);
  // P5: the in-progress erasure (marker without purged_at) and the copy's own
  // accepted-but-unmarked deletion are re-queued with their aliases captured
  // and holds left open; the purged one is replayed, not re-queued.
  assert.equal(receipt.erasures_requeued, 2);
  assert.equal(checks.requeued_erasures, true);
  assert.equal(checks.requeued_holds_open, true);
  // Alias re-blocking (one marker records a block end, one does not).
  assert.equal(checks.erased_principals_blocked, 2);
  assert.equal(checks.block_end_replayed, true);
  // Deletes from tables that do not follow accounts (jobs).
  assert.equal(checks.erased_jobs, 0);
  // Principal-digest rows: event receipts (account link NULLed) and reconcile checks.
  assert.equal(checks.erased_digest_rows, 0);
  assert.equal(checks.kept_digest_rows, 1);
  // The restored copy was private while it held un-erased rows.
  assert.equal(checks.connect_revoked_from_public, true);
  assert.equal(checks.connect_revoked_from_app_roles, true);
  assert.equal(checks.temp_revoked_from_public, true);
  assert.equal(checks.kept_account_identical, true);
  assert.equal(checks.serving_target_refused, true);
  assert.equal(checks.tampered_backup_refused, true);
  assert.equal(checks.tampered_target_absent, true);
  assert.equal(checks.restore_target_dropped, true);
  const remaining = await leftovers();
  assert.ok(!remaining.some((name) => name.endsWith(result.suffix) || name.endsWith(`${result.suffix}t`)), 'a rehearsal database was left behind');
});
