/**
 * Per-process bounds on receipt work in one API process (P2c review fixes).
 *
 * - `copiesPerProcess`: receipt copies running at once. Checked before a copy
 *   is reserved, so a refused request (503 + `retry_after_seconds`) holds no
 *   reservation. The database separately allows an account at most four
 *   copies in flight and a daily copy budget.
 * - `copyDeadlineMs`: one deadline for the whole copy (the store's server-side
 *   COPY, then the HEAD that checks it).
 * - `downloadsPerProcess` / `downloadsPerAccount`: receipt downloads streamed
 *   at once, and how many of those one account may hold, so one account
 *   cannot take every slot.
 * - `downloadIdleMs` / `downloadTotalMs`: a download that makes no progress
 *   for the idle limit, or is still running at the total limit, is cut off.
 *
 * Provided as one object per application (ATTACHMENT_LIMITS) and read at use
 * time; only tests change it.
 */
export type AttachmentLimits = {
  copiesPerProcess: number;
  copyDeadlineMs: number;
  downloadsPerProcess: number;
  downloadsPerAccount: number;
  downloadIdleMs: number;
  downloadTotalMs: number;
};

export const ATTACHMENT_LIMITS = Symbol('ATTACHMENT_LIMITS');

export const DEFAULT_ATTACHMENT_LIMITS: Readonly<AttachmentLimits> = {
  copiesPerProcess: 4,
  copyDeadlineMs: 60_000,
  downloadsPerProcess: 8,
  downloadsPerAccount: 2,
  downloadIdleMs: 30_000,
  downloadTotalMs: 300_000,
};
