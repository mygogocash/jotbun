import type { AiFigure, AiLocale, BunFact } from '@gogospend/contracts'

import { formatBaht } from './grounding'

// The app's own names for the built-in categories (messages/*.json), so a
// plain fact reads the same as the screen beside it. Vietnamese falls back
// to English, as in the app (owner decision, 19 October 2026).
const CATEGORY_NAMES: Record<string, { th: string; en: string }> = {
  food: { th: 'อาหาร', en: 'Food' },
  travel: { th: 'การเดินทาง', en: 'Travel' },
  household: { th: 'ของใช้ในบ้าน', en: 'Household' },
  bills: { th: 'ค่าบิล', en: 'Bills' },
  shopping: { th: 'ช้อปปิ้ง', en: 'Shopping' },
  fun: { th: 'สันทนาการ', en: 'Fun' },
  salary: { th: 'เงินเดือน', en: 'Salary' },
  bonus: { th: 'โบนัส', en: 'Bonus' },
  side_job: { th: 'งานเสริม', en: 'Side job' },
  gift: { th: 'ของขวัญ', en: 'Gift' },
}

const lang = (locale: AiLocale): 'th' | 'en' => (locale === 'th' ? 'th' : 'en')

export function categoryText(fact: Pick<BunFact, 'category_key' | 'category_label'>, locale: AiLocale): string {
  if (fact.category_label) return fact.category_label
  const known = fact.category_key ? CATEGORY_NAMES[fact.category_key] : undefined
  return known ? known[lang(locale)] : lang(locale) === 'th' ? 'อื่น ๆ' : 'Other'
}

/** One fact as a short, kind sentence: the note whenever AI is off or its text is not grounded. */
export function factSentence(fact: BunFact, locale: AiLocale): string {
  const th = lang(locale) === 'th'
  const money = fact.amount_minor ? formatBaht(fact.amount_minor) : ''
  switch (fact.kind) {
    case 'over_budget':
      return th ? `เกินงบไป ${money} แล้วนะ ไม่เป็นไร ยังเหลืออีก ${fact.days} วัน ค่อย ๆ ปรับกัน` : `It happens: ${money} over budget, ${fact.days} days to go.`
    case 'spent_today':
      return th ? `วันนี้จดไป ${fact.count} รายการ รวม ${money}` : `${fact.count} logged today, ${money} in all.`
    case 'no_records_today':
      return th ? 'วันนี้ยังไม่ได้จดเลย จดรายการแรกกันไหม' : 'Nothing logged yet today. Add your first one?'
    case 'budget_left':
      return th ? `งบเดือนนี้เหลือ ${money} อีก ${fact.days} วัน` : `${money} left this month, ${fact.days} days to go.`
    case 'budget_per_day':
      return th ? `ใช้ได้วันละ ${money} ก็ยังอยู่ในงบ` : `${money} a day keeps you on track.`
    case 'logged_days_week':
      return th ? `สัปดาห์นี้จดไป ${fact.count} จาก ${fact.days} วันแล้ว เก่งมาก` : `You logged ${fact.count} of the last ${fact.days} days. Nice rhythm.`
    case 'top_category':
      return th ? `เดือนนี้ใช้กับ${categoryText(fact, locale)}มากที่สุด ${money}` : `${categoryText(fact, locale)} leads this month at ${money}.`
    case 'month_spent':
      return th ? `เดือนนี้ใช้ไปแล้ว ${money}` : `${money} spent this month.`
    case 'month_income':
      return th ? `เดือนนี้มีรายรับ ${money}` : `${money} came in this month.`
  }
}

export function factsText(facts: readonly BunFact[], locale: AiLocale, max = 2): string {
  return facts.slice(0, max).map((fact) => factSentence(fact, locale)).join(' ')
}

// Ask Bun's figure labels use the words of the screens beside them
// (messages/*.json: "Money out", "Money in", "Budget", "Spent", "left").
const FIGURE_WORDS = {
  out: { th: 'จ่ายออก', en: 'Money out' },
  in: { th: 'รับเข้า', en: 'Money in' },
  budget: { th: 'งบประมาณ', en: 'Budget' },
  spent: { th: 'ใช้ไป', en: 'Spent' },
  left: { th: 'คงเหลือ', en: 'Left' },
  noDescription: { th: 'ไม่มีรายละเอียด', en: 'No description' },
} as const
export type FigureWord = keyof typeof FIGURE_WORDS

const MONTHS = {
  th: ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
} as const

export const figureWord = (word: FigureWord, locale: AiLocale): string => FIGURE_WORDS[word][lang(locale)]

/** Thai years are Buddhist era, as everywhere on the phone. */
const yearText = (year: number, locale: AiLocale) => String(lang(locale) === 'th' ? year + 543 : year)

/** A YYYY-MM month: "Oct 2026", "ต.ค. 2569". */
export function monthText(month: string, locale: AiLocale): string {
  const [y, m] = month.split('-').map(Number)
  return `${MONTHS[lang(locale)][m - 1]} ${yearText(y, locale)}`
}

/**
 * An inclusive range of YYYY-MM-DD days, always with its year so a figure
 * from last year is never mistaken for this one: "1–29 Oct 2026",
 * "28 Sep – 3 Oct 2026", "28 Dec 2025 – 3 Jan 2026".
 */
export function periodText(from: string, through: string, locale: AiLocale): string {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = through.split('-').map(Number)
  const months = MONTHS[lang(locale)]
  const end = `${td} ${months[tm - 1]} ${yearText(ty, locale)}`
  if (from === through) return end
  if (fy === ty && fm === tm) return `${fd}–${end}`
  if (fy === ty) return `${fd} ${months[fm - 1]} – ${end}`
  return `${fd} ${months[fm - 1]} ${yearText(fy, locale)} – ${end}`
}

/** A category's budget left: "Food left", "อาหาร คงเหลือ". */
export function leftOf(category: string, locale: AiLocale): string {
  return lang(locale) === 'th' ? `${category} คงเหลือ` : `${category} left`
}

/** What a figure is, then when: "Food, 1–29 Oct 2026", "อาหาร 1–29 ต.ค. 2569". */
export function figureLabel(what: string, when: string, locale: AiLocale): string {
  return lang(locale) === 'th' ? `${what} ${when}` : `${what}, ${when}`
}

/** Ask Bun's answer when the model's own words could not be grounded: the figures the tools read. */
export function figuresText(figures: readonly AiFigure[], locale: AiLocale): string {
  if (figures.length === 0) return lang(locale) === 'th' ? 'บันหาข้อมูลนี้ในบันทึกของคุณไม่เจอ' : 'Bun could not find that in your diary.'
  const lines = figures.slice(0, 4).map((f) => `${f.label}: ${formatBaht(f.amount_minor)}`)
  return `${lang(locale) === 'th' ? 'จากบันทึกของคุณ' : 'From your diary'} — ${lines.join('; ')}`
}
