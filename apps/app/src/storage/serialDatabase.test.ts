import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createSerialDatabase } from './serialDatabase.ts';
import type { SqlConnection } from './types.ts';

/** One fake connection that logs every statement, each taking a tick. */
function fakeConnection(fail: (sql: string) => boolean = () => false) {
  const log: string[] = [];
  const step = async (sql: string) => {
    await new Promise((resolve) => setTimeout(resolve, 1));
    log.push(sql);
    if (fail(sql)) throw new Error(`failed: ${sql}`);
  };
  const connection: SqlConnection = {
    exec: async (sql) => step(sql),
    run: async (sql) => (await step(sql), 1),
    all: async <T>(sql: string) => (await step(sql), [] as T[]),
    close: async () => void log.push('CLOSE'),
  };
  return { log, connection };
}

test('a transaction runs every statement on the one keyed connection, between BEGIN IMMEDIATE and COMMIT', async () => {
  const { log, connection } = fakeConnection();
  const db = createSerialDatabase(connection);
  await db.transaction(async (tx) => {
    await tx.run('INSERT a');
    await tx.all('SELECT b');
  });
  assert.deepEqual(log, ['BEGIN IMMEDIATE', 'INSERT a', 'SELECT b', 'COMMIT']);
});

test('concurrent transactions and plain statements never interleave', async () => {
  const { log, connection } = fakeConnection();
  const db = createSerialDatabase(connection);
  await Promise.all([
    db.transaction(async (tx) => {
      await tx.run('a1');
      await tx.run('a2');
    }),
    db.run('plain'),
    db.transaction(async (tx) => {
      await tx.run('b1');
    }),
    db.read(async (tx) => {
      await tx.all('r1');
      await tx.all('r2');
    }),
  ]);
  assert.deepEqual(log, ['BEGIN IMMEDIATE', 'a1', 'a2', 'COMMIT', 'plain', 'BEGIN IMMEDIATE', 'b1', 'COMMIT', 'BEGIN', 'r1', 'r2', 'COMMIT']);
});

test('a failure rolls back and reports the original error, even if the rollback fails too', async () => {
  const { log, connection } = fakeConnection((sql) => sql === 'ROLLBACK');
  const db = createSerialDatabase(connection);
  await assert.rejects(db.transaction(async (tx) => {
    await tx.run('a1');
    throw new Error('original');
  }), /original/);
  assert.deepEqual(log, ['BEGIN IMMEDIATE', 'a1', 'ROLLBACK']);
  // The connection stays usable afterwards.
  await db.run('after');
  assert.equal(log.at(-1), 'after');
});

test('a failed COMMIT rolls back', async () => {
  const { log, connection } = fakeConnection((sql) => sql === 'COMMIT');
  const db = createSerialDatabase(connection);
  await assert.rejects(db.transaction(async (tx) => tx.run('a1')), /failed: COMMIT/);
  assert.deepEqual(log, ['BEGIN IMMEDIATE', 'a1', 'COMMIT', 'ROLLBACK']);
});

test('a transaction handle cannot be used after it ended, and a closed database refuses work', async () => {
  const { connection } = fakeConnection();
  const db = createSerialDatabase(connection);
  let escaped: { run(sql: string): Promise<number> } | undefined;
  await db.transaction(async (tx) => {
    escaped = tx;
  });
  await assert.rejects((escaped as { run(sql: string): Promise<number> }).run('late'), /ended/);
  await db.close();
  await assert.rejects(db.run('x'), /closed/);
});
