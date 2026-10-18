/**
 * P2c receipt attachments.
 *
 * A receipt image is attachable only as the sanitized (re-encoded,
 * metadata-free) image of the caller's own import preview (P2b): the preview's
 * `summary.image.attachment_id` names it, and it stays attachable until
 * `summary.image.attachable_until` (its unattached 24-hour lifetime). The
 * server never accepts a raw upload or an object key here.
 *
 * Retaining, replacing and removing are commands on the transaction
 * (`POST`/`PUT`/`DELETE /v1/transactions/:id/attachment`, `If-Match` = the
 * transaction's current version, `Idempotency-Key`): each moves the
 * transaction to its next version, and the transaction's snapshot (sync
 * deltas, `GET /v1/transactions/:id`, history) carries `attachment_id` while
 * it has a receipt. Retaining and replacing need the user's explicit consent
 * (`consent: "retain_receipt"`), sent only after the user chose to keep the
 * image. One transaction holds at most one receipt; one receipt may be
 * attached to several of the owner's transactions (a split bill), and its
 * image is deleted only once no transaction holds it.
 *
 * Removing a receipt deletes its image once nothing else holds it: there is
 * no undo, and restoring a deleted record does not bring a removed receipt
 * back. The client must say so before it sends the removal
 * (`ATTACHMENT_MESSAGE_KEYS.removeNoUndo`).
 *
 * `GET /v1/attachments/:id/grant` gives a five-minute download path for a
 * receipt held by one of the caller's own active (not deleted) records;
 * anything else - another account's id, an unknown id, a preview image nobody
 * retained, a receipt held only by deleted records - is the same 404. The
 * path (`ATTACHMENT_DOWNLOAD_PATH` + opaque grant) needs the owner's bound
 * session too; it is never a storage URL.
 */
/** The literal a retain or replace must carry: the user explicitly chose to keep the receipt image. */
export const RECEIPT_RETENTION_CONSENT = "retain_receipt" as const;
export type ReceiptRetentionConsent = typeof RECEIPT_RETENTION_CONSENT;

/**
 * The command payload of `AttachmentService.retain/replace/remove`.
 * `attachment_id` names the image to hold (retain, replace; absent for
 * remove); `consent` is required for retain and replace.
 */
export type AttachmentCommand = {
  transaction_id: string;
  attachment_id?: string;
  consent?: ReceiptRetentionConsent;
};

/** Body of `POST /v1/transactions/:id/attachment` (retain) and `PUT` (replace). */
export type RetainAttachmentRequest = { attachment_id: string; consent: ReceiptRetentionConsent };
export type ReplaceAttachmentRequest = RetainAttachmentRequest;

export const ATTACHMENT_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type AttachmentContentType = (typeof ATTACHMENT_CONTENT_TYPES)[number];

/** A sanitized receipt image is at most the upload cap. */
export const ATTACHMENT_MAX_BYTES = 12 * 1024 * 1024;
/** A download grant expires after this. */
export const ATTACHMENT_GRANT_MINUTES = 5;
/** Grants are relative API paths under this prefix (the bound session is still required). */
export const ATTACHMENT_DOWNLOAD_PATH = "/v1/attachment-files/";

export type AttachmentGrant = {
  /** Relative API path; valid until `expires_at`. Ask for a new grant after that. */
  url: string;
  expires_at: string;
  content_type: AttachmentContentType;
  /** The image's exact size and lowercase hex SHA-256: check the download against them. */
  bytes: number;
  sha256: string;
};

/**
 * Message keys for the attachment journey. No screen exists yet (P3/E2): the
 * Thai and English text needs E2 approval, and must say what
 * `ATTACHMENT_COPY_REQUIREMENTS` lists for each key.
 */
export const ATTACHMENT_MESSAGE_KEYS = {
  /** Asked before a retain or replace sends `consent`. */
  retainConsent: "attachments.retain_consent",
  /** Shown before a removal is sent (and before a replace, for the image it drops). */
  removeNoUndo: "attachments.remove_no_undo",
  /** `422` on `attachment_id`: the image can no longer be retained (past `attachable_until`). */
  expired: "errors.attachment_expired",
  /** `422` on `attachment_id`: this receipt was removed; it cannot be attached again. */
  removed: "errors.attachment_removed",
  /** `422`: the record already has a receipt (use replace). */
  present: "errors.attachment_present",
  /** `422`: the record has no receipt to replace or remove. */
  missing: "errors.attachment_missing",
  /** `422`: a replace named the receipt the record already has. */
  unchanged: "errors.attachment_unchanged",
  /** `422` on `consent`: retain and replace need the user's explicit consent. */
  consentRequired: "errors.consent_required",
} as const;

/** What the approved copy for each key must tell the user. */
export const ATTACHMENT_COPY_REQUIREMENTS: Readonly<Record<string, string>> = {
  "attachments.retain_consent":
    "The receipt image is kept with this record until the user removes it or deletes the record for good (30 days after deletion), or deletes the account.",
  "attachments.remove_no_undo":
    "Removing the receipt deletes its image permanently. It cannot be undone, and restoring the record does not bring it back.",
};

const SHA256 = /^[0-9a-f]{64}$/;

/** True for exactly the `AttachmentGrant` wire shape. */
export function isAttachmentGrant(value: unknown): value is AttachmentGrant {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const grant = value as Record<string, unknown>;
  return (
    Object.keys(grant).sort().join(",") === "bytes,content_type,expires_at,sha256,url" &&
    typeof grant.url === "string" &&
    grant.url.startsWith(ATTACHMENT_DOWNLOAD_PATH) &&
    /^[A-Za-z0-9_-]{1,64}$/.test(grant.url.slice(ATTACHMENT_DOWNLOAD_PATH.length)) &&
    typeof grant.expires_at === "string" &&
    !Number.isNaN(Date.parse(grant.expires_at)) &&
    ATTACHMENT_CONTENT_TYPES.includes(grant.content_type as AttachmentContentType) &&
    Number.isSafeInteger(grant.bytes) &&
    (grant.bytes as number) >= 1 &&
    (grant.bytes as number) <= ATTACHMENT_MAX_BYTES &&
    typeof grant.sha256 === "string" &&
    SHA256.test(grant.sha256)
  );
}
