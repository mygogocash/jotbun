// Drizzle definitions mirroring the reviewed SQL in apps/api/drizzle. The SQL
// files are authoritative; migrations.integration.spec.ts fails if these
// definitions and the migrated database drift apart.
import { sql } from 'drizzle-orm';
import { bigint, boolean, customType, integer, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

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
};
