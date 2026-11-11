import type { DraftTable } from '../copy/draftText.ts';

/**
 * The add tray's lines (bw-tray-amount, rh-income, rh-transfer): its titles,
 * the type switch and its name (the boards' ประเภทรายการ), the wallet chip, Tell
 * Bun, income's name field and its budget note, a quick chip's spoken words
 * and the keypad's delete key. Data only: read through `useDraftCopy`, with
 * COMMON_COPY where a part also says an amount. Default pending owner Q3:
 * built as written; the English lines, and the Thai lines marked draft (no
 * board shows them), are drafts for E2-B. P2-T15 and P2-T16 add their lines
 * here.
 */
export const COPY = {
  'add.titleExpense': { th: 'จดรายจ่าย', en: 'Add spending' },
  'add.titleIncome': { th: 'จดรายรับ', en: 'Add income' },
  'add.titleTransfer': { th: 'โอนเงิน', en: 'Move money' },
  'add.typeGroup': { th: 'ประเภทรายการ', en: 'Entry type' },
  'add.typeExpense': { th: 'รายจ่าย', en: 'Spending' },
  'add.typeIncome': { th: 'รายรับ', en: 'Income' },
  'add.typeTransfer': { th: 'โอน', en: 'Move' },
  'add.fromWallet': { th: 'จาก{wallet}', en: 'From {wallet}' },
  'add.intoWallet': { th: 'เข้า{wallet}', en: 'Into {wallet}' },
  // Draft: no board shows a wallet not yet chosen (a copied record's closed wallet).
  'add.chooseWallet': { th: 'เลือกกระเป๋า', en: 'Choose a wallet' },
  'add.tellBun': { th: 'บอกบัน', en: 'Tell Bun' },
  'add.merchantLabel': { th: 'ชื่อรายการ', en: 'Name' },
  'add.notInBudget': { th: 'ไม่นับในงบ', en: 'Not counted in the budget' },
  'add.chip': { th: '{label} {amount}', en: '{label} {amount}' },
  // Draft (the plan's): rh-income names the key ลบตัวเลข, bw-tray-amount ลบ.
  'add.deleteKey': { th: 'ลบตัวเลข', en: 'Delete a digit' },
} as const satisfies DraftTable;
