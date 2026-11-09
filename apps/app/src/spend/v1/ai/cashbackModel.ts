// The GoGoCash bridge on Insights (premium plan D16). Pure.
//
// - It counts the month's purchases at shops where GoGoCash, Jotbun's sister
//   app, gives cashback. A count, never a baht figure: the public catalogue
//   carries no rates, so any amount would be invented.
// - Matching is done here, on the phone, against the catalogue; no record
//   ever leaves the phone for it.
// - Trust first: nothing shows until the person has logged on 7 days this
//   month, nothing shows when there is nothing to say, and the person is
//   asked once before tips are shown. "No thanks" is remembered.
import { matchCashbackBrand } from '@gogospend/contracts';
import type { CashbackBrand, TransactionDto } from '@gogospend/contracts';

export const CASHBACK_MIN_DAYS_LOGGED = 7;

export type CashbackCount = { count: number; brands: { key: string; name: string; count: number }[] };

/** The month's live expenses whose merchant or note names a cashback brand. */
export function countCashbackPurchases(records: readonly TransactionDto[], brands: readonly CashbackBrand[]): CashbackCount {
  const byBrand = new Map<string, { key: string; name: string; count: number }>();
  let count = 0;
  for (const record of records) {
    if (record.type !== 'expense' || record.deleted_at !== null) continue;
    const brand = matchCashbackBrand(record.merchant, brands) ?? matchCashbackBrand(record.note, brands);
    if (!brand) continue;
    count += 1;
    const entry = byBrand.get(brand.key) ?? { key: brand.key, name: brand.name, count: 0 };
    entry.count += 1;
    byBrand.set(brand.key, entry);
  }
  return { count, brands: [...byBrand.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)) };
}

export type CashbackView = 'tips' | 'ask' | null;

/** What Insights shows: the tips, the one-time question, or nothing. */
export function cashbackView(input: { tipsOn: boolean | null; declined: boolean; daysLogged: number; count: number }): CashbackView {
  if (input.tipsOn === null || input.count === 0 || input.daysLogged < CASHBACK_MIN_DAYS_LOGGED) return null;
  if (input.tipsOn) return 'tips';
  return input.declined ? null : 'ask';
}
