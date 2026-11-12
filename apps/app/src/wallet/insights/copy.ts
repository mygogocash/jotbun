import type { DraftTable } from '../copy/draftText.ts';

/**
 * Insights copy table (bw-insights, wc-calendar, es-empty-insights).
 * Pure data: read through `useDraftCopy`.
 * Default pending owner Q3: built as written; English lines and Thai lines marked draft are drafts for E2-C.
 */
export const COPY = {
  'insights.title': { th: 'สรุป', en: 'Insights' },
  'insights.tabSpending': { th: 'ใช้จ่าย', en: 'Spending' },
  'insights.tabInOut': { th: 'เงินเข้า-ออก', en: 'In & Out' },
  'insights.tabCalendar': { th: 'ปฏิทิน', en: 'Calendar' },
  'insights.monthly': { th: 'รายเดือน', en: 'Monthly' },
  'insights.whatIsThis': { th: 'ตัวเลขนี้คืออะไร', en: 'What is this number?' },
  'insights.spentExplain': { th: 'ยอดนี้คือรายจ่ายที่บันทึกแล้วในเดือนนี้ ไม่รวมการโอนและรายการที่ยังรอส่ง', en: 'This is confirmed spending for this month, excluding transfers and drafts waiting to sync.' },
  'insights.daysToEnd': { th: 'ใช้ไปแล้ว · อีก {n} วันจบเดือน', en: 'Spent · {n} days left in month' },
  'insights.chartName': { th: 'ใช้จ่ายรายเดือน {from}ถึง{to}', en: 'Monthly spending {from} to {to}' },
  'insights.moneyIn': { th: 'เงินเข้า', en: 'Money in' },
  'insights.moneyOut': { th: 'เงินออก', en: 'Money out' },
  'insights.monthLine': { th: 'ใช้ไป {amount} · จด {n} จาก {d} วัน', en: 'Spent {amount} · Logged {n} of {d} days' },
  'insights.today': { th: 'วันนี้', en: 'Today' },
  'insights.earlyTitle': { th: 'จดอีก {n} วัน กราฟจะขึ้นตรงนี้', en: 'Log {n} more days for the chart to appear here' },
  'insights.earlyBody': { th: 'กราฟต้องมีบันทึกอย่างน้อย 3 วัน ถึงจะเทียบกันได้', en: 'The chart needs at least 3 days of entries to compare' },
  'insights.noPrevious': { th: 'ยังไม่มีเดือนก่อนให้เทียบ', en: 'No previous months to compare yet' },
  'insights.categories': { th: 'หมวดหมู่', en: 'Categories' },
  'insights.entries': { th: '{count} รายการ', en: '{count} entries' },
  'insights.budget': { th: 'งบ {amount}', en: 'Budget {amount}' },
  'insights.legend': { th: 'สีเข้มขึ้นเมื่อใช้มากขึ้น ตั้งแต่ 0 ถึงมากกว่า 2,000 บาทต่อวัน กรอบดำคือวันนี้', en: 'Darker with higher spending, from 0 to over 2,000 baht per day. Framed day is today.' },
  'insights.sample': { th: 'ตัวอย่าง', en: 'Sample' },
  'insights.nextDay': { th: 'วันถัดไป', en: 'Next day' },
  'insights.previousMonth': { th: 'เดือนก่อน', en: 'Previous month' },
  'insights.nextMonth': { th: 'เดือนถัดไป', en: 'Next month' },
} as const satisfies DraftTable;
