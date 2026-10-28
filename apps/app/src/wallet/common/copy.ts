import type { DraftTable } from '../copy/draftText.ts';

/** Shared wallet lines. Data only: a screen reads them through `useDraftCopy`. */
export const COMMON_COPY = {
  'common.close': { th: 'ปิด', en: 'Close' },
  'common.back': { th: 'กลับ', en: 'Back' },
  'common.next': { th: 'ถัดไป', en: 'Next' },
  'common.save': { th: 'บันทึก', en: 'Save' },
  'common.undo': { th: 'เลิกทำ', en: 'Undo' },
  'common.later': { th: 'ไว้ทีหลัง', en: 'Later' },
  'common.done': { th: 'เสร็จ', en: 'Done' },
  'common.tryAgain': { th: 'ลองอีกครั้ง', en: 'Try again' },
  'common.amountHidden': { th: 'ซ่อนยอดเงินอยู่', en: 'Amount hidden' },
  'common.baht': { th: '{amount} บาท', en: '{amount} baht' },
  'common.satang': { th: '{baht} บาท {satang} สตางค์', en: '{baht} baht {satang} satang' },
  'common.minus': { th: 'ติดลบ {amount}', en: 'minus {amount}' },
} as const satisfies DraftTable;
