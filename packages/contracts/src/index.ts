export {
  SPEND_CSV_MIME,
  SPEND_XLSX_MIME,
  SPEND_SLIP_MIME,
  SPEND_MAX_UPLOAD_BYTES,
  SPEND_MAPPERS,
  SPEND_TX_TYPES,
  SPEND_TX_SOURCES,
  SPEND_JOB_STATUSES,
  SPEND_PARSE_ERROR_CODES,
  SPEND_JOB_ERROR_CODES,
  SPEND_CATEGORY_HUES,
  SPEND_CATEGORY_EMOJI_MAX_UNITS,
} from "./spend.ts";
export type {
  SpendCsvMime,
  SpendMapperId,
  SpendTxType,
  SpendTxSource,
  SpendJobStatus,
  SpendParseErrorCode,
  SpendJobErrorCode,
  SpendCategoryHue,
} from "./spend.ts";

// v1 (standalone PostgreSQL/Auth0 backend). Legacy spend exports above stay
// until their callers are retired (M5/P6b).
export {
  COMMAND_OUTCOMES,
  ENTITY_STATES,
  MAX_CHANGE_GROUP_BYTES,
  MAX_COMMAND_STATUS_IDS,
  V1_HEADERS,
} from "./v1/common.ts";
export type {
  AccountId,
  Minor,
  Revision,
  ApiIdentity,
  SessionContext,
  CommandInput,
  CommandOutcome,
  EntityState,
  CommandAck,
  EntityChange,
  CommittedChangeGroup,
  CommandStatusRequest,
  CommandStatus,
  CommandStatusResponse,
} from "./v1/common.ts";
export { API_ERROR_CODES, ContractValidationError } from "./v1/errors.ts";
export type { ApiErrorCode, ApiProblem } from "./v1/errors.ts";
export {
  REAUTH_PURPOSES,
  CLIENT_PLATFORMS,
  formatClientHeader,
  parseClientHeader,
  compareVersions,
} from "./v1/auth.ts";
export type {
  ReauthPurpose,
  AuthChallengeRequest,
  AuthChallenge,
  BootstrapRequest,
  BootstrapResult,
  ProofRequest,
  ProofResult,
  GlobalLogoutRequest,
  GlobalLogoutResult,
  LinkIdentityRequest,
  LinkIdentityResult,
  ClientPlatform,
  ClientVersion,
} from "./v1/auth.ts";
export { POLICY_KINDS } from "./v1/policies.ts";
export type {
  PolicyKind,
  PolicyVersionDto,
  PolicyAcceptanceRequest,
  PrivacyPreferences,
  MeDto,
} from "./v1/policies.ts";
export {
  MINOR_AMOUNT_MAX,
  TRACKING_START_MIN,
  NAME_MAX_CHARS,
  parseMinor,
  normalizeCommand,
  normalizeName,
  validateTrackingStart,
  validateOccurredOn,
  bangkokDate,
  assertKnownFields,
  isUuid,
} from "./v1/validation.ts";
export type { MinorOptions, CanonicalCommand } from "./v1/validation.ts";
export { WALLET_CURRENCY, WALLET_CORRECTION_REASONS, isWalletSnapshot } from "./v1/wallets.ts";
export type { WalletCorrectionReason, WalletSnapshot, WalletDto, CreateWalletRequest, UpdateWalletRequest } from "./v1/wallets.ts";
export { CATEGORY_TYPES, CATEGORY_COLORS, BUILTIN_CATEGORIES, isCategorySnapshot } from "./v1/categories.ts";
export type { CategoryType, BuiltinCategoryKey, CategoryDto, CreateCategoryRequest, UpdateCategoryRequest } from "./v1/categories.ts";
export { TRANSACTION_TYPES, NOTE_MAX_CHARS, MERCHANT_MAX_CHARS, RESTORE_WINDOW_DAYS, normalizeNote, normalizeMerchant, isTransactionSnapshot } from "./v1/transactions.ts";
export type { TransactionType, EntryType, EntryDto, TransferDto, TransactionDto, CreateTransactionRequest, UpdateTransactionRequest } from "./v1/transactions.ts";
export { MAX_BUDGET_CATEGORY_LIMITS, parseMonth, isBudgetSnapshot } from "./v1/budgets.ts";
export type { BudgetCategoryLimit, BudgetDto, SetMonthlyBudgetRequest } from "./v1/budgets.ts";
export { HISTORY_SORTS, HISTORY_DEFAULT_LIMIT, HISTORY_MAX_LIMIT, HISTORY_QUERY_MAX_CHARS } from "./v1/history.ts";
export type { HistorySort, HistoryFilter, Totals, FilteredTotals, HistoryPage } from "./v1/history.ts";
export type { CategoryTotal, BudgetCategoryUsage, BudgetUsage, MonthSummary } from "./v1/summary.ts";
export {
  SYNC_DEFAULT_GROUPS,
  SYNC_MAX_GROUPS,
  SYNC_PAGE_BYTES,
  SYNC_RETENTION_DAYS,
  SNAPSHOT_TTL_HOURS,
  SNAPSHOT_GRANT_MINUTES,
  SNAPSHOT_SCHEMA_VERSION,
  SNAPSHOT_STATUSES,
  SYNC_ENTITY_VALIDATORS,
  isEntityChange,
  isCommittedChangeGroup,
  isSnapshotChunk,
  isSnapshotChunkGrant,
  isSyncChangesPage,
  isSnapshotDto,
} from "./v1/sync.ts";
export type { SyncChangesPage, SnapshotStatus, SnapshotChunkGrant, SnapshotDto, SnapshotChunk } from "./v1/sync.ts";
export {
  EXPORT_TTL_HOURS,
  EXPORT_GRANT_MINUTES,
  EXPORT_DOWNLOAD_PATH,
  EXPORT_STATUSES,
  EXPORT_CSV_COLUMNS,
  EXPORT_CSV_BOM,
  exportFileName,
  isExportFilter,
  isExportRequestSnapshot,
  isExportDto,
  isExportGrant,
} from "./v1/privacy.ts";
export type { ExportStatus, ExportFilter, ExportRequest, ExportRequestSnapshot, ExportDto, ExportGrant, ExportCsvColumn } from "./v1/privacy.ts";
export {
  IMPORT_UPLOAD_MAX_BYTES,
  IMPORT_FILE_NAME_MAX_CHARS,
  IMPORT_QUARANTINE_TTL_HOURS,
  IMPORT_FILE_NAME_HEADER,
  IMPORT_QUOTAS,
  IMPORT_LIMITS,
  IMPORT_LIMIT_MESSAGE_KEYS,
  IMPORT_HEIC_MESSAGE_KEY,
  IMPORT_FORMATS,
  IMPORT_CONTENT_TYPES,
  IMPORT_EXTENSIONS,
  IMPORT_STATUSES,
  parseImportFileName,
  importFormatForContentType,
  importFormatForExtension,
  isImportJobDto,
  IMPORT_PARSE_LIMITS,
  IMPORT_PARSE_DEADLINE_SECONDS,
  IMPORT_PARSE_JOB_DEADLINE_SECONDS,
  IMPORT_PARSER_MEMORY_BUDGET_MIB,
  IMPORT_PREVIEW_TTL_DAYS,
  IMPORT_IMAGE_TTL_HOURS,
  IMPORT_PREVIEW_STATUSES,
  IMPORT_LAYOUTS,
  IMPORT_FIELDS,
  IMPORT_FILE_ISSUE_CODES,
  IMPORT_ROW_ISSUE_CODES,
  importIssueMessageKey,
  isImportPreview,
} from "./v1/imports.ts";
export type {
  ImportLimit,
  ImportFormat,
  ImportStatus,
  ImportJobDto,
  UploadAccepted,
  ImportFileName,
  ImportPreviewStatus,
  ImportLayout,
  ImportField,
  ImportFileIssueCode,
  ImportRowIssueCode,
  ImportCandidate,
  ImportIssue,
  ImportDuplicateAdvice,
  ImportPreviewSummary,
  ImportPreview,
} from "./v1/imports.ts";
