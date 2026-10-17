// Drizzle definitions mirroring the reviewed SQL in apps/api/drizzle. The SQL
// files are authoritative; migrations.integration.spec.ts fails if these
// definitions and the migrated database drift apart.
import { sql } from 'drizzle-orm';
import { bigint, boolean, customType, date, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const ACCOUNT_STATUSES = ['active', 'disabled', 'deleting'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey(),
  status: text('status', { enum: ACCOUNT_STATUSES }).notNull().default('active'),
  sessionGeneration: integer('session_generation').notNull().default(0),
  lifecycleGeneration: integer('lifecycle_generation').notNull().default(0),
  reauthAfter: timestamp('reauth_after', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export const accountIdentities = pgTable(
  'account_identities',
  {
    issuer: text('issuer').notNull(),
    subject: text('subject').notNull(),
    accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.issuer, table.subject] })],
);

export const accountSyncState = pgTable('account_sync_state', {
  accountId: uuid('account_id').primaryKey().references(() => accounts.id, { onDelete: 'cascade' }),
  revision: bigint('revision', { mode: 'bigint' }).notNull().default(0n),
});

// Reached only through gogospend_consume_rate_limit/gogospend_purge_rate_limits;
// defined here so the drift test covers it.
export const rateLimitBuckets = pgTable(
  'rate_limit_buckets',
  {
    bucketKey: text('bucket_key').notNull(),
    windowStart: timestamp('window_start', { withTimezone: true, mode: 'date' }).notNull(),
    hits: integer('hits').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.bucketKey, table.windowStart] })],
);

// drizzle-orm 0.45 has no built-in bytea column.
const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' });
const instant = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const POLICY_KIND_VALUES = ['terms', 'privacy'] as const;

export const policyVersions = pgTable(
  'policy_versions',
  {
    kind: text('kind', { enum: POLICY_KIND_VALUES }).notNull(),
    version: integer('version').notNull(),
    required: boolean('required').notNull(),
    publishedAt: instant('published_at').notNull(),
    textTh: text('text_th').notNull(),
    textEn: text('text_en').notNull(),
  },
  (table) => [primaryKey({ columns: [table.kind, table.version] })],
);

export const consents = pgTable(
  'consents',
  {
    accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['terms', 'privacy', 'analytics'] }).notNull(),
    version: integer('version').notNull(),
    granted: boolean('granted').notNull(),
    recordedAt: instant('recorded_at').notNull().defaultNow(),
    // Generated: the policy version an acceptance row refers to (FK in SQL).
    policyKind: text('policy_kind').generatedAlwaysAs(sql`CASE WHEN kind <> 'analytics' THEN kind END`),
    policyVersion: integer('policy_version').generatedAlwaysAs(sql`CASE WHEN kind <> 'analytics' THEN version END`),
  },
  (table) => [primaryKey({ columns: [table.accountId, table.kind, table.version] })],
);

export const blockedPrincipals = pgTable('blocked_principals', {
  principalDigest: bytea('principal_digest').primaryKey(),
  reason: text('reason', { enum: ['deleted', 'disabled', 'revocation_pending'] }).notNull(),
  blockedUntil: instant('blocked_until'),
  createdAt: instant('created_at').notNull().defaultNow(),
  pendingJobId: uuid('pending_job_id'),
});

export const JOB_KINDS = ['auth0_revoke_grants'] as const;
export const JOB_STATUSES = ['queued', 'leased', 'succeeded', 'superseded', 'failed'] as const;

