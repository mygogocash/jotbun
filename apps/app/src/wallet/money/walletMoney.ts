// Money text for the Bun Wallet (W9, §5.1): ฿ first, with thousands commas,
// over formatMinor, so satang never pass through a JS number. The compact form
// drops .00 only when the satang are zero; the exact form always shows two
// decimals. An expense takes the true minus (U+2212), income a plus, a balance
// a minus only below zero, and zero is never signed. Pure: a Node test reads it.
import type { Minor } from '@gogospend/contracts';

import type { WalletT } from '../copy/draftText.ts';
import { formatMinor } from '../../spend/v1/money.ts';

/**
 * `none`: the size of the amount, as a list row draws it (the row says what
 * it is). `expense` and `income`: that size after − or +. `balance`: a minus
 * only below zero.
 */
export type MoneySign = 'none' | 'expense' | 'income' | 'balance';

/** Every amount in private mode (W10, D41), drawn at the amount's own size. */
export const HIDDEN_AMOUNT = '฿••••';

// U+2212, the true minus sign: as wide as the plus, as the Bun diary's Amount draws it.
const MINUS = '\u2212';

/** `฿12,480`, `฿50.25`, `−฿50`, `+฿35,000`. Anything but a canonical satang string throws a TypeError (formatMinor's). */
export function walletMoneyText(minor: Minor, options: { sign?: MoneySign; exact?: boolean } = {}): string {
  const { sign = 'none', exact = false } = options;
  const text = formatMinor(minor, 'th');
  const negative = text.startsWith('-');
  const size = negative ? text.slice(1) : text;
  const shown = !exact && size.endsWith('.00') ? size.slice(0, -3) : size;
  if (minor === '0') return shown;
  if (sign === 'expense') return `${MINUS}${shown}`;
  if (sign === 'income') return `+${shown}`;
  if (sign === 'balance' && negative) return `${MINUS}${shown}`;
  return shown;
}

/**
 * A per-day figure in whole baht, rounded down (W9, C4): 690.99 a day reads
 * ฿690. It is never negative: budgetPace has no per-day figure once over.
 */
export function perDayText(perDayMinor: Minor): string {
  return walletMoneyText(perDayMinor, { exact: true }).slice(0, -3);
}

/**
 * What a screen reader says (§4: ฿ is read as บาท): `12,480 บาท`; with
 * satang, `50 บาท 25 สตางค์`; below zero, `ติดลบ 3,920 บาท`
 * (`common.baht`, `common.satang`, `common.minus`).
 */
export function spokenMoney(minor: Minor, t: WalletT): string {
  const text = formatMinor(minor, 'th');
  const negative = text.startsWith('-');
  const [baht, satang] = text.slice(negative ? 2 : 1).split('.');
  const amount = satang === '00'
    ? t('common.baht', { amount: baht })
    : t('common.satang', { baht, satang: satang.replace(/^0/, '') });
  return negative ? t('common.minus', { amount }) : amount;
}
