import type { SessionContext } from '@gogospend/contracts';
import { Client } from 'pg';
import type { Pool } from 'pg';

import { createTestDatabase } from '../testing/postgres-harness';
import type { TestDatabase } from '../testing/postgres-harness';
import { poolConfigFromUrl } from './database-config';
import { DatabaseService } from './database.service';
import { AccountNotFoundError, lockAccount } from './owner-transaction';
import type { OwnerTx } from './owner-transaction';

const ISSUER = 'https://gogospend-test.example/';
const ACCOUNT_A = '0192f0c1-7b3a-7c3e-9d4f-00000000000a';
const ACCOUNT_B = '0192f0c1-7b3a-7c3e-9d4f-00000000000b';

function ctx(accountId: string): SessionContext {
  return { accountId, subject: `auth0|${accountId}`, clientId: 'test-client', bindingId: 'test-binding', sessionGeneration: 0 };
}

let db: TestDatabase;
let appPool: Pool;
let service: DatabaseService;

beforeAll(async () => {
  db = await createTestDatabase();
  await db.admin(async (client) => {
    for (const [id, subject] of [[ACCOUNT_A, 'auth0|a'], [ACCOUNT_B, 'auth0|b']]) {
      await client.query('INSERT INTO accounts (id) VALUES ($1)', [id]);
      await client.query('INSERT INTO account_sync_state (account_id, revision) VALUES ($1, 7)', [id]);
      await client.query('INSERT INTO account_identities (issuer, subject, account_id) VALUES ($1, $2, $3)', [ISSUER, subject, id]);
    }
  });
  // One connection, so every request below reuses the same pooled session.
  appPool = await db.loginPool(['gogospend_app'], 1);
  service = new DatabaseService(appPool);
});

afterAll(async () => {
  await db?.drop();
});

const identitiesOf = (tx: OwnerTx) => tx.query<{ account_id: string }>('SELECT account_id FROM account_identities ORDER BY account_id');

