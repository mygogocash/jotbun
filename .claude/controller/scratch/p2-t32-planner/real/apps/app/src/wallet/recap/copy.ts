import type { DraftTable } from '../copy/draftText.ts';

/**
 * Month recap lines (bw-recap, D41, D42, W20). Data only: read through `useDraftCopy`.
 * Default pending owner Q3: built as written; the English lines, and any Thai line
 * marked draft, are drafts for E2-C.
 */
export const COPY = {
  'recap.title': { th: 'สรุปเดือน{month}', en: 'Month recap: {month}' },
  'recap.days': { th: 'จดครบ {n} จาก {d} วัน', en: 'Logged {n} of {d} days' },
  'recap.biggestDay': { th: 'วันที่ใช้มากสุด', en: 'Biggest spending day' },
  'recap.payday': { th: 'วันเงินเดือนออก', en: 'Payday' },
  'recap.cashback': { th: '{n} รายการเดือนนี้ อาจได้เงินคืนผ่าน GoGoCash', en: '{n} purchases this month may get cashback with GoGoCash' },
  'recap.sister': { th: 'บริการในเครือ', en: 'an affiliated service' },
  'recap.share': { th: 'แชร์สรุป', en: 'Share recap' },
  'recap.spentLabel': { th: 'ใช้ไปทั้งเดือน', en: 'Spent this month' },
  'recap.budget': { th: 'งบ', en: 'Budget' },
  'recap.under': { th: 'เหลือ', en: 'Left' },
  'recap.over': { th: 'เกิน', en: 'Over' },
  'recap.topCategories': { th: 'หมวดที่ใช้มากสุด', en: 'Top categories' },
  'recap.cashbackDetail': { th: 'จาก Shopee และ Lazada · GoGoCash เป็นบริการในเครือ', en: 'from Shopee and Lazada · GoGoCash is an affiliated service' },
} as const satisfies DraftTable;
