/**
 * Pure mapping from expo-image-picker permission strings to the peek status
 * used before the Spend media primer / OS sheet (#2651). Kept free of expo /
 * DOM imports so node unit tests can assert without native modules.
 */
export type PeekSpendMediaPermissionStatus =
  | "granted"
  | "denied"
  | "undetermined"
  | "unavailable";

export function mapImagePickerPermissionToPeek(
  status: string,
): Exclude<PeekSpendMediaPermissionStatus, "unavailable"> {
  if (status === "granted" || status === "limited") return "granted";
  if (status === "denied") return "denied";
  return "undetermined";
}
