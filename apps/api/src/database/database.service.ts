import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import type { OnModuleDestroy } from '@nestjs/common';
import { isUuid } from '@gogospend/contracts';
import type { SessionContext } from '@gogospend/contracts';
import type { Pool, QueryResult } from 'pg';

import { assertLoginRoles } from '../jobs/worker-login';
import { OwnerTx } from './owner-transaction';

export const PG_POOL = Symbol('PG_POOL');

// Set while an owner transaction's callback runs. A second owner transaction
// started from inside it would run on another connection: it would wait on
// the account lock the outer one holds, or commit independently of it.
const insideOwnerTransaction = new AsyncLocalStorage<true>();

// Transaction-local bounds so a stuck request cannot hold the account lock.
const STATEMENT_TIMEOUT = '15s';
const IDLE_IN_TRANSACTION_TIMEOUT = '30s';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /**
   * Runs `fn` in one transaction on one pinned connection with the owner
   * context set transaction-locally, so it cannot leak to the next request
   * that reuses the connection. Commits once on success and rolls back on any
   * error. Before COMMIT the database confirms it is still the same
   * transaction with the same owner and role; after COMMIT a connection that
   * kept any session-level owner or role is discarded instead of reused.
   */
  async withOwnerTransaction<T>(ctx: SessionContext, fn: (tx: OwnerTx) => Promise<T>, options: { snapshot?: boolean } = {}): Promise<T> {
    if (!isUuid(ctx.accountId)) throw new Error('Owner transaction needs a canonical account UUID.');
    if (insideOwnerTransaction.getStore()) throw new Error('Owner transactions cannot be nested.');
    // Both values are inlined into simple-protocol batches below, so they are
    // validated (canonical UUID) or generated (hex) here, never caller text.
    const accountId = ctx.accountId;
    const token = randomBytes(16).toString('hex');
    const client = await this.pool.connect();
    let discard = false;
    // While checked out, the pool does not listen for connection errors; a
    // server-side disconnect between queries must not crash the process.
    const onConnectionError = () => {
      discard = true;
    };
    client.on('error', onConnectionError);
    const tx = new OwnerTx(client, accountId);
    // Writes run READ COMMITTED (each statement after the account lock sees
    // the previous holder's commit). `snapshot` reads (history, summaries)
    // run REPEATABLE READ READ ONLY, so rows, totals and the revision they
    // report all come from one view.
    const begin = options.snapshot ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN ISOLATION LEVEL READ COMMITTED';
    try {
      await client.query(
        `${begin};
         SELECT set_config('gogospend.account_id', '${accountId}', true),
                set_config('gogospend.tx_token', '${token}', true),
                set_config('statement_timeout', '${STATEMENT_TIMEOUT}', true),
                set_config('DateStyle', 'ISO, YMD', true),
                set_config('idle_in_transaction_session_timeout', '${IDLE_IN_TRANSACTION_TIMEOUT}', true)`,
      );
      const result = await insideOwnerTransaction.run(true, () => fn(tx));
      tx.close();
      let finished: QueryResult[];
      try {
        // One round trip: verify, commit, then inspect what the session kept.
        finished = (await client.query(
          `SELECT gogospend_assert_owner_tx('${token}', '${accountId}');
           COMMIT;
           SELECT current_setting('gogospend.account_id', true) AS owner_after, current_user = session_user AS same_role`,
        )) as unknown as QueryResult[];
      } catch (error) {
        discard = true;
        throw error;
      }
      const after = finished[2]?.rows[0] as { owner_after: string | null; same_role: boolean } | undefined;
      if (!after || (after.owner_after ?? '') !== '' || !after.same_role) discard = true;
      return result;
    } catch (error) {
      tx.close();
      if (!discard) {
        try {
          await client.query('ROLLBACK');
        } catch {
          discard = true;
        }
      }
      throw error;
    } finally {
      client.removeListener('error', onConnectionError);
      // A connection with any doubt about its state is destroyed, never reused.
      client.release(discard);
    }
  }

  /**
   * Startup check: the API must connect as a least-privilege login - exactly
   * gogospend_app and gogospend_bootstrap, never a superuser, BYPASSRLS or
   * CREATEROLE role or (a member of) a table owner, which would bypass
   * row-level security.
   */
  async assertLeastPrivilegeLogin(): Promise<void> {
    await assertLoginRoles(this.pool, ['gogospend_app', 'gogospend_bootstrap'], 'DATABASE_URL',
      'DATABASE_URL must use a least-privilege login: a member of gogospend_app and gogospend_bootstrap only, not a superuser, BYPASSRLS role or table owner.');
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
