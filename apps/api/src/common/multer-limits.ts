/**
 * Shared Multer `limits` for Nest interceptors.
 *
 * `fieldArrayIndexLimit` is opt-in in multer 2.3.0 (GHSA-535w-7cp7-47q4 /
 * CVE-2026-82333). Our field names are plain (`file`, `avatar`, `documents`,
 * `logo_desktop`, quest banner keys) — 1 is enough to reject sparse `foo[N]`
 * indexes without breaking a single-file array field.
 */
export const MULTER_FIELD_ARRAY_INDEX_LIMIT = 1;

export type MulterUploadLimits = {
  fileSize?: number;
  files?: number;
  fieldArrayIndexLimit: number;
};

export function multerLimits(
  extra: { fileSize?: number; files?: number } = {},
): MulterUploadLimits {
  return {
    ...extra,
    fieldArrayIndexLimit: MULTER_FIELD_ARRAY_INDEX_LIMIT,
  };
}
