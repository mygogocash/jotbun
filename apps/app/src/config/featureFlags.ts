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

/** Areas of the "Bun diary" redesign, each switched on once its screenshots are approved (E2). */
export type RedesignArea = 'core' | 'catalogue' | 'planning' | 'insights' | 'account';

/**
 * Approved areas, on by default. The core loop (Home, Quick add, History,
 * Record) passed E2 checkpoint 1 on 19 October 2026. The catalogue is a
 * development tool and stays opt-in. Planning (R4: Budget, Wallets,
 * Categories) is built behind its own area until E2 checkpoint 2, and
 * Insights (R5: recap, calendar, streak, reminders) until E2 checkpoint 3,
 * and Account (R6: first run, sign-in, Settings, privacy) until checkpoint 4.
 */
const APPROVED: readonly RedesignArea[] = ['core'];

/**
 * Whether a redesign area is on. `EXPO_PUBLIC_REDESIGN` is a comma list:
 * - `off` (or `0`) switches every area off, back to the current screens;
 * - `-<area>` switches one area off;
 * - `<area>` or `all` switches areas on.
 * An approved area is on unless switched off; any other area only when named.
 */
export function isRedesignEnabled(area: RedesignArea, value: string | undefined = process.env.EXPO_PUBLIC_REDESIGN): boolean {
  const parts = (value ?? '').split(',').map((part) => part.trim().toLowerCase()).filter((part) => part.length > 0);
  if (parts.includes('off') || parts.includes('0') || parts.includes(`-${area}`)) return false;
  return APPROVED.includes(area) || parts.includes('all') || parts.includes(area);
}
