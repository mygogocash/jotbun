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
