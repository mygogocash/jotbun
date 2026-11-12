// Every P6A line until its E2 approval (P6A-T2; the plan's Global Constraints,
// Copy). The Thai is the boards' (ox-widget-home, ox-widget-lock) or the
// plan's; the lines marked draft have no board. Every English line is a draft
// for E2. P6A-T13 moves the approved lines to the catalogs and keeps this
// table for the rest; later P6A tasks add their lines here. Data only: read
// it through useOutsideCopy() or outsideT().
import type { DraftTable } from '../copy/draftText.ts';

export const OUTSIDE_DRAFT = {
  // The faces.
  'outside.spentToday': { th: 'ใช้วันนี้', en: 'Spent today' },
  'outside.count': { th: '{count} รายการ', en: '{count} records' },
  'outside.today': { th: 'วันนี้ · {count} รายการ', en: 'Today · {count} records' },
  'outside.leftToday': { th: 'เหลือวันนี้', en: 'Left today' },
  'outside.about': { th: '≈ {amount}', en: '≈ {amount}' },
  'outside.overBy': { th: 'เกินงบไป', en: 'Over budget by' },
  'outside.budgetMonth': { th: 'งบ {month}', en: '{month} budget' },
  'outside.percent': { th: '{percent}%', en: '{percent}%' },
  // What VoiceOver says. The English today line ends with a full stop, since
  // the left or over line follows it in the same label.
  'outside.spokenToday': { th: 'วันนี้ใช้ {amount} {count} รายการ', en: 'Spent {amount} today, {count} records.' },
  'outside.spokenLeft': { th: 'เหลือวันนี้ประมาณ {amount}', en: 'About {amount} left today' },
  'outside.spokenOver': { th: 'เกินงบไป {amount}', en: 'Over budget by {amount}' },
  'outside.spokenGauge': { th: 'งบเดือน{month} ใช้ไป {percent} เปอร์เซ็นต์', en: '{percent} percent of the {month} budget used' },
  'outside.spokenGaugeHidden': { th: 'งบเดือนนี้ ซ่อนอยู่', en: "This month's budget is hidden" },
  'outside.spokenHidden': { th: 'วันนี้ {count} รายการ ยอดเงินซ่อนอยู่', en: 'Today, {count} records, amounts hidden' },
  // Draft.
  'outside.noBudget': { th: 'ยังไม่ได้ตั้งงบ', en: 'No budget set yet' },
  // The link words: a widget layout cannot read copy (P6A-T8).
  'outside.record': { th: 'จดรายจ่าย', en: 'Add spending' },
  'outside.scan': { th: 'สแกนสลิป', en: 'Scan a slip' },
  'outside.log': { th: 'จด', en: 'Add' },
  // Draft: the prompts and the widget's name.
  'outside.stale': { th: 'เปิด Jotbun เพื่อดูยอดวันนี้', en: "Open Jotbun to see today's spending" },
  'outside.signedOut': { th: 'เปิด Jotbun เพื่อเริ่มจด', en: 'Open Jotbun to start tracking' },
  'outside.widgetName': { th: 'Jotbun วันนี้', en: 'Jotbun today' },
} as const satisfies DraftTable;