export const jobs = pgTable('jobs', {
  id: uuid('id').primaryKey(),
  kind: text('kind', { enum: JOB_KINDS }).notNull(),
  accountId: uuid('account_id'),
  lifecycleGeneration: integer('lifecycle_generation').notNull().default(0),
  payload: jsonb('payload').notNull(),
  status: text('status', { enum: JOB_STATUSES }).notNull().default('queued'),
  attempts: integer('attempts').notNull().default(0),
  maxAttempts: integer('max_attempts').notNull(),
  runAfter: instant('run_after').notNull().defaultNow(),
  leaseToken: uuid('lease_token'),
  leaseExpiresAt: instant('lease_expires_at'),
  lastError: text('last_error'),
  createdAt: instant('created_at').notNull().defaultNow(),
  updatedAt: instant('updated_at').notNull().defaultNow(),
  finishedAt: instant('finished_at'),
});

export const reauthChallenges = pgTable('reauth_challenges', {
  id: uuid('id').primaryKey(),
  principalDigest: bytea('principal_digest').notNull(),
  clientId: text('client_id').notNull(),
  accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'cascade' }),
  purpose: text('purpose', { enum: ['bootstrap', 'export', 'link', 'global_logout', 'deletion'] }).notNull(),
  commandId: uuid('command_id').notNull(),
  requestId: uuid('request_id').notNull(),
  nonceDigest: bytea('nonce_digest').notNull(),
  createdAt: instant('created_at').notNull().defaultNow(),
  expiresAt: instant('expires_at').notNull(),
  provenAt: instant('proven_at'),
  authTime: instant('auth_time'),
  consumedAt: instant('consumed_at'),
});

export const authSessions = pgTable('auth_sessions', {
  id: uuid('id').primaryKey(),
  accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  bindingDigest: bytea('binding_digest').notNull().unique(),
  principalDigest: bytea('principal_digest').notNull(),
  clientId: text('client_id').notNull(),
  sessionGeneration: integer('session_generation').notNull(),
  authenticatedAt: instant('authenticated_at').notNull(),
  createdAt: instant('created_at').notNull().defaultNow(),
  firstUsedAt: instant('first_used_at'),
  lastUsedAt: instant('last_used_at'),
  idleExpiresAt: instant('idle_expires_at').notNull(),
  absoluteExpiresAt: instant('absolute_expires_at').notNull(),
  revokedAt: instant('revoked_at'),
});

export const COMMAND_OUTCOME_VALUES = ['created', 'updated', 'deleted', 'restored', 'archived', 'unarchived', 'accepted'] as const;
export const ENTITY_STATE_VALUES = ['active', 'deleted', 'purged'] as const;

export const commandReceipts = pgTable(
  'command_receipts',
  {
    accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
    commandId: uuid('command_id').notNull(),
    kind: text('kind').notNull(),
    schemaVersion: integer('schema_version').notNull(),
    requestDigest: bytea('request_digest').notNull(),
    digestKeyId: text('digest_key_id').notNull(),
    entity: text('entity').notNull(),
    entityId: uuid('entity_id').notNull(),
    entityVersion: integer('entity_version').notNull(),
    outcome: text('outcome', { enum: COMMAND_OUTCOME_VALUES }).notNull(),
    entityState: text('entity_state', { enum: ENTITY_STATE_VALUES }).notNull(),
    revision: bigint('revision', { mode: 'bigint' }).notNull(),
    committedAt: instant('committed_at').notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.accountId, table.commandId] })],
);

export const entityChanges = pgTable(
  'entity_changes',
  {
    accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
    revision: bigint('revision', { mode: 'bigint' }).notNull(),
    ordinal: integer('ordinal').notNull(),
    commandId: uuid('command_id').notNull(),
    entity: text('entity').notNull(),
    entityId: uuid('entity_id').notNull(),
    version: integer('version').notNull(),
    state: text('state', { enum: ENTITY_STATE_VALUES }).notNull(),
    snapshot: jsonb('snapshot'),
    committedAt: instant('committed_at').notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.accountId, table.revision, table.ordinal] })],
);

export const entityHeads = pgTable(
  'entity_heads',
  {
    accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
    entity: text('entity').notNull(),
    entityId: uuid('entity_id').notNull(),
    version: integer('version').notNull(),
    state: text('state', { enum: ENTITY_STATE_VALUES }).notNull(),
    revision: bigint('revision', { mode: 'bigint' }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.accountId, table.entity, table.entityId] })],
);

