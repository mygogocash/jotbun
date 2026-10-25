// The vault's Drizzle schema: one table object per core table, matching the
// migrated SQL column for column (migrations/0000_vault_core.sql). The
// constraints live in the SQL; this file names the columns for queries. A test
// keeps the two in step. Every primary key column is declared notNull: each
// table is STRICT, so SQLite refuses a NULL key and reports the column as NOT
// NULL. Only INTEGER PRIMARY KEY (a rowid alias) reports notnull 0, which the
// test accounts for.
import { getTableName } from 'drizzle-orm'
import { blob, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const syncState = sqliteTable('sync_state', {
  id: integer('id').primaryKey().notNull(),
  revision: integer('revision').notNull(),
  prunedThrough: integer('pruned_through').notNull(),
})

export const accountState = sqliteTable('account_state', {
  id: integer('id').primaryKey().notNull(),
  accountId: text('account_id').notNull(),
  status: text('status').notNull(),
  notBefore: integer('not_before').notNull(),
  createdAt: text('created_at').notNull(),
})

export const revokedSessions = sqliteTable('revoked_sessions', {
  sessionId: text('session_id').primaryKey().notNull(),
  revokedAt: text('revoked_at').notNull(),
  expiresAt: text('expires_at').notNull(),
})

export const consents = sqliteTable('consents', {
  kind: text('kind').primaryKey().notNull(),
  version: integer('version').primaryKey().notNull(),
  granted: integer('granted').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const schedule = sqliteTable('schedule', {
  job: text('job').primaryKey().notNull(),
  dueAt: integer('due_at').notNull(),
})

export const categories = sqliteTable('categories', {
  id: text('id').primaryKey().notNull(),
  type: text('type').notNull(),
  builtinKey: text('builtin_key'),
  label: text('label'),
  color: text('color'),
  archived: integer('archived').notNull(),
  version: integer('version').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const wallets = sqliteTable('wallets', {
  id: text('id').primaryKey().notNull(),
  name: text('name').notNull(),
  currency: text('currency').notNull(),
  openingMinor: integer('opening_minor').notNull(),
  trackingStart: text('tracking_start').notNull(),
  archived: integer('archived').notNull(),
  version: integer('version').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const transactions = sqliteTable('transactions', {
  id: text('id').primaryKey().notNull(),
  type: text('type').notNull(),
  amountMinor: integer('amount_minor').notNull(),
  occurredOn: text('occurred_on').notNull(),
  walletId: text('wallet_id'),
  categoryId: text('category_id'),
  sourceWalletId: text('source_wallet_id'),
  destinationWalletId: text('destination_wallet_id'),
  note: text('note'),
  merchant: text('merchant'),
  version: integer('version').notNull(),
  deletedAt: text('deleted_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const monthlyBudgets = sqliteTable('monthly_budgets', {
  month: text('month').primaryKey().notNull(),
  id: text('id').notNull(),
  overallLimitMinor: integer('overall_limit_minor').notNull(),
  version: integer('version').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const budgetCategoryLimits = sqliteTable('budget_category_limits', {
  month: text('month').primaryKey().notNull(),
  categoryId: text('category_id').primaryKey().notNull(),
  limitMinor: integer('limit_minor').notNull(),
})

export const commandReceipts = sqliteTable('command_receipts', {
  commandId: text('command_id').primaryKey().notNull(),
  kind: text('kind').notNull(),
  schemaVersion: integer('schema_version').notNull(),
  requestDigest: blob('request_digest', { mode: 'buffer' }),
  digestKeyId: text('digest_key_id'),
  entity: text('entity').notNull(),
  entityId: text('entity_id').notNull(),
  entityVersion: integer('entity_version').notNull(),
  outcome: text('outcome').notNull(),
  entityState: text('entity_state').notNull(),
  revision: integer('revision').notNull(),
  committedAt: text('committed_at').notNull(),
})

export const entityChanges = sqliteTable('entity_changes', {
  revision: integer('revision').primaryKey().notNull(),
  ordinal: integer('ordinal').primaryKey().notNull(),
  commandId: text('command_id').notNull(),
  entity: text('entity').notNull(),
  entityId: text('entity_id').notNull(),
  version: integer('version').notNull(),
  state: text('state').notNull(),
  snapshot: text('snapshot'),
  committedAt: text('committed_at').notNull(),
  groupBytes: integer('group_bytes'),
})

export const entityHeads = sqliteTable('entity_heads', {
  entity: text('entity').primaryKey().notNull(),
  entityId: text('entity_id').primaryKey().notNull(),
  version: integer('version').notNull(),
  state: text('state').notNull(),
  revision: integer('revision').notNull(),
})

export const auditEvents = sqliteTable('audit_events', {
  revision: integer('revision').primaryKey().notNull(),
  commandId: text('command_id').notNull(),
  kind: text('kind').notNull(),
  sessionId: text('session_id').notNull(),
  clientId: text('client_id').notNull(),
  metadata: text('metadata').notNull(),
  createdAt: text('created_at').notNull(),
})

export const vaultSchema = {
  accountState,
  auditEvents,
  budgetCategoryLimits,
  categories,
  commandReceipts,
  consents,
  entityChanges,
  entityHeads,
  monthlyBudgets,
  revokedSessions,
  schedule,
  syncState,
  transactions,
  wallets,
}

/** The core table names, sorted (the migrated tables a new vault must have). */
export const VAULT_CORE_TABLES: readonly string[] = Object.values(vaultSchema)
  .map((table) => getTableName(table))
  .sort()
