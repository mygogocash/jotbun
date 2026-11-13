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
  // The record (P2-T26, bw-record, rh-actions, rh-undo). The Thai is the boards'; the English lines are drafts for E2-B.
  'records.status': { th: 'สถานะ', en: 'Status' },
  'records.wallet': { th: 'กระเป๋า', en: 'Wallet' },
  'records.category': { th: 'หมวด', en: 'Category' },
  'records.note': { th: 'โน้ต', en: 'Note' },
  'records.more': { th: 'ตัวเลือกเพิ่มเติม', en: 'More options' },
  'records.edit': { th: 'แก้ไข', en: 'Edit' },
  'records.copyToday': { th: 'ทำซ้ำวันนี้', en: 'Again today' },
  'records.delete': { th: 'ลบ', en: 'Delete' },
  'records.actionEditLine': { th: 'ยอด หมวด กระเป๋า วันที่ หรือโน้ต', en: 'Amount, category, wallet, date or note' },
  'records.actionCopy': { th: 'ทำซ้ำ', en: 'Log it again' },
  'records.actionCopyLine': { th: 'จดใหม่เป็นของวันนี้', en: 'A new entry for today' },
  'records.actionDeleteLine': { th: 'กู้คืนได้ภายใน 30 วัน', en: 'You can restore it for 30 days' },
  'records.deletedBar': { th: 'ลบ {title} {amount} แล้ว', en: 'Deleted {title} {amount}' },
  // Private mode (R114, as records.restoredHidden): the undo bar names the entry without its amount, and a note
  // is not drawn. No board shows either: Thai and English are drafts for E2-B.
  'records.deletedBarHidden': { th: 'ลบ {title} แล้ว', en: 'Deleted {title}' },
  'records.noteHidden': { th: 'ซ่อนอยู่', en: 'Hidden' },
} as const satisfies DraftTable;
