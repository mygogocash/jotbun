import type { DraftTable } from '../copy/draftText.ts';

/**
 * The Bun Wallet Home's lines. P2-T23 adds the budget card's words: the
 * per-day hint and how far over (bw-home), the two words private mode says in
 * their place (bw-private, §5.1's voice table), and what the card says to a
 * screen reader (ax-voiceover). P2-T24 adds the screen's own lines. Data only:
 * read through `useDraftCopy` with COMMON_COPY. Default pending owner Q3:
 * built as written; the English lines are drafts for E2-B.
 */
export const COPY = {
  'home.perDay': { th: 'เหลือวันละ {amount}', en: '{amount} a day left' },
  'home.over': { th: 'เกินงบไป {amount}', en: '{amount} over budget' },
  'home.onTrack': { th: 'ตามแผน', en: 'On track' },
  'home.overWord': { th: 'เกินงบ', en: 'Over budget' },
  'home.spokenSpent': { th: 'ใช้ไปเดือนนี้ {amount}', en: 'Spent this month {amount}' },
  'home.spokenBudget': { th: 'ใช้ไปเดือนนี้ {spent} จากงบ {limit}', en: 'Spent this month {spent} of {limit}' },
} as const satisfies DraftTable;
