import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { getTableConfig } from 'drizzle-orm/pg-core';
import { Client } from 'pg';

import { GROUP_ROLES, createTestDatabase } from '../testing/postgres-harness';
import type { GroupRole, TestDatabase } from '../testing/postgres-harness';
import { poolConfigFromUrl } from './database-config';
import { MIGRATIONS_FOLDER, readJournal, runMigrations } from './migrations';
import { accountIdentities, accountSyncState, accounts, authSessions, blockedPrincipals, consents, policyVersions, rateLimitBuckets, reauthChallenges, jobs, commandReceipts, entityChanges, entityHeads, auditEvents, wallets, categories, transactions } from './schema';

const ISSUER = 'https://gogospend-test.example/';
const ACCOUNT_A = '0192f0c1-7b3a-7c3e-9d4f-00000000000a';

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
  await db.admin(async (client) => {
    await client.query('INSERT INTO accounts (id) VALUES ($1)', [ACCOUNT_A]);
    await client.query('INSERT INTO account_sync_state (account_id) VALUES ($1)', [ACCOUNT_A]);
    await client.query('INSERT INTO account_identities (issuer, subject, account_id) VALUES ($1, $2, $3)', [ISSUER, 'auth0|a', ACCOUNT_A]);
  });
});

afterAll(async () => {
  await db?.drop();
});

async function schemaSnapshot(): Promise<unknown> {
  return db.admin(async (client) => {
    const columns = await client.query(
      `SELECT table_name, column_name, data_type, is_nullable, column_default
         FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, column_name`,
    );
    const policies = await client.query('SELECT tablename, policyname, roles, cmd, qual, with_check FROM pg_policies ORDER BY tablename, policyname');
    const grants = await client.query(
      `SELECT grantee, table_name, privilege_type FROM information_schema.role_table_grants
        WHERE table_schema = 'public' ORDER BY grantee, table_name, privilege_type`,
    );
    const routines = await client.query(
      `SELECT proname, prosecdef, proconfig FROM pg_proc WHERE proname LIKE 'gogospend\\_%' ORDER BY proname`,
    );
    const applied = await client.query('SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at');
    return { columns: columns.rows, policies: policies.rows, grants: grants.rows, routines: routines.rows, applied: applied.rows };
  });
}

describe('migrations', () => {
  it('the harness creates and migrates a disposable loopback database', async () => {
    const applied = await db.admin((client) => client.query<{ n: number }>('SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations'));
    expect(applied.rows[0].n).toBe(readJournal().length);
    expect(db.name).toMatch(/^gogospend_test_/);
  });

  it('a repeated migration run changes nothing', async () => {
    const before = await schemaSnapshot();
    await runMigrations(db.adminUrl);
    expect(await schemaSnapshot()).toEqual(before);
  });

  it('refuses to continue when an applied migration file was edited', async () => {
    const [{ hash }] = (await db.admin((client) => client.query<{ hash: string }>('SELECT hash FROM drizzle.__drizzle_migrations LIMIT 1'))).rows;
    await db.admin((client) => client.query(`UPDATE drizzle.__drizzle_migrations SET hash = 'different'`));
    try {
      await expect(runMigrations(db.adminUrl)).rejects.toThrow(/was edited after it ran/);
    } finally {
      await db.admin((client) => client.query('UPDATE drizzle.__drizzle_migrations SET hash = $1', [hash]));
    }
  });

  it('creating the shared group roles from two databases at once does not race', async () => {
    // Run 0001's role block concurrently in two fresh databases with a
    // throwaway role name, as two parallel test suites or environments would.
    const roleBlock = readFileSync(join(MIGRATIONS_FOLDER, '0001_identity.sql'), 'utf8')
      .split('--> statement-breakpoint')[0]
      .replace(/ARRAY\['gogospend_app'[^\]]*\]/, `ARRAY['gogospend_race_probe']`);
    expect(roleBlock).toContain('gogospend_race_probe');
    const [one, two] = [await createTestDatabase(), await createTestDatabase()];
    const a = new Client(poolConfigFromUrl(one.adminUrl, 1));
    const b = new Client(poolConfigFromUrl(two.adminUrl, 1));
    await a.connect();
    await b.connect();
    try {
      await a.query('BEGIN');
      await b.query('BEGIN');
      await a.query(roleBlock);
      const second = b.query(roleBlock);
      await new Promise((resolve) => setTimeout(resolve, 300));
      await a.query('COMMIT');
      await expect(second).resolves.toBeDefined();
      await b.query('COMMIT');
    } finally {
      await a.end();
      await b.end();
      await one.drop();
      await two.drop();
      await db.admin((client) => client.query('DROP ROLE IF EXISTS gogospend_race_probe'));
    }
  });

  it('no gogospend routine is executable by PUBLIC', async () => {
    const result = await db.admin((client) =>
      client.query(
        `SELECT p.proname FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
          WHERE p.proname LIKE 'gogospend\\_%' AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'`,
      ),
    );
    expect(result.rows).toEqual([]);
  });

  it('new functions are not executable by PUBLIC by default', async () => {
    await db.admin((client) => client.query('CREATE FUNCTION later_routine() RETURNS int LANGUAGE sql AS $$ SELECT 1 $$'));
    const result = await db.admin((client) => client.query(`SELECT has_function_privilege('gogospend_app', 'later_routine()', 'EXECUTE') AS allowed`));
    await db.admin((client) => client.query('DROP FUNCTION later_routine()'));
    expect(result.rows[0].allowed).toBe(false);
  });

  it('Drizzle definitions match the migrated columns', async () => {
    for (const table of [accounts, accountIdentities, accountSyncState, rateLimitBuckets, policyVersions, consents, blockedPrincipals, reauthChallenges, authSessions, jobs, commandReceipts, entityChanges, entityHeads, auditEvents, wallets, categories, transactions]) {
      const config = getTableConfig(table);
      const result = await db.admin((client) =>
        client.query<{ column_name: string; is_nullable: string }>(
          `SELECT column_name, is_nullable FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = $1 ORDER BY column_name`,
          [config.name],
        ),
      );
      const fromDatabase = result.rows.map((row) => [row.column_name, row.is_nullable === 'NO']);
      const fromDrizzle = config.columns.map((column) => [column.name, column.notNull]).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
      expect(fromDatabase).toEqual(fromDrizzle);
    }
  });
});

