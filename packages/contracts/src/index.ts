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
  parseMinor,
  normalizeCommand,
  validateOccurredOn,
  bangkokDate,
  assertKnownFields,
  isUuid,
} from "./v1/validation.ts";
export type { MinorOptions, CanonicalCommand } from "./v1/validation.ts";
