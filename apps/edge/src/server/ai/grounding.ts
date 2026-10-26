/**
 * Grounding: Bun may only say numbers that came from the user's own records.
 * Every number in a model's text is read (Thai and Arabic digits, with or
 * without thousands separators and satang) and must equal one of the
 * allowed values. Any other number means the text is not shown; the caller
 * falls back to the plain facts.
 */

const THAI_DIGITS = /[๐-๙]/g
const NUMBER_IN_TEXT = /\d[\d,]*(?:\.\d+)?/g

/** Baht amounts from exact satang, and plain counts, as comparable numbers in hundredths. */
export class AllowedNumbers {
  private readonly hundredths = new Set<bigint>()

  /** Text writes an overspend as "over by ฿120", so the absolute amount is what is allowed. */
  addSatang(minor: string | bigint): this {
    const value = BigInt(minor)
    this.hundredths.add(value < 0n ? -value : value)
    return this
  }

  addCount(value: number): this {
    if (Number.isInteger(value) && value >= 0) this.hundredths.add(BigInt(value) * 100n)
    return this
  }

  /** The day, month and year of an ISO date, and its Buddhist-era year. */
  addDate(iso: string): this {
    const [y, m, d] = iso.split('-').map(Number)
    if (!y || !m || !d) return this
    for (const value of [y, y + 543, m, d]) this.addCount(value)
    return this
  }

  has(hundredths: bigint): boolean {
    return this.hundredths.has(hundredths)
  }
}

/** Every number written in `text`, in hundredths (so "60", "60.00" and "๖๐" are all 6000n). */
export function numbersIn(text: string): bigint[] {
  const ascii = text.replace(THAI_DIGITS, (d) => String(d.charCodeAt(0) - 0x0e50))
  const out: bigint[] = []
  for (const match of ascii.matchAll(NUMBER_IN_TEXT)) {
    const raw = match[0].replace(/,(?=\d{3}(?:\D|$))/g, '').replace(/,$/, '')
    if (!/^\d+(?:\.\d+)?$/.test(raw)) {
      // "60,120" with a non-thousands comma: read each part on its own.
      for (const part of raw.split(',')) if (/^\d+$/.test(part)) out.push(BigInt(part) * 100n)
      continue
    }
    const [whole, fraction = ''] = raw.split('.')
    if (fraction.length > 2) {
      out.push(-1n) // more precision than money has: never grounded
      continue
    }
    out.push(BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0') || '0'))
  }
  return out
}

/** True when every number in `text` is allowed. */
export function isGrounded(text: string, allowed: AllowedNumbers): boolean {
  return numbersIn(text).every((value) => allowed.has(value))
}

/** "฿1,250.50", or "฿60" for whole baht, from exact satang (never through floating point). */
export function formatBaht(minor: string | bigint): string {
  const satang = BigInt(minor)
  const negative = satang < 0n
  const abs = negative ? -satang : satang
  const whole = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const cents = abs % 100n
  return `${negative ? '-' : ''}฿${whole}${cents === 0n ? '' : `.${cents.toString().padStart(2, '0')}`}`
}