describe('role isolation', () => {
  it('group roles are not owners, superusers, BYPASSRLS or logins, and every table enforces RLS', async () => {
    const roles = await db.admin((client) =>
      client.query('SELECT rolname, rolsuper, rolbypassrls, rolcanlogin FROM pg_roles WHERE rolname = ANY($1) ORDER BY rolname', [[...GROUP_ROLES]]),
    );
    expect(roles.rows).toEqual(GROUP_ROLES.map((rolname) => ({ rolname, rolsuper: false, rolbypassrls: false, rolcanlogin: false })).sort((a, b) => a.rolname.localeCompare(b.rolname)));
    const tables = await db.admin((client) => client.query<{ tableowner: string; rowsecurity: boolean }>(`SELECT tableowner, rowsecurity FROM pg_tables WHERE schemaname = 'public'`));
    expect(tables.rows.length).toBeGreaterThan(0);
    for (const table of tables.rows) {
      expect(GROUP_ROLES).not.toContain(table.tableowner);
      expect(table.rowsecurity).toBe(true);
    }
  });

  it.each<GroupRole>(['gogospend_bootstrap', 'gogospend_jobs', 'gogospend_security'])('%s cannot read account or identity rows directly', async (role) => {
    const pool = await db.loginPool([role]);
    for (const table of ['accounts', 'account_identities', 'account_sync_state']) {
      await expect(pool.query(`SELECT * FROM ${table}`)).rejects.toMatchObject({ code: '42501' });
    }
  });

  it('bootstrap resolves a principal only through the restricted routine', async () => {
    const pool = await db.loginPool(['gogospend_bootstrap']);
    const known = await pool.query('SELECT gogospend_resolve_principal($1, $2) AS account_id', [ISSUER, 'auth0|a']);
    const unknown = await pool.query('SELECT gogospend_resolve_principal($1, $2) AS account_id', [ISSUER, 'auth0|nobody']);
    expect(known.rows[0].account_id).toBe(ACCOUNT_A);
    expect(unknown.rows[0].account_id).toBeNull();
  });

  it('the routine ignores a caller-controlled search_path', async () => {
    await db.admin(async (client) => {
      await client.query('CREATE SCHEMA decoy');
      await client.query('CREATE TABLE decoy.account_identities (issuer text, subject text, account_id uuid)');
      await client.query(`INSERT INTO decoy.account_identities VALUES ($1, 'auth0|a', '0192f0c1-7b3a-7c3e-9d4f-0000000000ff')`, [ISSUER]);
      await client.query('GRANT USAGE ON SCHEMA decoy TO gogospend_bootstrap');
    });
    const pool = await db.loginPool(['gogospend_bootstrap'], 1);
    const client = await pool.connect();
    try {
      await client.query('SET search_path = decoy, public');
      const resolved = await client.query('SELECT gogospend_resolve_principal($1, $2) AS account_id', [ISSUER, 'auth0|a']);
      expect(resolved.rows[0].account_id).toBe(ACCOUNT_A);
    } finally {
      client.release();
      await db.admin((admin) => admin.query('DROP SCHEMA decoy CASCADE'));
    }
  });

  it('the app role cannot call the bootstrap routine', async () => {
    const pool = await db.loginPool(['gogospend_app']);
    await expect(pool.query('SELECT gogospend_resolve_principal($1, $2)', [ISSUER, 'auth0|a'])).rejects.toMatchObject({ code: '42501' });
  });
});
