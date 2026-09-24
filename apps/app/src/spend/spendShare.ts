export const SPEND_PIE_SHARE_UNLOCK_IMPORTS = 20;

export function isSpendPieShareUnlocked(
  successfulImportCount: number,
): boolean {
  return (
    Number.isFinite(successfulImportCount) &&
    successfulImportCount >= SPEND_PIE_SHARE_UNLOCK_IMPORTS
  );
}
