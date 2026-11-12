// The vault's Drizzle schema: one table object per table the migrations create,
// matching the migrated SQL column for column (migrations/0000_vault_core.sql and
// 0001_vault_files.sql). The constraints live in the SQL; this file names the
// columns for queries. A test keeps the two in step. Every primary key column is
// declared notNull: each table is STRICT, so SQLite refuses a NULL key and
// reports the column as NOT NULL. Only INTEGER PRIMARY KEY (a rowid alias)
// reports notnull 0, which the test accounts for.
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
  icon: text('icon'),
  packKey: text('pack_key'),
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
  type: text('type'),
  material: text('material'),
  bunFace: text('bun_face'),
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
  // Phase 5's money fields (0002_currencies_trips.sql). A null home amount is a row an
  // older release wrote: it reads as amount_minor.
  currency: text('currency').notNull(),
  rate: text('rate').notNull(),
  rateSource: text('rate_source').notNull(),
  rateDate: text('rate_date'),
  homeAmountMinor: integer('home_amount_minor'),
  walletAmountMinor: integer('wallet_amount_minor'),
  toAmountMinor: integer('to_amount_minor'),
  tripId: text('trip_id'),
  // How the record was made (0005_transaction_source.sql, P3-T2): set only at create, null when none was named.
  source: text('source'),
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

// The file tables (migrations/0001_vault_files.sql).

export const vaultObjects = sqliteTable('vault_objects', {
  key: text('key').primaryKey().notNull(),
  purpose: text('purpose').notNull(),
  status: text('status').notNull(),
  deleteAfter: integer('delete_after'),
  bytes: integer('bytes'),
  sha256: text('sha256'),
  createdAt: integer('created_at').notNull(),
})

export const snapshots = sqliteTable('snapshots', {
  id: text('id').primaryKey().notNull(),
  status: text('status').notNull(),
  highWater: integer('high_water'),
  chunkCount: integer('chunk_count'),
  createdAt: text('created_at').notNull(),
  startedAt: text('started_at'),
  readyAt: text('ready_at'),
  expiresAt: text('expires_at'),
})

export const snapshotChunks = sqliteTable('snapshot_chunks', {
  snapshotId: text('snapshot_id').primaryKey().notNull(),
  chunkIndex: integer('chunk_index').primaryKey().notNull(),
  objectKey: text('object_key').notNull(),
  bytes: integer('bytes').notNull(),
  sha256: text('sha256').notNull(),
})

export const exportsTable = sqliteTable('exports', {
  id: text('id').primaryKey().notNull(),
  fromDate: text('from_date').notNull(),
  throughDate: text('through_date').notNull(),
  requestedAt: text('requested_at').notNull(),
  status: text('status').notNull(),
  failure: text('failure'),
  startedAt: text('started_at'),
  objectKey: text('object_key'),
  bytes: integer('bytes'),
  sha256: text('sha256'),
  rowCount: integer('row_count'),
  highWater: integer('high_water'),
  readyAt: text('ready_at'),
  expiresAt: text('expires_at'),
})

export const importUploads = sqliteTable('import_uploads', {
  jobId: text('job_id').primaryKey().notNull(),
  intakeToken: text('intake_token').notNull(),
  status: text('status').notNull(),
  outcomeCode: text('outcome_code'),
  fileName: text('file_name'),
  declaredType: text('declared_type').notNull(),
  declaredBytes: integer('declared_bytes'),
  format: text('format'),
  bytes: integer('bytes'),
  sha256: text('sha256'),
  partCount: integer('part_count'),
  parseState: text('parse_state'),
  parseAttempts: integer('parse_attempts').notNull(),
  parseFailure: text('parse_failure'),
  enqueuedAt: text('enqueued_at'),
  enqueuedAttempts: integer('enqueued_attempts'),
  createdAt: text('created_at').notNull(),
  receiveDeadline: text('receive_deadline').notNull(),
  acceptedAt: text('accepted_at'),
  expiresAt: text('expires_at'),
  finishedAt: text('finished_at'),
})

export const importParts = sqliteTable('import_parts', {
  jobId: text('job_id').primaryKey().notNull(),
  partIndex: integer('part_index').primaryKey().notNull(),
  objectKey: text('object_key').notNull(),
  bytes: integer('bytes'),
  sha256: text('sha256'),
})

export const importPreviews = sqliteTable('import_previews', {
  jobId: text('job_id').primaryKey().notNull(),
  status: text('status').notNull(),
  layout: text('layout'),
  issues: text('issues').notNull(),
  candidateCount: integer('candidate_count').notNull(),
  reviewRequiredCount: integer('review_required_count').notNull(),
  expenseTotalMinor: integer('expense_total_minor').notNull(),
  incomeTotalMinor: integer('income_total_minor').notNull(),
  transferTotalMinor: integer('transfer_total_minor').notNull(),
  imageKey: text('image_key'),
  imageWidth: integer('image_width'),
  imageHeight: integer('image_height'),
  imageAttachmentId: text('image_attachment_id'),
  reviewRevision: integer('review_revision').notNull(),
  createdAt: text('created_at').notNull(),
  expiresAt: text('expires_at').notNull(),
  expiredAt: text('expired_at'),
})

