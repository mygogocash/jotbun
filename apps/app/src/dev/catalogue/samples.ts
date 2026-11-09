// Sample data for the screen catalogue (redesign R2c). Development only: the
// route loads this module behind `__DEV__`, so neither it nor the test fakes it
// reads reach a release bundle.
//
// Amounts come from the render tests' golden seed (two wallets, a salary, a
// lunch, the rent and a move between wallets), so the catalogue shows the same
// realistic numbers the screens are tested with. The words a person would type
// themselves (wallet names, what they bought, notes) are given in each locale,
// so Thai and Vietnamese script runs through every component. Interface copy
// is not here: sections pass it through `tc`, exactly as screens do, so it
// shows whatever the locale catalogs hold today.
import type { Minor } from '@gogospend/contracts';
import { useMemo } from 'react';

import type { Locale } from '@mobile/i18n/locales';
import { useActiveLocale } from '@mobile/i18n/useCopy';
import { formatMinor } from '@mobile/spend/v1/money';
import { goldenSeed } from '@mobile/spend/v1/testing/fakeResources';

const seed = goldenSeed();
const record = (id: string) => {
  const found = seed.records.find((entry) => entry.id.endsWith(id));
  if (!found) throw new Error(`goldenSeed has no record ${id}`);
  return found;
};
// goldenSeed: 1 salary (income), 2 lunch (food), 3 rent (bills), 4 cash → daily account.
const salary = record('000000000001');
const lunch = record('000000000002');
const rent = record('000000000003');
const move = record('000000000004');
const [cash, daily] = seed.wallets;

function balanceOf(walletId: string): Minor {
  const wallet = seed.wallets.find((entry) => entry.id === walletId)!;
  let total = BigInt(wallet.opening_minor);
  for (const entry of seed.records) {
    const amount = BigInt(entry.amount_minor);
    if (entry.type === 'transfer') {
      if (entry.source_wallet_id === walletId) total -= amount;
      if (entry.destination_wallet_id === walletId) total += amount;
    } else if (entry.wallet_id === walletId) {
      total += entry.type === 'income' ? amount : -amount;
    }
  }
  return total.toString() as Minor;
}

const sum = (...values: Minor[]): Minor => values.reduce((total, value) => total + BigInt(value), 0n).toString() as Minor;

/** Coffee is the plan's own example (฿65); everything else is the golden seed. */
const COFFEE: Minor = '6500' as Minor;

export const SAMPLE_MINOR = {
  coffee: COFFEE,
  lunch: lunch.amount_minor as Minor,
  rent: rent.amount_minor as Minor,
  salary: salary.amount_minor as Minor,
  move: move.amount_minor as Minor,
  cashBalance: balanceOf(cash!.id),
  dailyBalance: balanceOf(daily!.id),
  /** Today's slip: the coffee and the lunch. */
  today: sum(COFFEE, lunch.amount_minor as Minor),
  /** Spent in the seed's month: the lunch and the rent. */
  monthSpent: sum(lunch.amount_minor as Minor, rent.amount_minor as Minor),
  monthBudget: '1800000' as Minor,
  dailyLeft: '42000' as Minor,
  overBy: '12000' as Minor,
  negative: '-6500' as Minor,
} as const;

/** The seed's month and its last day, for month switchers and receipts. */
export const SAMPLE_MONTH = { year: 2026, month: 9, day: 28 } as const;

type SampleWords = {
  readonly cash: string;
  readonly daily: string;
  readonly coffee: string;
  readonly lunch: string;
  readonly rent: string;
  readonly salary: string;
  readonly note: string;
  readonly merchant: string;
  /** Categories a person made themselves. */
  readonly pets: string;
  readonly misc: string;
  /** An archived wallet's name. */
  readonly oldPurse: string;
};

// What a person types, in their own language. Not interface copy.
const WORDS: Readonly<Record<Locale, SampleWords>> = {
  en: {
    cash: cash!.name, daily: daily!.name, coffee: 'Coffee', lunch: 'Chicken rice', rent: 'Rent', salary: 'September salary', note: 'Lunch with Mai at the market', merchant: 'Corner café',
    pets: 'Pets', misc: 'Odds and ends', oldPurse: 'Old purse',
  },
  th: {
    cash: 'เงินสด', daily: 'บัญชีใช้จ่าย', coffee: 'กาแฟ', lunch: 'ข้าวมันไก่', rent: 'ค่าเช่าห้อง', salary: 'เงินเดือนกันยายน', note: 'กินข้าวกับใหม่ที่ตลาด', merchant: 'ร้านกาแฟหัวมุม',
    pets: 'สัตว์เลี้ยง', misc: 'เบ็ดเตล็ด', oldPurse: 'กระเป๋าเก่า',
  },
  vi: {
    cash: 'Tiền mặt', daily: 'Tài khoản chi tiêu', coffee: 'Cà phê', lunch: 'Cơm gà', rent: 'Tiền nhà', salary: 'Lương tháng 9', note: 'Ăn trưa với Mai ở chợ', merchant: 'Quán cà phê góc phố',
    pets: 'Thú cưng', misc: 'Linh tinh', oldPurse: 'Ví cũ',
  },
};

const DATE_TAG: Readonly<Record<Locale, string>> = { en: 'en-GB', th: 'th-TH', vi: 'vi-VN' };

export type Samples = SampleWords & {
  readonly locale: Locale;
  /** "September 2026" in the active locale. */
  readonly monthLabel: string;
  /** "28 Sept 2026" in the active locale. */
  readonly dayLabel: string;
  /** A satang amount as drawn, e.g. "฿182.00". */
  readonly money: (minor: Minor) => string;
};

/** What a person types, in `locale`: the words the sections show (tests read them here too). */
export function sampleWords(locale: Locale): SampleWords {
  return WORDS[locale];
}

export function useSamples(): Samples {
  const locale = useActiveLocale();
  return useMemo(() => {
    const { year, month, day } = SAMPLE_MONTH;
    const tag = DATE_TAG[locale];
    const monthLabel = new Intl.DateTimeFormat(tag, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(Date.UTC(year, month - 1, 1));
    const dayLabel = new Intl.DateTimeFormat(tag, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(Date.UTC(year, month - 1, day));
    const money = (minor: Minor) => formatMinor(minor, locale === 'th' ? 'th' : 'en');
    return { ...WORDS[locale], locale, monthLabel, dayLabel, money };
  }, [locale]);
}
