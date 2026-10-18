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
  // Identity and access (401/403/404/409/426/429)
  "UNAUTHENTICATED",
  "SESSION_REQUIRED",
  "PROOF_INVALID",
  "CHALLENGE_USED",
  "REAUTH_REQUIRED",
  "ACCOUNT_UNAVAILABLE",
  "POLICY_ACCEPTANCE_REQUIRED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CLIENT_UPGRADE_REQUIRED",
  "RATE_LIMITED",
  "ACCOUNT_LINK_CONFLICT",
  // Command protocol (409/410/413/503)
  "IDEMPOTENCY_MISMATCH",
  "VERSION_CONFLICT",
  "COMMAND_TOO_LARGE",
  "RESYNC_REQUIRED",
  "ENTITY_DELETED",
  "ENTITY_PURGED",
  "WRITES_PAUSED",
  // Operational pauses (P6b): 503 with retry_after_seconds; nothing was
  // started or reserved, so the same request can be resent later.
  "IMPORTS_PAUSED",
  "OCR_PAUSED",
  "UPLOADS_PAUSED",
  "JOBS_PAUSED",
  // Import uploads (P2a): 400/409/413/415/422/429
  "INVALID_FILE_NAME",
  "UPLOAD_EMPTY",
  "UPLOAD_TOO_LARGE",
  "UPLOAD_UNSUPPORTED_TYPE",
  "UPLOAD_TYPE_MISMATCH",
  "UPLOAD_INCOMPLETE",
  "UPLOAD_LIMIT_REACHED",
  "UPLOAD_IN_PROGRESS",
  "UPLOAD_FAILED",
  // Import confirmation (P3): 409
  "IMPORT_PREVIEW_UNAVAILABLE",
  "IMPORT_SELECTION_CONFLICT",
  "IMPORT_ROW_COMMITTED",
  // Server side (500/503); never carries internal detail
  "INTERNAL_ERROR",
  "SERVICE_UNAVAILABLE",
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export type ApiProblem = {
  /** Servers emit an `ApiErrorCode`; clients must tolerate codes they don't know yet. */
  code: string;
  request_id: string;
  message_key: string;
  fields?: Record<string, string>;
  retry_after_seconds?: number;
  /** VERSION_CONFLICT only: the current record, safe to show, for reload or explicit reapply. */
  current?: unknown;
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
