// Drizzle definitions mirroring the reviewed SQL in apps/api/drizzle. The SQL
// files are authoritative; migrations.integration.spec.ts fails if these
// definitions and the migrated database drift apart.
import { sql } from 'drizzle-orm';
import { bigint, boolean, customType, date, integer, jsonb, pgSchema, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const ACCOUNT_STATUSES = ['active', 'disabled', 'deleting'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey(),
  status: text('status', { enum: ACCOUNT_STATUSES }).notNull().default('active'),
  sessionGeneration: integer('session_generation').notNull().default(0),
  lifecycleGeneration: integer('lifecycle_generation').notNull().default(0),
  reauthAfter: timestamp('reauth_after', { withTimezone: true, mode: 'date' }),
  /** F6b: the newest provider credential change applied (older events are superseded). */
  credentialsChangedAt: timestamp('credentials_changed_at', { withTimezone: true, mode: 'date' }),
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
  prunedThrough: bigint('pruned_through', { mode: 'bigint' }).notNull().default(0n),
  // P5: the latest retention purge's revision; no snapshot below it is recorded.
  purgeRevision: bigint('purge_revision', { mode: 'bigint' }).notNull().default(0n),
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

/** F6b: one row per verified provider event or reconciled change (routines only). */
export const authEventReceipts = pgTable('auth_event_receipts', {
  eventId: text('event_id').primaryKey(),
  source: text('source', { enum: ['event', 'reconcile'] }).notNull(),
  type: text('type', { enum: ['password_changed', 'user_blocked'] }).notNull(),
  principalDigest: bytea('principal_digest').notNull(),
  occurredAt: instant('occurred_at').notNull(),
  receivedAt: instant('received_at').notNull().defaultNow(),
  outcome: text('outcome', { enum: ['pending', 'applied', 'superseded', 'no_account'] }).notNull(),
  accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'set null' }),
  jobId: uuid('job_id'),
});

/** F6b: when each principal was last checked against Auth0 (routines only). */
export const securityReconcileChecks = pgTable('security_reconcile_checks', {
  principalDigest: bytea('principal_digest').primaryKey(),
  checkedAt: instant('checked_at').notNull(),
});

/** Kinds visible only to gogospend_security (RLS); other kinds are any identifier. */
export const SECURITY_JOB_KINDS = ['auth0_revoke_grants', 'auth0_security_reconcile', 'auth0_link_identities', 'account_deletion'] as const;
export const JOB_STATUSES = ['queued', 'leased', 'succeeded', 'superseded', 'failed', 'cancelled'] as const;

export const jobs = pgTable('jobs', {
  id: uuid('id').primaryKey(),
  kind: text('kind').notNull(),
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
  maxRuntimeSeconds: integer('max_runtime_seconds').notNull().default(900),
  attemptStartedAt: instant('attempt_started_at'),
});

export const objectPublications = pgTable('object_publications', {
  key: text('key').primaryKey(),
  jobId: uuid('job_id').notNull(),
  accountId: uuid('account_id').notNull(),
  leaseToken: uuid('lease_token').notNull(),
  lifecycleGeneration: integer('lifecycle_generation').notNull(),
  purpose: text('purpose').notNull(),
  status: text('status', { enum: ['reserved', 'published', 'deleted'] }).notNull().default('reserved'),
  deleteAfter: instant('delete_after').notNull(),
  bytes: bigint('bytes', { mode: 'bigint' }),
  sha256: bytea('sha256'),
  createdAt: instant('created_at').notNull().defaultNow(),
  publishedAt: instant('published_at'),
  deletedAt: instant('deleted_at'),
});

export const snapshotManifests = pgTable('snapshot_manifests', {
  snapshotId: uuid('snapshot_id').primaryKey(),
  accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  lifecycleGeneration: integer('lifecycle_generation').notNull(),
  highWater: bigint('high_water', { mode: 'bigint' }).notNull(),
  schemaVersion: integer('schema_version').notNull(),
  chunkCount: integer('chunk_count').notNull(),
  expiresAt: instant('expires_at').notNull(),
  createdAt: instant('created_at').notNull().defaultNow(),
});

export const snapshotChunks = pgTable(
  'snapshot_chunks',
  {
    snapshotId: uuid('snapshot_id').notNull().references(() => snapshotManifests.snapshotId, { onDelete: 'cascade' }),
    accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
    chunkIndex: integer('chunk_index').notNull(),
    objectKey: text('object_key').notNull().unique(),
    bytes: bigint('bytes', { mode: 'bigint' }).notNull(),
    sha256: bytea('sha256').notNull(),
  },
  (table) => [primaryKey({ columns: [table.snapshotId, table.chunkIndex] })],
);

