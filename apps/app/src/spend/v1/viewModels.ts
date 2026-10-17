// Pure mappings from v1 DTOs to what the screens show. Money stays exact
// (BigInt over canonical strings); dates are Bangkok calendar dates.
import { bangkokDate } from '@gogospend/contracts';
import type { BuiltinCategoryKey, CategoryDto, Minor, TransactionDto, WalletDto } from '@gogospend/contracts';

import { formatMinor } from './money.ts';
import type { MoneyLocale } from './money.ts';

type Translate = (english: string, values?: Readonly<Record<string, string | number>>) => string;

/** English names of built-in categories; the app's catalogs translate them. */
export const BUILTIN_LABELS: Readonly<Record<BuiltinCategoryKey, string>> = {
  food: 'Food',
  travel: 'Travel',
  household: 'Household',
  bills: 'Bills',
  shopping: 'Shopping',
  fun: 'Fun',
  salary: 'Salary',
  bonus: 'Bonus',
  side_job: 'Side job',
  gift: 'Gift',
};

export function categoryName(category: CategoryDto, tc: Translate): string {
  return category.label ?? (category.builtin_key ? tc(BUILTIN_LABELS[category.builtin_key]) : tc('Category'));
}

/** Sum of all wallet balances (may be negative). */
export function walletsTotal(wallets: readonly WalletDto[]): Minor {
  return wallets.reduce((sum, wallet) => sum + BigInt(wallet.balance_minor), 0n).toString();
}

/** Today's date in Asia/Bangkok, the reporting time zone. */
export const todayInBangkok = (now: Date = new Date()): string => bangkokDate(now);
export const monthOf = (date: string): string => date.slice(0, 7);

/** Inclusive Gregorian bounds of a `YYYY-MM` month. */
export function monthRange(month: string): { from: string; through: string } {
  const [year, monthNumber] = month.split('-').map(Number);
  const last = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return { from: `${month}-01`, through: `${month}-${String(last).padStart(2, '0')}` };
}

/** The month before or after `YYYY-MM`. */
export function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const index = year * 12 + (monthNumber - 1) + delta;
  return `${String(Math.floor(index / 12)).padStart(4, '0')}-${String((index % 12) + 1).padStart(2, '0')}`;
}

export type RecordView = {
  id: string;
  version: number;
  type: TransactionDto['type'];
  title: string;
  detail: string;
  amountText: string;
  /** Spoken amount: "Expense ฿65.00", never just a sign. */
  amountLabel: string;
  occurredOn: string;
  note: string | null;
};

/**
 * One record as a row: the category (or "Transfer") as title, the wallet(s)
 * as detail, and a signed amount - money out shown with "-", money in with
 * "+", a transfer unsigned (it moves money between the user's own wallets).
 */
export function recordView(
  record: TransactionDto,
  lookups: { wallets: ReadonlyMap<string, WalletDto>; categories: ReadonlyMap<string, CategoryDto> },
  tc: Translate,
  locale: MoneyLocale,
): RecordView {
  const walletName = (id: string) => lookups.wallets.get(id)?.name ?? tc('Wallet');
  const amount = formatMinor(record.amount_minor, locale);
  if (record.type === 'transfer') {
    return {
      id: record.id, version: record.version, type: record.type, occurredOn: record.occurred_on, note: record.note,
      title: tc('Transfer'),
      detail: `${walletName(record.source_wallet_id)} → ${walletName(record.destination_wallet_id)}`,
      amountText: amount,
      amountLabel: `${tc('Transfer')} ${amount}`,
    };
  }
  const category = lookups.categories.get(record.category_id);
  const income = record.type === 'income';
  return {
    id: record.id, version: record.version, type: record.type, occurredOn: record.occurred_on, note: record.note,
    title: category ? categoryName(category, tc) : tc('Category'),
    detail: walletName(record.wallet_id),
    amountText: `${income ? '+' : '-'}${amount}`,
    amountLabel: `${income ? tc('Income') : tc('Expense')} ${amount}`,
  };
}

/** Rows grouped by date in their given order. */
export function groupByDay<T extends { occurredOn: string }>(rows: readonly T[]): { day: string; rows: T[] }[] {
  const groups: { day: string; rows: T[] }[] = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last.day === row.occurredOn) last.rows.push(row);
    else groups.push({ day: row.occurredOn, rows: [row] });
  }
  return groups;
}

export const byId = <T extends { id: string }>(items: readonly T[]): Map<string, T> => new Map(items.map((item) => [item.id, item]));