export const auditEvents = pgTable(
  'audit_events',
  {
    accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
    revision: bigint('revision', { mode: 'bigint' }).notNull(),
    commandId: uuid('command_id').notNull(),
    kind: text('kind').notNull(),
    sessionId: uuid('session_id').notNull(),
    clientId: text('client_id').notNull(),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: instant('created_at').notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.accountId, table.revision] })],
);

export const wallets = pgTable(
  'wallets',
  {
    accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
    id: uuid('id').notNull(),
    name: text('name').notNull(),
    currency: text('currency').notNull().default('THB'),
    openingMinor: bigint('opening_minor', { mode: 'bigint' }).notNull(),
    trackingStart: date('tracking_start', { mode: 'string' }).notNull(),
    archived: boolean('archived').notNull().default(false),
    version: integer('version').notNull().default(1),
    createdAt: instant('created_at').notNull().defaultNow(),
    updatedAt: instant('updated_at').notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.accountId, table.id] })],
);

export const categories = pgTable(
  'categories',
  {
    accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
    id: uuid('id').notNull(),
    type: text('type', { enum: ['expense', 'income'] }).notNull(),
    builtinKey: text('builtin_key'),
    label: text('label'),
    color: text('color'),
    archived: boolean('archived').notNull().default(false),
    version: integer('version').notNull().default(1),
    createdAt: instant('created_at').notNull().defaultNow(),
    updatedAt: instant('updated_at').notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.accountId, table.id] })],
);

export const transactions = pgTable(
  'transactions',
  {
    accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
    id: uuid('id').notNull(),
    type: text('type', { enum: ['expense', 'income', 'transfer'] }).notNull(),
    amountMinor: bigint('amount_minor', { mode: 'bigint' }).notNull(),
    occurredOn: date('occurred_on', { mode: 'string' }).notNull(),
    walletId: uuid('wallet_id'),
    categoryId: uuid('category_id'),
    // Generated: the category type an entry must match (FK in SQL).
    categoryType: text('category_type').generatedAlwaysAs(sql`CASE WHEN type <> 'transfer' THEN type END`),
    sourceWalletId: uuid('source_wallet_id'),
    destinationWalletId: uuid('destination_wallet_id'),
    note: text('note'),
    merchant: text('merchant'),
    version: integer('version').notNull().default(1),
    deletedAt: instant('deleted_at'),
    createdAt: instant('created_at').notNull().defaultNow(),
    updatedAt: instant('updated_at').notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.accountId, table.id] })],
);

export const monthlyBudgets = pgTable(
  'monthly_budgets',
  {
    accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
    month: date('month', { mode: 'string' }).notNull(),
    id: uuid('id').notNull(),
    overallLimitMinor: bigint('overall_limit_minor', { mode: 'bigint' }).notNull(),
    version: integer('version').notNull().default(1),
    createdAt: instant('created_at').notNull().defaultNow(),
    updatedAt: instant('updated_at').notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.accountId, table.month] })],
);

export const budgetCategoryLimits = pgTable(
  'budget_category_limits',
  {
    accountId: uuid('account_id').notNull(),
    month: date('month', { mode: 'string' }).notNull(),
    categoryId: uuid('category_id').notNull(),
    categoryType: text('category_type').notNull().default('expense'),
    limitMinor: bigint('limit_minor', { mode: 'bigint' }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.accountId, table.month, table.categoryId] })],
);

export const schema = {
  accounts,
  accountIdentities,
  accountSyncState,
  rateLimitBuckets,
  policyVersions,
  consents,
  blockedPrincipals,
  reauthChallenges,
  authSessions,
  jobs,
  commandReceipts,
  entityChanges,
  entityHeads,
  auditEvents,
  wallets,
  categories,
  transactions,
  monthlyBudgets,
  budgetCategoryLimits,
};
