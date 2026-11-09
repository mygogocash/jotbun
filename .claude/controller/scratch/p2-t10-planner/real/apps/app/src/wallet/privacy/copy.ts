import type { DraftTable } from '../copy/draftText.ts';

/**
 * Private mode's lines: bw-private's words, and ax-voiceover's for what the
 * eye announces. Data only: read through `useDraftCopy`. Default pending
 * owner Q3: built as written; the English lines are drafts for E2-A.
 */
export const COPY = {
  'privacy.hide': { th: 'ซ่อนยอดเงิน', en: 'Hide amounts' },
  'privacy.show': { th: 'แสดงยอดเงิน', en: 'Show amounts' },
  'privacy.hiddenAnnounce': { th: 'ซ่อนยอดเงินอยู่', en: 'Amounts hidden' },
  'privacy.shownAnnounce': { th: 'แสดงยอดเงินแล้ว', en: 'Amounts shown' },
  'privacy.tipTitle': { th: 'โหมดส่วนตัว', en: 'Private mode' },
  'privacy.tipBody': {
    th: 'ซ่อนยอดเงินทุกที่แล้ว แตะรูปตาอีกครั้งเมื่ออยากดู เหมาะตอนอยู่บนรถไฟฟ้า',
    en: 'Amounts are hidden everywhere. Tap the eye again when you want to see them. Handy on the train.',
  },
  'privacy.tipClose': { th: 'ปิดคำแนะนำ', en: 'Close tip' },
} as const satisfies DraftTable;
