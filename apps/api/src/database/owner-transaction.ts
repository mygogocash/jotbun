import type { Revision } from '@gogospend/contracts';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { PoolClient, QueryResultRow } from 'pg';

import { accounts, accountSyncState, schema } from './schema';
import type { AccountStatus } from './schema';

// A first, cheap filter against mistakes: statements that would end the
// transaction early or change its role/owner context. It is not complete (SQL
// has too many spellings), so DatabaseService also verifies in the database,
// immediately before COMMIT, that the transaction, owner and role are still
// the ones it opened. Every query uses the extended protocol (one statement).
const FORBIDDEN_STATEMENT =
  /^(?:begin|start\s+transaction|commit|end|rollback|abort|savepoint|release|prepare\s+transaction|set|reset|discard)\b|set_config\s*\(\s*'(?:gogospend\.|role\b|session_authorization\b)/i;
const LEADING_TRIVIA = /^(?:\s+|;|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)*/;

type QueryConfig = { text: string; values?: unknown[]; queryMode?: 'extended' };

function toExtendedQuery(args: unknown[]): QueryConfig {
  const [first, values] = args;
  if (typeof first === 'string') return { text: first, values: (values as unknown[] | undefined) ?? [], queryMode: 'extended' };
  if (first && typeof first === 'object' && typeof (first as { text?: unknown }).text === 'string') {
    const config = first as QueryConfig;
    return { ...config, values: (values as unknown[] | undefined) ?? config.values ?? [], queryMode: 'extended' };
  }
  throw new Error('Owner transactions only accept SQL text queries.');
}

/**
 * A database transaction pinned to one pooled connection with the owner
 * context set transaction-locally. It stops working once its transaction
 * completes, so a leaked reference can never run on a reused connection.
 */
export class OwnerTx {
  readonly accountId: string;
  private client: PoolClient | null;
  private drizzleDb: NodePgDatabase<typeof schema> | null = null;

  constructor(client: PoolClient, accountId: string) {
    this.client = client;
    this.accountId = accountId;
  }

  async query<R extends QueryResultRow = QueryResultRow>(text: string, values: unknown[] = []): Promise<R[]> {
    const result = await this.guardedQuery(text, values);
    return (result as { rows: R[] }).rows;
  }

  /** Drizzle bound to this transaction's connection through the same guard. */
  get db(): NodePgDatabase<typeof schema> {
    this.pinned();
    if (!this.drizzleDb) {
      const guarded = { query: (...args: unknown[]) => this.guardedQuery(...args) };
      this.drizzleDb = drizzle(guarded as unknown as PoolClient, { schema });
    }
    return this.drizzleDb;
  }

  /** Called by DatabaseService when the transaction ends. */
  close(): void {
    this.client = null;
    this.drizzleDb = null;
  }

  private async guardedQuery(...args: unknown[]): Promise<unknown> {
    const client = this.pinned();
    const config = toExtendedQuery(args);
    if (FORBIDDEN_STATEMENT.test(config.text.replace(LEADING_TRIVIA, ''))) {
      throw new Error('Owner transactions cannot run transaction-control or context statements.');
    }
    return (client.query as (config: QueryConfig) => Promise<unknown>)(config);
  }

  private pinned(): PoolClient {
    if (!this.client) throw new Error('OwnerTx was used after its transaction completed.');
    return this.client;
  }
}

export type AccountState = {
  status: AccountStatus;
  sessionGeneration: number;
  lifecycleGeneration: number;
  reauthAfter: string | null;
  revision: Revision;
};

export class AccountNotFoundError extends Error {
  constructor() {
    super('Account is not visible in this owner transaction.');
    this.name = 'AccountNotFoundError';
  }
}

/**
 * Takes the common per-account lock (the `account_sync_state` row) and reads
 * the account's current state under it. Every business write and lifecycle
 * transition calls this first, then rechecks status/session against it.
 */
export async function lockAccount(tx: OwnerTx, accountId: string): Promise<AccountState> {
  if (accountId !== tx.accountId) throw new AccountNotFoundError();
  // Two statements on purpose. After waiting for the lock, PostgreSQL re-reads
  // only the locked row; columns joined from `accounts` in the same statement
  // would come from the snapshot taken before the wait. A fresh statement
  // (READ COMMITTED) sees every change committed by the previous lock holder.
  const locked = await tx.db
    .select({ revision: accountSyncState.revision })
    .from(accountSyncState)
    .where(eq(accountSyncState.accountId, accountId))
    .for('update');
  const account = await tx.db
    .select({
      status: accounts.status,
      sessionGeneration: accounts.sessionGeneration,
      lifecycleGeneration: accounts.lifecycleGeneration,
      reauthAfter: accounts.reauthAfter,
    })
    .from(accounts)
    .where(eq(accounts.id, accountId));
  if (!locked[0] || !account[0]) throw new AccountNotFoundError();
  return {
    status: account[0].status,
    sessionGeneration: account[0].sessionGeneration,
    lifecycleGeneration: account[0].lifecycleGeneration,
    reauthAfter: account[0].reauthAfter ? account[0].reauthAfter.toISOString() : null,
    revision: locked[0].revision.toString(),
  };
}
