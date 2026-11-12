import type { DraftTable } from '../copy/draftText.ts';

/**
 * The wallets list's lines (wc-wallets) and the reorder tray's (W28); then a
 * new wallet's three steps (wc-wallet-type, the fields, bw-adding), editing
 * (wc-wallet-edit) and the correction tray (P2-T21). Data only: read through
 * `useDraftCopy` with COMMON_COPY and the card's COPY. Default pending owner
 * Q3: built as written. The English lines, the Thai lines the plan marks
 * draft (wallets.unarchive, wallets.moveUp and wallets.moveDown) and the ones
 * its tasks add (P2-T20: wallets.rowLabelSpent, the board's label for a credit
 * card's row, and wallets.unarchiveLabel, which names the wallet; P2-T21:
 * wallets.archiveLaterBelow, for a wallet below zero, and wallet.gone, P2-T22's
 * line, which an archived or unknown wallet's edit says) are drafts for E2-B.
 * wallets.archiveLater writes the plan's ฿0 as {zero}, so both of its amounts
 * are drawn as amounts; it reads the same.
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
  'wallets.newStep': { th: 'กระเป๋าใหม่ · ขั้นที่ {n} จาก 3', en: 'New wallet · step {n} of 3' },
  'wallets.typeQuestion': { th: 'อยากเพิ่มกระเป๋าแบบไหน?', en: 'What kind of wallet is it?' },
  'wallets.typeHint': { th: 'เลือกแบบที่ใกล้ที่สุด ชื่อและหน้าตาเปลี่ยนเองได้ในขั้นถัดไป', en: 'Pick the closest. You choose its name and look in the next step.' },
  'wallets.kindCash': { th: 'เงินสด', en: 'Cash' },
  'wallets.kindCashLine': { th: 'เงินในกระเป๋าสตางค์ จดเองเมื่อจ่าย', en: 'Money in your purse, noted when you pay' },
  'wallets.kindBank': { th: 'บัญชีธนาคาร', en: 'Bank account' },
  'wallets.kindBankLine': { th: 'ออมทรัพย์ บัญชีเงินเดือน หรือพร้อมเพย์', en: 'Savings, salary or PromptPay' },
  'wallets.kindCard': { th: 'บัตรเครดิต', en: 'Credit card' },
  'wallets.kindCardLine': { th: 'ดูยอดที่ใช้ไป จนกว่าจะจ่ายคืน', en: 'See what you spent until you pay it back' },
  'wallets.kindTransit': { th: 'บัตรเดินทาง', en: 'Travel card' },
  'wallets.kindTransitLine': { th: 'บัตรที่เติมเงินไว้ จดค่าเดินทางแต่ละเที่ยว', en: 'A card you top up, with each trip noted' },
  'wallets.typeNote': { th: 'ทุกแบบนับยอดแบบเดียวกัน บัตรเครดิตจะแสดงเป็นยอดที่ใช้ไปแทนยอดคงเหลือ', en: 'Every kind adds up the same way. A credit card shows what you spent instead of what is left.' },
  'wallets.name': { th: 'ชื่อกระเป๋า', en: 'Wallet name' },
  'wallets.face': { th: 'หน้าบัน', en: "Bun's face" },
  'wallets.faceSmile': { th: 'ยิ้ม', en: 'Smile' },
  'wallets.faceWink': { th: 'ขยิบตา', en: 'Wink' },
  'wallets.faceCalm': { th: 'สบาย ๆ', en: 'Calm' },
  'wallets.faceHappy': { th: 'ดีใจ', en: 'Happy' },
  'wallets.faceWow': { th: 'ว้าว', en: 'Wow' },
  'wallets.material': { th: 'วัสดุ', en: 'Material' },
  'wallets.materialSilk': { th: 'ไหม', en: 'Silk' },
  'wallets.materialPaper': { th: 'กระดาษ', en: 'Paper' },
  'wallets.materialTitanium': { th: 'ไทเทเนียม', en: 'Titanium' },
  'wallets.materialSky': { th: 'ฟ้า', en: 'Sky' },
  'wallets.materialPeach': { th: 'พีช', en: 'Peach' },
  'wallets.opening': { th: 'ยอดเริ่มต้น', en: 'Opening balance' },
  'wallets.trackingFrom': { th: 'เริ่มจด {date}', en: 'Tracking from {date}' },
  'wallets.hasRecords': { th: 'กระเป๋านี้มีรายการแล้ว ถ้าแก้ยอดนี้ บันจะถามเหตุผลก่อนบันทึก', en: 'This wallet has entries. If you change this amount, Bun asks why before saving.' },
  'wallets.editTitle': { th: 'แก้ไขกระเป๋า', en: 'Edit wallet' },
  'wallets.preview': { th: 'ตัวอย่างการ์ด {name} ยอด {amount}', en: 'Card preview {name} balance {amount}' },
  'wallets.archive': { th: 'เก็บกระเป๋านี้ถาวร', en: 'Archive this wallet' },
  'wallets.archiveLater': { th: 'เก็บได้เมื่อยอดเหลือ {zero} ตอนนี้มี {amount} โอนไปกระเป๋าอื่นก่อนนะ', en: 'You can archive it at {zero}. It holds {amount} now: move it to another wallet first.' },
  'wallets.archiveLaterBelow': { th: 'เก็บได้เมื่อยอดเหลือ {zero} ตอนนี้ติดลบ {amount} โอนเงินเข้ามาก่อนนะ', en: 'You can archive it at {zero}. It is {amount} below zero now: move money in first.' },
  'wallets.added': { th: 'เพิ่มกระเป๋าแล้ว', en: 'Wallet added' },
  'wallets.ready': { th: '{name}พร้อมให้จดแล้ว', en: '{name} is ready to use' },
  'wallet.gone': { th: 'กระเป๋านี้ถูกเก็บถาวรหรือไม่มีแล้ว', en: 'This wallet is archived or no longer here.' },
} as const satisfies DraftTable;
