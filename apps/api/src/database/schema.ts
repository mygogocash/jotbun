// Drizzle definitions mirroring the reviewed SQL in apps/api/drizzle. The SQL
// files are authoritative; migrations.integration.spec.ts fails if these
// definitions and the migrated database drift apart.
import { bigint, integer, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

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

export const schema = { accounts, accountIdentities, accountSyncState, rateLimitBuckets };
