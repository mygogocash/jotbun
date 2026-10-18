export function isSpendEnabled(): boolean {
  return process.env.EXPO_PUBLIC_ENABLE_SPEND !== '0';
}

/**
 * Development only: show the unconverted legacy /spend screens instead of the
 * v1 ones. Off unless explicitly set; never a runtime fallback when v1 fails.
 */
export function isLegacySpendEnabled(): boolean {
  return process.env.EXPO_PUBLIC_LEGACY_SPEND === '1';
}
