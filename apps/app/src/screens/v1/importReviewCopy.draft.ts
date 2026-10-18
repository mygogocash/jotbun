// DRAFT COPY - AWAITING E2 APPROVAL (P3 import review and progress screens).
//
// Thai and English text for ImportReviewScreen, kept here on purpose and NOT
// in the locale catalogs (src/messages/*.json): the plan changes the import
// route and the locale messages only after the new journey's visual and copy
// approval (E2). The Thai is a first draft for the founder's or a
// translator's pass. When approved, move these lines into the catalogs, use
// `useCopy()` in the screen and delete this module. Vietnamese falls back to
// English until then.
import { useCallback } from 'react';

import { formatCopyValues } from '@mobile/i18n/messages';
import type { CopyValues } from '@mobile/i18n/messages';
import { useActiveLocale } from '@mobile/i18n/useCopy';

export const IMPORT_REVIEW_COPY_DRAFT = {
  title: { en: 'Review your import', th: 'ตรวจรายการที่นำเข้า' },
  parsing: { en: 'Reading your file. Nothing has been saved yet.', th: 'กำลังอ่านไฟล์ ยังไม่มีการบันทึกรายการใด' },
  nothingSaved: {
    en: 'Nothing from this file has been saved yet. Choose the rows to save and check each one.',
    th: 'ยังไม่มีรายการจากไฟล์นี้ถูกบันทึก เลือกแถวที่ต้องการบันทึกและตรวจทีละแถว',
  },
  walletsHeading: { en: 'Wallets in this file', th: 'กระเป๋าเงินในไฟล์นี้' },
  categoriesHeading: { en: 'Categories in this file', th: 'หมวดหมู่ในไฟล์นี้' },
  useWallet: { en: '{label}: use {wallet}', th: '{label}: ใช้ {wallet}' },
  useCategory: { en: '{label}: use {category}', th: '{label}: ใช้ {category}' },
  rowsHeading: { en: 'Rows ({count})', th: 'แถว ({count})' },
  include: { en: 'Include', th: 'รวมแถวนี้' },
  includeRow: { en: 'Include row {row}', th: 'รวมแถว {row}' },
  expense: { en: 'Expense', th: 'รายจ่าย' },
  income: { en: 'Income', th: 'รายรับ' },
  transfer: { en: 'Transfer', th: 'โอนเงิน' },
  unknown: { en: 'Unknown', th: 'ไม่ทราบ' },
  noWallet: { en: 'No wallet', th: 'ไม่มีกระเป๋าเงิน' },
  noCategory: { en: 'No category', th: 'ไม่มีหมวดหมู่' },
  rowSummary: { en: '{date} · {direction} {amount} · {wallet} · {category}', th: '{date} · {direction} {amount} · {wallet} · {category}' },
  confirmRow: { en: 'Date, direction, category and wallet are right', th: 'วันที่ ประเภท หมวดหมู่ และกระเป๋าเงินถูกต้อง' },
  confirmRowLabel: { en: 'Row {row}: date, direction, category and wallet are right', th: 'แถว {row}: วันที่ ประเภท หมวดหมู่ และกระเป๋าเงินถูกต้อง' },
  setDirection: { en: 'Row {row}: make it {direction}', th: 'แถว {row}: เปลี่ยนเป็น{direction}' },
  needsReview: { en: '{count} chosen rows still need checking', th: 'ยังมี {count} แถวที่เลือกซึ่งต้องตรวจ' },
  saveCorrections: { en: 'Save corrections', th: 'บันทึกการแก้ไข' },
  saveRows: { en: 'Save {count} rows', th: 'บันทึก {count} แถว' },
  progress: {
    en: 'Saved {committed} of {selected} · {remaining} remaining · {conflicted} not saved',
    th: 'บันทึกแล้ว {committed} จาก {selected} · เหลือ {remaining} · บันทึกไม่ได้ {conflicted}',
  },
  continue: { en: 'Continue saving', th: 'บันทึกต่อ' },
  tryAgain: { en: 'Try again', th: 'ลองอีกครั้ง' },
  unconfirmed: { en: 'Not confirmed yet. Your review is kept; try again.', th: 'ยังยืนยันไม่ได้ การตรวจของคุณยังอยู่ ลองอีกครั้ง' },
  offline: { en: "We couldn't reach Jotbun. Your review is kept; try again.", th: 'เชื่อมต่อ Jotbun ไม่ได้ การตรวจของคุณยังอยู่ ลองอีกครั้ง' },
  reviewChanged: { en: 'This import changed on another device. Reload it; your corrections are kept.', th: 'รายการนำเข้านี้ถูกแก้บนอุปกรณ์อื่น โหลดใหม่ การแก้ไขของคุณยังอยู่' },
  selectionConflict: { en: 'The rows changed since you chose them. Check them and save again; saved rows stay saved.', th: 'แถวเปลี่ยนไปหลังจากที่คุณเลือก ตรวจแล้วบันทึกอีกครั้ง แถวที่บันทึกแล้วจะไม่ถูกบันทึกซ้ำ' },
  reload: { en: 'Reload', th: 'โหลดใหม่' },
  invalid: { en: 'Some rows could not be used. Check them and try again.', th: 'บางแถวใช้ไม่ได้ ตรวจแล้วลองอีกครั้ง' },
  rowCommitted: { en: 'Some rows are already saved and cannot be changed.', th: 'บางแถวบันทึกแล้วและแก้ไขไม่ได้' },
  rateLimited: { en: 'Too many changes at once. Your review is kept; try again in a moment.', th: 'มีการเปลี่ยนแปลงมากเกินไป การตรวจของคุณยังอยู่ ลองอีกครั้งในอีกสักครู่' },
  blocked: { en: 'Saving is paused until you update Jotbun, sign in again or accept the terms. Your review is kept.', th: 'การบันทึกหยุดไว้จนกว่าคุณจะอัปเดต Jotbun ลงชื่อเข้าใช้ใหม่ หรือยอมรับข้อกำหนด การตรวจของคุณยังอยู่' },
  done: { en: 'Saved {committed} entries from this file.', th: 'บันทึกรายการจากไฟล์นี้แล้ว {committed} รายการ' },
  doneConflicted: { en: "{count} rows couldn't be saved because their wallet or category is archived.", th: 'บันทึกไม่ได้ {count} แถว เพราะกระเป๋าเงินหรือหมวดหมู่ถูกเก็บถาวร' },
  expired: { en: 'This import has expired. Nothing more can be saved from it.', th: 'รายการนำเข้านี้หมดอายุแล้ว บันทึกเพิ่มจากไฟล์นี้ไม่ได้' },
  rejected: { en: "This file couldn't be read. Nothing was saved.", th: 'อ่านไฟล์นี้ไม่ได้ ไม่มีการบันทึกรายการใด' },
  loading: { en: 'Loading', th: 'กำลังโหลด' },
} as const;

export type ImportCopyKey = keyof typeof IMPORT_REVIEW_COPY_DRAFT;

/** Draft copy for the active locale: Thai for Thai, English otherwise. */
export function useImportReviewCopy(): (key: ImportCopyKey, values?: CopyValues) => string {
  const locale = useActiveLocale();
  return useCallback(
    (key: ImportCopyKey, values?: CopyValues) => {
      const entry = IMPORT_REVIEW_COPY_DRAFT[key];
      return formatCopyValues(locale === 'th' ? entry.th : entry.en, values ?? {});
    },
    [locale],
  );
}
