import type { DraftTable } from '../copy/draftText.ts';

/**
 * Insights' lines (bw-insights, wc-calendar, es-empty-insights), Thai first;
 * Vietnamese shows the English (E2). Data only: read through `useDraftCopy`.
 * Every word the screens draw is here, in the catalogs through `tc()`, or a
 * date from src/ui/dateStep.ts, so P2-T38 moves them all at once.
 * Default pending owner Q3: built as written. Every English line is a draft
 * for E2-C, and so is each Thai line marked "draft" below (the plan's, and the
 * lines no board shows).
 */
export const COPY = {
  'insights.title': { th: 'สรุป', en: 'Insights' },
  'insights.tabSpending': { th: 'ใช้จ่าย', en: 'Spending' },
  'insights.tabInOut': { th: 'เงินเข้า-ออก', en: 'In and out' },
  'insights.tabCalendar': { th: 'ปฏิทิน', en: 'Calendar' },
  'insights.monthly': { th: 'รายเดือน', en: 'Monthly' },
  'insights.whatIsThis': { th: 'ตัวเลขนี้คืออะไร', en: 'What is this number?' },
  // draft
  'insights.spentExplain': { th: 'ยอดนี้คือรายจ่ายที่บันทึกแล้วในเดือนนี้ ไม่รวมการโอนและรายการที่ยังรอส่ง', en: 'This is the money out recorded this month. It leaves out moves between your wallets and entries still waiting to send.' },
  'insights.daysToEnd': { th: 'ใช้ไปแล้ว · อีก {n} วันจบเดือน', en: 'Spent so far · {n} days to the end of the month' },
  'insights.chartName': { th: 'ใช้จ่ายรายเดือน {from}ถึง{to}', en: 'Monthly spending, {from} to {to}' },
  // draft
  'insights.moneyIn': { th: 'เงินเข้า', en: 'Money in' },
  // draft
  'insights.moneyOut': { th: 'เงินออก', en: 'Money out' },
  'insights.monthLine': { th: 'ใช้ไป {amount} · จด {n} จาก {d} วัน', en: 'Spent {amount} · logged {n} of {d} days' },
  'insights.today': { th: 'วันนี้', en: 'Today' },
  'insights.earlyTitle': { th: 'จดอีก {n} วัน กราฟจะขึ้นตรงนี้', en: 'Log {n} more days and the chart shows here' },
  'insights.earlyBody': { th: 'กราฟต้องมีบันทึกอย่างน้อย 3 วัน ถึงจะเทียบกันได้', en: 'The chart needs at least 3 days of entries to compare' },
  'insights.noPrevious': { th: 'ยังไม่มีเดือนก่อนให้เทียบ', en: 'No earlier month to compare yet' },
  'insights.nextDay': { th: 'วันถัดไป', en: 'Next day' },
  'insights.categories': { th: 'หมวดหมู่', en: 'Categories' },
  'insights.soFar': { th: 'ที่จดไว้แล้ว', en: 'Logged so far' },
  'insights.entries': { th: '{count} รายการ', en: '{count} entries' },
  'insights.budget': { th: 'งบ {amount}', en: 'Budget {amount}' },
  // draft (W21: no board)
  'insights.kept': { th: 'เก็บได้ {amount}', en: 'Kept {amount}' },
  // draft (W21: no board)
  'insights.inOutName': { th: 'เงินเข้าและเงินออกรายเดือน {from}ถึง{to}', en: 'Money in and out by month, {from} to {to}' },
  // draft (W21: no board)
  'insights.inOutMonth': { th: '{month} เงินเข้า {in} เงินออก {out}', en: '{month}: money in {in}, money out {out}' },
  'insights.previousMonth': { th: 'เดือนก่อน', en: 'Previous month' },
  'insights.nextMonth': { th: 'เดือนถัดไป', en: 'Next month' },
  'insights.perDay': { th: 'บาท\nต่อวัน', en: 'baht\na day' },
  'insights.legend': { th: 'สีเข้มขึ้นเมื่อใช้มากขึ้น ตั้งแต่ 0 ถึงมากกว่า 2,000 บาทต่อวัน', en: 'Darker as you spend more, from 0 to over 2,000 baht a day' },
  // draft (wc-calendar says กรอบดำ, black frame; the frame is ink, which is light in dark mode)
  'insights.legendToday': { th: 'กรอบคือวันนี้', en: 'The framed day is today' },
} as const satisfies DraftTable;
