import type { SqlConnection, SqlDatabase, SqlExecutor, SqlValue } from './types.ts';

/**
 * Every diary operation goes through one keyed connection, one at a time:
 * transactions are BEGIN IMMEDIATE ... COMMIT on that same connection (never
 * a second, unkeyed one), plain statements queue behind them, and a read unit
 * (BEGIN ... COMMIT) sees one consistent state. A failed statement or COMMIT
 * rolls back and reports the original error even if the ROLLBACK fails. A
 * transaction handle is dead once its transaction ends. Inside a unit, use
 * only its handle: calling the database itself there would wait forever.
 */
export function createSerialDatabase(connection: SqlConnection): SqlDatabase {
  let queue: Promise<unknown> = Promise.resolve();
  let closed = false;

  const serial = <T>(task: () => Promise<T>): Promise<T> => {
    const next = queue.then(() => {
      if (closed) throw new Error('The diary database is closed.');
      return task();
    });
    queue = next.catch(() => undefined);
    return next;
  };

  const handle = (state: { active: boolean }): SqlExecutor => {
    const live = () => {
      if (!state.active) throw new Error('This transaction has ended.');
    };
    return {
      exec: async (sql) => (live(), connection.exec(sql)),
      run: async (sql, params) => (live(), connection.run(sql, params)),
      all: async <T>(sql: string, params?: readonly SqlValue[]) => (live(), connection.all<T>(sql, params)),
    };
  };

  const unit = <T>(begin: string, fn: (tx: SqlExecutor) => Promise<T>): Promise<T> =>
    serial(async () => {
      const state = { active: true };
      await connection.exec(begin);
      try {
        const result = await fn(handle(state));
        await connection.exec('COMMIT');
        return result;
      } catch (error) {
        await connection.exec('ROLLBACK').catch(() => undefined);
        throw error;
      } finally {
        state.active = false;
      }
    });

  return {
    exec: (sql) => serial(() => connection.exec(sql)),
    run: (sql, params) => serial(() => connection.run(sql, params)),
    all: <T>(sql: string, params?: readonly SqlValue[]) => serial(() => connection.all<T>(sql, params)),
    transaction: (fn) => unit('BEGIN IMMEDIATE', fn),
    read: (fn) => unit('BEGIN', fn),
    close: () => {
      const next = queue.then(async () => {
        if (closed) return;
        closed = true;
        await connection.close();
      });
      queue = next.catch(() => undefined);
      return next;
    },
  };
}
