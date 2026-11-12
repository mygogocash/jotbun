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
export type RedesignArea = 'core' | 'catalogue' | 'planning' | 'insights' | 'account' | 'import' | 'companion' | 'conflict' | 'wallet' | 'signin' | 'analytics' | 'bunai';

/**
 * Approved areas, on by default. The core loop (Home, Quick add, History,
 * Record) passed E2 checkpoint 1, and Planning (R4: Budget, Wallets,
 * Categories), Insights (R5: recap, calendar, streak, reminders), Account (R6:
 * first run, sign-in, Settings, privacy) and Import (R7: the import journey
 * and receipts) passed checkpoints 2–5, all on 19 October 2026. The catalogue
 * is a development tool and stays opt-in. Imports themselves stay off: the
 * server's uploads switch (IMPORT_UPLOADS_ENABLED) is separate, and Settings
 * links to import only in the legacy build, until every import gate passes
 * (handover §8).
 *
 * The companion area (premium and AI plan, 24 October 2026: Bun's AI help,
 * Tell Bun, Ask Bun, the daily note, the GoGoCash bridge and the Thai
 * everyday categories) is on at the owner's request; its E2 screenshots are
 * still to be approved, and `-companion` switches all of it off.
 *
 * The conflict area (1D-T9: C16's choice panel, the record's choice flow and
 * History's waiting caption) waits for its E2 screenshots (decided, Q9), so it
 * is on only when named or with `all`.
 *
 * The Bun Wallet area (phase 2, W1) is not approved: it is on only when
 * named (`wallet` or `all`) until the owner approves its E2 screenshots
 * (P2-T38). While it is off, every wallet route shows today's screen.
 *
 * The signin area (1C-T8: the email code, account-exists, terms,
 * session-ended, devices and reminder drafts, and the welcome link) waits for
 * its E2 screenshots, so it is on only when named or with `all`; 1C-T9 routes
 * its screens and approves it.
 *
 * The analytics area (1D-T8: D34's consent question in the spend layout and
 * Privacy's ช่วยพัฒนา Jotbun switch) waits for its E2 screenshots (decided,
 * Q9), so it is on only when named or with `all`.
 *
 * The Bun AI area (phase 3, P3:ai-area: photos and the Bun AI screens in the
 * Bun Wallet look) waits for its E2 screenshots (E2-P3-A and E2-P3-B; P3-T24
 * approves it), so it is on only when named or with `all`, and its screens
 * show only while the wallet area is on too (src/wallet/bunai/aiArea.ts).
 */
const APPROVED: readonly RedesignArea[] = ['core', 'planning', 'insights', 'account', 'import', 'companion'];

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