export const exportsTable = pgTable('exports', {
  exportId: uuid('export_id').primaryKey(),
  accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  lifecycleGeneration: integer('lifecycle_generation').notNull(),
  fromDate: date('from_date', { mode: 'string' }).notNull(),
  throughDate: date('through_date', { mode: 'string' }).notNull(),
  requestedAt: instant('requested_at').notNull().defaultNow(),
  objectKey: text('object_key').unique(),
  bytes: bigint('bytes', { mode: 'bigint' }),
  sha256: bytea('sha256'),
  rowCount: integer('row_count'),
  highWater: bigint('high_water', { mode: 'bigint' }),
  readyAt: instant('ready_at'),
  expiresAt: instant('expires_at'),
});

/** P5: one per account being erased - the erasure's work item; outlives the account (routines only). */
export const deletionRequests = pgTable('deletion_requests', {
  requestId: uuid('request_id').primaryKey(),
  // Not account_id: a work item, not the account's data (a restore keeps it).
  erasedAccountId: uuid('erased_account_id').notNull().unique(),
  jobId: uuid('job_id').notNull().unique(),
  commandId: uuid('command_id').notNull(),
  // Null for an erasure re-queued after a restore; the principal digest is cleared at the purge.
  initiatorBindingDigest: bytea('initiator_binding_digest').unique(),
  initiatorPrincipalDigest: bytea('initiator_principal_digest'),
  initiatorClientId: text('initiator_client_id'),
  requestedAt: instant('requested_at').notNull().defaultNow(),
  markerRecordedAt: instant('marker_recorded_at'),
  providerVerifiedAt: instant('provider_verified_at'),
  objectsSweptAt: instant('objects_swept_at'),
  purgedAt: instant('purged_at'),
  blockedUntil: instant('blocked_until'),
  markerPurgeRecordedAt: instant('marker_purge_recorded_at'),
});

/** P5: the provider aliases an erasure still has to clean up (until its purge). */
export const deletionRequestSubjects = pgTable(
  'deletion_request_subjects',
  {
    requestId: uuid('request_id').notNull().references(() => deletionRequests.requestId, { onDelete: 'cascade' }),
    issuer: text('issuer').notNull(),
    subject: text('subject').notNull(),
  },
  (table) => [primaryKey({ columns: [table.requestId, table.issuer, table.subject] })],
);

