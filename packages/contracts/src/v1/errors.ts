/**
 * v1 problem codes. Every non-2xx v1 response body is an `ApiProblem`; clients
 * branch on `code`, never on message text.
 */

export const API_ERROR_CODES = [
  // Field validation (422)
  "VALIDATION_FAILED",
  "UNKNOWN_FIELD",
  "INVALID_MINOR",
  "MINOR_OUT_OF_RANGE",
  "INVALID_DATE",
  "DATE_BEFORE_TRACKING_START",
  "DATE_IN_FUTURE",
  "INVALID_COMMAND",
  "COMMAND_SCHEMA_UNSUPPORTED",
  // Identity and access (401/403/404/426/429)
  "UNAUTHENTICATED",
  "SESSION_REQUIRED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CLIENT_UPGRADE_REQUIRED",
  "RATE_LIMITED",
  // Command protocol (409/410/413/503)
  "IDEMPOTENCY_MISMATCH",
  "VERSION_CONFLICT",
  "COMMAND_TOO_LARGE",
  "RESYNC_REQUIRED",
  "ENTITY_DELETED",
  "ENTITY_PURGED",
  "WRITES_PAUSED",
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export type ApiProblem = {
  /** Servers emit an `ApiErrorCode`; clients must tolerate codes they don't know yet. */
  code: string;
  request_id: string;
  message_key: string;
  fields?: Record<string, string>;
  retry_after_seconds?: number;
};

/** Thrown by the shared validators; servers map it to a 422 `ApiProblem`. */
export class ContractValidationError extends Error {
  readonly code: ApiErrorCode;
  readonly field: string | undefined;

  constructor(code: ApiErrorCode, message: string, field?: string) {
    super(message);
    this.name = "ContractValidationError";
    this.code = code;
    this.field = field;
  }
}