export const importCandidates = sqliteTable('import_candidates', {
  jobId: text('job_id').primaryKey().notNull(),
  sourceRowId: text('source_row_id').primaryKey().notNull(),
  ordinal: integer('ordinal').notNull(),
  occurredOn: text('occurred_on'),
  type: text('type'),
  amountMinor: integer('amount_minor'),
  walletLabel: text('wallet_label'),
  categoryLabel: text('category_label'),
  merchant: text('merchant'),
  note: text('note'),
  issues: text('issues').notNull(),
  reviewRequired: integer('review_required').notNull(),
})

export const importSelections = sqliteTable('import_selections', {
  selectionId: text('selection_id').primaryKey().notNull(),
  jobId: text('job_id').notNull(),
  frozenRevision: integer('frozen_revision').notNull(),
  rowCount: integer('row_count').notNull(),
  createdAt: text('created_at').notNull(),
  expiresAt: text('expires_at').notNull(),
})

export const importSelectionRows = sqliteTable('import_selection_rows', {
  selectionId: text('selection_id').primaryKey().notNull(),
  sourceRowId: text('source_row_id').primaryKey().notNull(),
  ordinal: integer('ordinal').notNull(),
  type: text('type').notNull(),
  amountMinor: integer('amount_minor').notNull(),
  occurredOn: text('occurred_on').notNull(),
  walletId: text('wallet_id').notNull(),
  categoryId: text('category_id').notNull(),
  note: text('note'),
  merchant: text('merchant'),
})

export const importRowProgress = sqliteTable('import_row_progress', {
  jobId: text('job_id').primaryKey().notNull(),
  sourceRowId: text('source_row_id').primaryKey().notNull(),
  selectionId: text('selection_id').notNull(),
  transactionId: text('transaction_id'),
  commandId: text('command_id').notNull(),
  committedAt: text('committed_at').notNull(),
})

export const attachments = sqliteTable('attachments', {
  id: text('id').primaryKey().notNull(),
  sourceJobId: text('source_job_id').notNull(),
  status: text('status').notNull(),
  objectKey: text('object_key').notNull(),
  contentType: text('content_type').notNull(),
  bytes: integer('bytes').notNull(),
  sha256: text('sha256').notNull(),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  retainedAt: text('retained_at').notNull(),
  releasedAt: text('released_at'),
})

export const transactionAttachments = sqliteTable('transaction_attachments', {
  transactionId: text('transaction_id').primaryKey().notNull(),
  attachmentId: text('attachment_id').notNull(),
  attachedAt: text('attached_at').notNull(),
})

/** The receipts whose holders changed since pruneAttachments last checked every receipt (0004, alarm-hardening): kept by triggers, emptied by pruneAttachments. */
export const attachmentChecks = sqliteTable('attachment_checks', {
  attachmentId: text('attachment_id').primaryKey().notNull(),
})

export const aiPreferences = sqliteTable('ai_preferences', {
  id: integer('id').primaryKey().notNull(),
  companion: integer('companion').notNull(),
  cashbackTips: integer('cashback_tips').notNull(),
  noticeVersion: integer('notice_version'),
  updatedAt: text('updated_at').notNull(),
})

export const aiUsage = sqliteTable('ai_usage', {
  day: text('day').primaryKey().notNull(),
  feature: text('feature').primaryKey().notNull(),
  uses: integer('uses').notNull(),
})

// Trips and the vault's settings (migrations/0002_currencies_trips.sql).

export const trips = sqliteTable('trips', {
  id: text('id').primaryKey().notNull(),
  name: text('name').notNull(),
  currency: text('currency').notNull(),
  startsOn: text('starts_on').notNull(),
  endsOn: text('ends_on').notNull(),
  budgetMinor: integer('budget_minor'),
  version: integer('version').notNull(),
  deletedAt: text('deleted_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const settings = sqliteTable('settings', {
  id: integer('id').primaryKey().notNull(),
  entityId: text('entity_id').notNull(),
  homeCurrency: text('home_currency').notNull(),
  version: integer('version').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const vaultSchema = {
  accountState,
  aiPreferences,
  aiUsage,
  attachmentChecks,
  attachments,
  auditEvents,
  budgetCategoryLimits,
  categories,
  commandReceipts,
  consents,
  entityChanges,
  entityHeads,
  exportsTable,
  importCandidates,
  importParts,
  importPreviews,
  importRowProgress,
  importSelectionRows,
  importSelections,
  importUploads,
  monthlyBudgets,
  revokedSessions,
  schedule,
  settings,
  snapshotChunks,
  snapshots,
  syncState,
  transactionAttachments,
  transactions,
  trips,
  vaultObjects,
  wallets,
}

/** The core table names, sorted (the migrated tables a new vault must have). */
export const VAULT_CORE_TABLES: readonly string[] = Object.values(vaultSchema)
  .map((table) => getTableName(table))
  .sort()