/** P5: the independent erasure registry (maintenance role only; its own database in production). */
export const erasureRegistry = pgSchema('erasure_registry');
export const erasureMarkers = erasureRegistry.table('erasure_markers', {
  markerId: uuid('marker_id').primaryKey(),
  accountId: uuid('account_id').notNull(),
  subjectLookups: text('subject_lookups').array().notNull(),
  lookupKeyId: text('lookup_key_id').notNull(),
  recordedAt: instant('recorded_at').notNull().defaultNow(),
  purgedAt: instant('purged_at'),
  blockedUntil: instant('blocked_until'),
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
    // Null once dropped after the 30-day outbox lifetime (P5 retention).
    requestDigest: bytea('request_digest'),
    digestKeyId: text('digest_key_id'),
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
    groupBytes: integer('group_bytes'),
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

// Written only through the 0014 import intake routines; the owner reads its own rows.
export const IMPORT_UPLOAD_STATUSES = ['receiving', 'accepted', 'rejected', 'failed', 'expired'] as const;

export const importUploads = pgTable('import_uploads', {
  jobId: uuid('job_id').primaryKey(),
  accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  lifecycleGeneration: integer('lifecycle_generation').notNull(),
  intakeToken: uuid('intake_token').notNull(),
  status: text('status', { enum: IMPORT_UPLOAD_STATUSES }).notNull(),
  outcomeCode: text('outcome_code'),
  fileName: text('file_name'),
  declaredType: text('declared_type').notNull(),
  declaredBytes: bigint('declared_bytes', { mode: 'number' }),
  format: text('format'),
  bytes: bigint('bytes', { mode: 'number' }),
  sha256: bytea('sha256'),
  partCount: integer('part_count'),
  createdAt: instant('created_at').notNull().defaultNow(),
  receiveDeadline: instant('receive_deadline').notNull(),
  acceptedAt: instant('accepted_at'),
  expiresAt: instant('expires_at'),
  finishedAt: instant('finished_at'),
});

// Written only by the 0015 parse routine (worker, fenced); the owner reads its own rows.
export const IMPORT_PREVIEW_ROW_STATUSES = ['ready', 'rejected', 'expired'] as const;

export const importPreviews = pgTable('import_previews', {
  jobId: uuid('job_id').primaryKey().references(() => importUploads.jobId, { onDelete: 'cascade' }),
  accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  lifecycleGeneration: integer('lifecycle_generation').notNull(),
  status: text('status', { enum: IMPORT_PREVIEW_ROW_STATUSES }).notNull(),
  layout: text('layout'),
  issues: jsonb('issues').notNull().default([]),
  candidateCount: integer('candidate_count').notNull(),
  reviewRequiredCount: integer('review_required_count').notNull(),
  expenseTotalMinor: bigint('expense_total_minor', { mode: 'bigint' }).notNull().default(0n),
  incomeTotalMinor: bigint('income_total_minor', { mode: 'bigint' }).notNull().default(0n),
  transferTotalMinor: bigint('transfer_total_minor', { mode: 'bigint' }).notNull().default(0n),
  imageKey: text('image_key').unique(),
  imageWidth: integer('image_width'),
  imageHeight: integer('image_height'),
  reviewRevision: bigint('review_revision', { mode: 'bigint' }).notNull().default(1n),
  createdAt: instant('created_at').notNull().defaultNow(),
  expiresAt: instant('expires_at').notNull(),
  expiredAt: instant('expired_at'),
});

export const importCandidates = pgTable(
  'import_candidates',
  {
    jobId: uuid('job_id').notNull().references(() => importPreviews.jobId, { onDelete: 'cascade' }),
    accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
    sourceRowId: text('source_row_id').notNull(),
    ordinal: integer('ordinal').notNull(),
    occurredOn: date('occurred_on', { mode: 'string' }),
    type: text('type', { enum: ['expense', 'income', 'transfer'] }),
    amountMinor: bigint('amount_minor', { mode: 'bigint' }),
    walletLabel: text('wallet_label'),
    categoryLabel: text('category_label'),
    merchant: text('merchant'),
    note: text('note'),
    issues: jsonb('issues').notNull().default([]),
    reviewRequired: boolean('review_required').notNull(),
  },
  (table) => [primaryKey({ columns: [table.jobId, table.sourceRowId] })],
);

// P3: frozen selections (written only by gogospend_freeze_import_selection),
// their frozen rows, and per-row progress (append-only, one per committed
// source row). The owner reads its own rows.
export const importSelections = pgTable(
  'import_selections',
  {
    accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
    selectionId: uuid('selection_id').notNull().unique(),
    jobId: uuid('job_id').notNull().references(() => importPreviews.jobId, { onDelete: 'cascade' }),
    frozenRevision: bigint('frozen_revision', { mode: 'bigint' }).notNull(),
    rowCount: integer('row_count').notNull(),
    createdAt: instant('created_at').notNull().defaultNow(),
    expiresAt: instant('expires_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.accountId, table.selectionId] })],
);

export const importSelectionRows = pgTable(
  'import_selection_rows',
  {
    accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
    selectionId: uuid('selection_id').notNull(),
    sourceRowId: text('source_row_id').notNull(),
    ordinal: integer('ordinal').notNull(),
    type: text('type', { enum: ['expense', 'income'] }).notNull(),
    amountMinor: bigint('amount_minor', { mode: 'bigint' }).notNull(),
    occurredOn: date('occurred_on', { mode: 'string' }).notNull(),
    walletId: uuid('wallet_id').notNull(),
    categoryId: uuid('category_id').notNull(),
    categoryType: text('category_type').generatedAlwaysAs(sql`type`),
    note: text('note'),
    merchant: text('merchant'),
  },
  (table) => [primaryKey({ columns: [table.accountId, table.selectionId, table.sourceRowId] })],
);

export const importRowProgress = pgTable(
  'import_row_progress',
  {
    accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
    jobId: uuid('job_id').notNull().references(() => importPreviews.jobId, { onDelete: 'cascade' }),
    sourceRowId: text('source_row_id').notNull(),
    selectionId: uuid('selection_id').notNull(),
    // NULL only once the transaction was purged.
    transactionId: uuid('transaction_id'),
    commandId: uuid('command_id').notNull(),
    committedAt: instant('committed_at').notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.jobId, table.sourceRowId] })],
);

export const schema = {
  accounts,
  accountIdentities,
  accountSyncState,
  rateLimitBuckets,
  policyVersions,
  consents,
  blockedPrincipals,
  authEventReceipts,
  securityReconcileChecks,
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
  objectPublications,
  snapshotManifests,
  snapshotChunks,
  exports: exportsTable,
  importUploads,
  deletionRequests,
  deletionRequestSubjects,
  importPreviews,
  importCandidates,
  importSelections,
  importSelectionRows,
  importRowProgress,
};