describe('owner transactions', () => {
  it('pool_reuse_does_not_inherit_owner', async () => {
    const seenByA = await service.withOwnerTransaction(ctx(ACCOUNT_A), identitiesOf);
    expect(seenByA).toEqual([{ account_id: ACCOUNT_A }]);
    const afterA = await appPool.query('SELECT account_id FROM account_identities');
    expect(afterA.rows).toEqual([]);
    const seenByB = await service.withOwnerTransaction(ctx(ACCOUNT_B), identitiesOf);
    const rowsForOtherOwner = seenByB.filter((row) => row.account_id === ACCOUNT_A);
    expect(rowsForOtherOwner).toEqual([]);
  });

  it('missing owner context sees no private row', async () => {
    for (const table of ['accounts', 'account_identities', 'account_sync_state']) {
      expect((await appPool.query(`SELECT * FROM ${table}`)).rows).toEqual([]);
    }
  });

  it('an owner context cannot read another account', async () => {
    const rows = await service.withOwnerTransaction(ctx(ACCOUNT_A), (tx) => tx.query('SELECT id FROM accounts WHERE id = $1', [ACCOUNT_B]));
    expect(rows).toEqual([]);
  });

  it('a forged cross-owner write changes nothing (no identity insert grant; RLS hides the other lock row)', async () => {
    await expect(
      service.withOwnerTransaction(ctx(ACCOUNT_A), (tx) =>
        tx.query('INSERT INTO account_identities (issuer, subject, account_id) VALUES ($1, $2, $3)', [ISSUER, 'auth0|forged', ACCOUNT_B]),
      ),
    ).rejects.toMatchObject({ code: '42501' });
    const updated = await service.withOwnerTransaction(ctx(ACCOUNT_A), (tx) =>
      tx.query('UPDATE account_sync_state SET revision = revision + 1 WHERE account_id = $1 RETURNING account_id', [ACCOUNT_B]),
    );
    expect(updated).toEqual([]);
    const revisionB = await db.admin((client) => client.query('SELECT revision FROM account_sync_state WHERE account_id = $1', [ACCOUNT_B]));
    expect(revisionB.rows[0].revision).toBe('7');
  });

  it('lockAccount reads state under the lock and serializes a second locker', async () => {
    let releaseFirst!: () => void;
    const firstHolds = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const lockPool = await db.loginPool(['gogospend_app'], 2);
    const lockService = new DatabaseService(lockPool);
    let firstLocked!: () => void;
    const firstHasLock = new Promise<void>((resolve) => { firstLocked = resolve; });
    const first = lockService.withOwnerTransaction(ctx(ACCOUNT_A), async (tx) => {
      const state = await lockAccount(tx, ACCOUNT_A);
      firstLocked();
      await firstHolds;
      return state;
    });
    await firstHasLock;
    let secondDone = false;
    const second = lockService.withOwnerTransaction(ctx(ACCOUNT_A), (tx) => lockAccount(tx, ACCOUNT_A)).then((state) => {
      secondDone = true;
      return state;
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(secondDone).toBe(false);
    releaseFirst();
    const [firstState, secondState] = await Promise.all([first, second]);
    expect(firstState).toEqual({ status: 'active', sessionGeneration: 0, lifecycleGeneration: 0, reauthAfter: null, revision: '7' });
    expect(secondState).toEqual(firstState);
  });

  it('a waiter sees account state that was committed while it waited for the lock', async () => {
    const lockService = new DatabaseService(await db.loginPool(['gogospend_app'], 1));
    const deleter = new Client(poolConfigFromUrl(db.adminUrl, 1));
    await deleter.connect();
    try {
      // A deletion/logout transaction takes the lock first and changes state under it.
      await deleter.query('BEGIN');
      await deleter.query('SELECT 1 FROM account_sync_state WHERE account_id = $1 FOR UPDATE', [ACCOUNT_B]);
      await deleter.query(`UPDATE accounts SET status = 'deleting', session_generation = session_generation + 1 WHERE id = $1`, [ACCOUNT_B]);
      await deleter.query('UPDATE account_sync_state SET revision = revision + 1 WHERE account_id = $1', [ACCOUNT_B]);
      const waiter = lockService.withOwnerTransaction(ctx(ACCOUNT_B), (tx) => lockAccount(tx, ACCOUNT_B));
      await new Promise((resolve) => setTimeout(resolve, 200));
      await deleter.query('COMMIT');
      await expect(waiter).resolves.toMatchObject({ status: 'deleting', sessionGeneration: 1, revision: '8' });
    } finally {
      await deleter.query(`UPDATE accounts SET status = 'active', session_generation = 0 WHERE id = $1`, [ACCOUNT_B]);
      await deleter.query('UPDATE account_sync_state SET revision = 7 WHERE account_id = $1', [ACCOUNT_B]);
      await deleter.end();
    }
  });

  it('a connection that dies mid-transaction rejects the call without crashing the process', async () => {
    const pool = await db.loginPool(['gogospend_app'], 1);
    const fragile = new DatabaseService(pool);
    await expect(
      fragile.withOwnerTransaction(ctx(ACCOUNT_A), async (tx) => {
        const [{ pid }] = await tx.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
        await db.admin((client) => client.query('SELECT pg_terminate_backend($1)', [pid]));
        await new Promise((resolve) => setTimeout(resolve, 200));
        return 'finished';
      }),
    ).rejects.toThrow();
    await expect(fragile.withOwnerTransaction(ctx(ACCOUNT_A), (tx) => tx.query('SELECT 1 AS ok'))).resolves.toEqual([{ ok: 1 }]);
  });

  it.each([';COMMIT', ';;ROLLBACK', '/* /* nested */ */ COMMIT'])('detects a transaction ended early by %p', async (statement) => {
    await expect(service.withOwnerTransaction(ctx(ACCOUNT_A), (tx) => tx.query(statement))).rejects.toThrow();
  });

  it('detects an owner switch made inside the transaction before it commits', async () => {
    await expect(
      service.withOwnerTransaction(ctx(ACCOUNT_A), async (tx) => {
        await tx.query('SELECT set_config($1, $2, true)', ['gogospend.account_id', ACCOUNT_B]);
        return tx.query('SELECT account_id FROM account_identities');
      }),
    ).rejects.toThrow(/integrity/);
  });

  it('never reuses a connection whose session-level owner was changed', async () => {
    const backend = (tx: OwnerTx) => tx.query<{ pid: number }>('SELECT pg_backend_pid() AS pid').then((rows) => rows[0].pid);
    const poisoned = await service.withOwnerTransaction(ctx(ACCOUNT_A), async (tx) => {
      // Session-level (is_local = false): survives COMMIT unless the connection is dropped.
      await tx.query(`DO $$ BEGIN PERFORM set_config(concat('gogo', 'spend.account_id'), '${ACCOUNT_A}', false); END $$`);
      return backend(tx);
    });
    const healthy = await service.withOwnerTransaction(ctx(ACCOUNT_A), backend);
    const reused = await service.withOwnerTransaction(ctx(ACCOUNT_A), backend);
    expect(healthy).not.toBe(poisoned);
    expect(reused).toBe(healthy);
    expect((await appPool.query('SELECT account_id FROM account_identities')).rows).toEqual([]);
  });

  it('the app role cannot create a temporary table that shadows the lock row', async () => {
    await expect(
      service.withOwnerTransaction(ctx(ACCOUNT_A), (tx) => tx.query('CREATE TEMP TABLE account_sync_state (account_id uuid, revision bigint)')),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('lockAccount refuses an account other than the transaction owner', async () => {
    await expect(service.withOwnerTransaction(ctx(ACCOUNT_A), (tx) => lockAccount(tx, ACCOUNT_B))).rejects.toBeInstanceOf(AccountNotFoundError);
  });

  it('a failed transaction rolls back and leaves the connection reusable', async () => {
    await expect(
      service.withOwnerTransaction(ctx(ACCOUNT_A), async (tx) => {
        await tx.query('UPDATE account_sync_state SET revision = revision + 1 WHERE account_id = $1', [ACCOUNT_A]);
        throw new Error('mutation failed');
      }),
    ).rejects.toThrow('mutation failed');
    const state = await service.withOwnerTransaction(ctx(ACCOUNT_A), (tx) => lockAccount(tx, ACCOUNT_A));
    expect(state.revision).toBe('7');
  });

  it('a transaction handle is unusable after its transaction completes', async () => {
    let leaked!: OwnerTx;
    await service.withOwnerTransaction(ctx(ACCOUNT_A), async (tx) => { leaked = tx; });
    await expect(leaked.query('SELECT 1')).rejects.toThrow(/after its transaction completed/);
    expect(() => leaked.db).toThrow(/after its transaction completed/);
  });

  it.each([
    'COMMIT',
    '  /* sneaky */ commit',
    '-- note\nROLLBACK',
    'SET ROLE gogospend_jobs',
    `SELECT set_config('gogospend.account_id', '${ACCOUNT_B}', true)`,
  ])('refuses %p inside an owner transaction', async (statement) => {
    await expect(service.withOwnerTransaction(ctx(ACCOUNT_A), (tx) => tx.query(statement))).rejects.toThrow(/transaction-control or context/);
  });

  it('refuses a second statement appended to an allowed one', async () => {
    await expect(service.withOwnerTransaction(ctx(ACCOUNT_A), (tx) => tx.query('SELECT 1; COMMIT'))).rejects.toMatchObject({ code: '42601' });
  });

  it('refuses a non-canonical account id before touching the database', async () => {
    await expect(service.withOwnerTransaction(ctx('not-a-uuid'), async () => 'ran')).rejects.toThrow(/canonical account UUID/);
  });
});
