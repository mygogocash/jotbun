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

/** Redesign areas that can be switched on before the owner approves them (E2). */
export type RedesignArea = 'core' | 'catalogue';

/**
 * The "Bun diary" redesign, one area at a time. `EXPO_PUBLIC_REDESIGN` is a
 * comma list of areas, or `all`. Off unless set: the current screens stay the
 * default until each area's screenshots are approved.
 */
export function isRedesignEnabled(area: RedesignArea, value: string | undefined = process.env.EXPO_PUBLIC_REDESIGN): boolean {
  const areas = (value ?? '').split(',').map((part) => part.trim()).filter((part) => part.length > 0);
  return areas.includes('all') || areas.includes(area);
}
