import type { DraftTable } from '../copy/draftText.ts';

/**
 * The wallet card's lines: the kind lines, ใช้ไป, the pending total and
 * today's money out (bw-home, bw-wallet, rh-offline, wc-wallet-edit), and what
 * the card says to a screen reader (ax-voiceover, rh-offline), which the card
 * joins with commas after the wallet's name. Data only: read through
 * `useDraftCopy` with COMMON_COPY. Default pending owner Q3: built as written;
 * the English lines are drafts for E2-A.
 */
export const COPY = {
  'card.kindCash': { th: 'ในกระเป๋าสตางค์', en: 'Cash in hand' },
  'card.kindBank': { th: 'บัญชีธนาคาร', en: 'Bank account' },
  'card.kindCard': { th: 'ยอดที่ใช้ไป', en: 'Amount spent' },
  'card.kindTransit': { th: 'BTS / MRT', en: 'BTS / MRT' },
  'card.spent': { th: 'ใช้ไป', en: 'Spent' },
  'card.pending': { th: 'รวม {amount} ที่กำลังบันทึก', en: 'Includes {amount} still saving' },
  'card.todayOut': { th: 'วันนี้ {amount}', en: 'Today {amount}' },
  'card.spokenLeft': { th: 'เหลือ {amount}', en: '{amount} left' },
  'card.spokenSpent': { th: 'ใช้ไป {amount}', en: '{amount} spent' },
  'card.spokenPending': { th: 'รวม {amount}ที่กำลังบันทึก', en: 'including {amount} still saving' },
  'card.spokenToday': { th: 'วันนี้ใช้ {amount}', en: '{amount} spent today' },
} as const satisfies DraftTable;
