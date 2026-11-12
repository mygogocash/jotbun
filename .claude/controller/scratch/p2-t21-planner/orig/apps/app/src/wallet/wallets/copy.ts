import type { DraftTable } from '../copy/draftText.ts';

/**
 * The wallets list's lines (wc-wallets) and the reorder tray's (W28). Data
 * only: read through `useDraftCopy` with COMMON_COPY and the card's COPY.
 * Default pending owner Q3: built as written. The English lines, the Thai
 * lines the plan marks draft (wallets.unarchive, wallets.moveUp and
 * wallets.moveDown) and the two this task adds (wallets.rowLabelSpent, the
 * board's label for a credit card's row, and wallets.unarchiveLabel, which
 * names the wallet) are drafts for E2-B.
 */
export const COPY = {
  'wallets.title': { th: 'กระเป๋าเงิน', en: 'Wallets' },
  'wallets.reorder': { th: 'จัดเรียง', en: 'Arrange' },
  'wallets.totalLabel': { th: 'รวมทุกกระเป๋า', en: 'All wallets' },
  'wallets.count': { th: 'ใช้อยู่ {n} ใบ', en: '{n} in use' },
  'wallets.held': { th: 'เงินที่มี', en: 'Money you have' },
  'wallets.creditUsed': { th: '· หักบัตรเครดิตที่ใช้ไป', en: '· less credit card spending' },
  'wallets.rowLabel': { th: '{name} {kind} ยอด {amount}', en: '{name} {kind} balance {amount}' },
  'wallets.rowLabelSpent': { th: '{name} ใช้ไป {amount}', en: '{name} spent {amount}' },
  'wallets.add': { th: 'เพิ่มกระเป๋า', en: 'Add a wallet' },
  'wallets.addLine': { th: 'เงินสด บัญชี บัตร หรือบัตรเดินทาง', en: 'Cash, a bank account, a card or a travel card' },
  'wallets.archived': { th: 'เก็บถาวร', en: 'Archived' },
  'wallets.archivedCount': { th: '{n} ใบ', en: '{n}' },
  'wallets.archivedNote': {
    th: 'รายการของกระเป๋าที่เก็บถาวรยังอยู่ในประวัติ นำกลับมาใช้ได้ทุกเมื่อ',
    en: "An archived wallet's entries stay in History. You can use it again any time.",
  },
  'wallets.unarchive': { th: 'นำกลับมาใช้', en: 'Use again' },
  'wallets.unarchiveLabel': { th: 'นำ{name}กลับมาใช้', en: 'Use {name} again' },
  'wallets.moveUp': { th: 'ย้าย{name}ขึ้น', en: 'Move {name} up' },
  'wallets.moveDown': { th: 'ย้าย{name}ลง', en: 'Move {name} down' },
} as const satisfies DraftTable;
