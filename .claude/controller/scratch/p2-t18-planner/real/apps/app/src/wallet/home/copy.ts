import type { DraftTable } from '../copy/draftText.ts';

/**
 * The Bun Wallet Home's lines. P2-T23 adds the budget card's words: the
 * per-day hint and how far over (bw-home), the two words private mode says in
 * their place (bw-private, §5.1's voice table), and what the card says to a
 * screen reader (ax-voiceover). P2-T18 adds the shell's: the bar's three
 * names, the place each says (ax-voiceover), and the + button's name and hint.
 * P2-T24 adds the screen's own lines. Data only: read through `useDraftCopy`
 * with COMMON_COPY. Default pending owner Q3: built as written; the English
 * lines are drafts for E2-B.
 */
export const COPY = {
  'home.perDay': { th: 'เหลือวันละ {amount}', en: '{amount} a day left' },
  'home.over': { th: 'เกินงบไป {amount}', en: '{amount} over budget' },
  'home.onTrack': { th: 'ตามแผน', en: 'On track' },
  'home.overWord': { th: 'เกินงบ', en: 'Over budget' },
  'home.spokenSpent': { th: 'ใช้ไปเดือนนี้ {amount}', en: 'Spent this month {amount}' },
  'home.spokenBudget': { th: 'ใช้ไปเดือนนี้ {spent} จากงบ {limit}', en: 'Spent this month {spent} of {limit}' },
  'home.tabWallets': { th: 'กระเป๋า', en: 'Wallet' },
  'home.tabInsights': { th: 'สรุป', en: 'Insights' },
  'home.tabMe': { th: 'ฉัน', en: 'Me' },
  'home.tabPlace': { th: '{n} จาก 3', en: '{n} of 3' },
  'home.add': { th: 'จดรายการ', en: 'Add an entry' },
  'home.addHint': { th: 'แตะสองครั้งเพื่อจดรายจ่ายใหม่', en: 'Double-tap to add new spending' },
} as const satisfies DraftTable;
