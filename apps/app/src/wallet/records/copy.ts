import type { DraftTable } from '../copy/draftText.ts';

export const COPY = {
  'records.deletedTitle': {
    th: 'รายการที่เพิ่งลบ',
    en: 'Recently deleted',
  },
  'records.deletedPolicy': {
    th: 'รายการที่ลบแล้วกู้คืนได้ภายใน 30 วัน หลังจากนั้นจะถูกลบถาวร กู้คืนแล้วรายการจะกลับไปอยู่ในวันเดิมของมัน',
    en: 'Deleted entries can be restored for 30 days. After that, they are gone for good. Restored entries return to their original day.',
  },
  'records.daysLeft': {
    th: 'เหลือ {n} วัน',
    en: '{n} days left',
  },
  'records.lastDay': {
    th: 'วันสุดท้ายที่กู้คืนได้',
    en: 'Last day to restore',
  },
  'records.restore': {
    th: 'กู้คืน',
    en: 'Restore',
  },
  'records.restoreLabel': {
    th: 'กู้คืน {title} {amount}',
    en: 'Restore {title} {amount}',
  },
  'records.deletedFooter': {
    th: 'เรียงจากที่ลบล่าสุด · ยอดในงบและกระเป๋าไม่นับรายการที่ลบ',
    en: 'Ordered by most recently deleted · Totals in budget and wallets do not count deleted entries.',
  },
  // rh-deleted's back button. The Thai is the board's; the English is a draft for E2-B.
  'records.backToHistory': {
    th: 'กลับไปประวัติ',
    en: 'Back to History',
  },
  // A restore in private mode: History's line without its amount (R109). No board shows it: Thai and English are drafts for E2-B.
  'records.restoredHidden': {
    th: '{title} กลับมาอยู่ในประวัติแล้ว',
    en: '{title} is back in History.',
  },
} as const satisfies DraftTable;
