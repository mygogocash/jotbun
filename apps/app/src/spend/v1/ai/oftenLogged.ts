// "Often logged" in Tell Bun (premium plan A4, from the Mobbin research:
// Lifesum's "often tracked"): the entries a person repeats, one tap from a
// draft. Worked out on the phone from the records Quick add already loaded
// for its category order; nothing is sent, and no AI use is spent. Pure.
//
// - An entry counts when the same type, place, amount, category and wallet
//   were logged at least twice in the window; transfers and deleted records
//   never count, nor do records without a place or in an archived wallet or
//   category. Places differing only in letter case or surrounding spaces
//   count together, named as last written.
// - The draft is dated today and needs nothing guessed, so it reads like the
//   person's own entry, which it is.
import type { AiDraft, CategoryDto, TransactionDto, WalletSnapshot } from '@gogospend/contracts';

/** Chips shown at most. */
export const OFTEN_LOGGED_TOP = 3;
/** Times an entry must repeat to count. */
export const OFTEN_LOGGED_MIN = 2;

export type OftenLogged = { key: string; label: string; draft: AiDraft };

export type OftenLoggedInput = {
  records: readonly TransactionDto[];
  today: string;
  wallets: readonly Pick<WalletSnapshot, 'id' | 'archived'>[];
  categories: readonly Pick<CategoryDto, 'id' | 'archived'>[];
  top?: number;
};

/** Whole baht as typed ("50"), satang only when there are any ("45.50"). */
export function bahtWords(amountMinor: string): string {
  const minor = BigInt(amountMinor);
  const baht = minor / 100n;
  const satang = minor % 100n;
  return satang === 0n ? baht.toString() : `${baht}.${satang.toString().padStart(2, '0')}`;
}

export function oftenLogged(input: OftenLoggedInput): OftenLogged[] {
  const openWallets = new Set(input.wallets.filter((wallet) => !wallet.archived).map((wallet) => wallet.id));
  const openCategories = new Set(input.categories.filter((category) => !category.archived).map((category) => category.id));
  const seen = new Map<string, { count: number; latest: string; record: TransactionDto & { type: 'expense' | 'income' } }>();
  for (const record of input.records) {
    if (record.type === 'transfer' || record.deleted_at !== null) continue;
    const merchant = record.merchant?.trim();
    if (!merchant || !openWallets.has(record.wallet_id) || !openCategories.has(record.category_id)) continue;
    const key = [record.type, merchant.toLocaleLowerCase(), record.amount_minor, record.category_id, record.wallet_id].join('\u0000');
    const found = seen.get(key);
    if (!found) seen.set(key, { count: 1, latest: record.occurred_on, record });
    else {
      found.count += 1;
      if (record.occurred_on > found.latest) {
        found.latest = record.occurred_on;
        found.record = record;
      }
    }
  }
  return [...seen.entries()]
    .filter(([, entry]) => entry.count >= OFTEN_LOGGED_MIN)
    .sort(([a, x], [b, y]) => y.count - x.count || (x.latest < y.latest ? 1 : x.latest > y.latest ? -1 : a < b ? -1 : 1))
    .slice(0, input.top ?? OFTEN_LOGGED_TOP)
    .map(([key, { record }]) => {
      const merchant = (record.merchant ?? '').trim();
      return {
        key,
        label: `${merchant} ${bahtWords(record.amount_minor)}`,
        draft: {
          type: record.type,
          amount_minor: record.amount_minor,
          occurred_on: input.today,
          category_id: record.category_id,
          wallet_id: record.wallet_id,
          merchant,
          note: null,
          confidence: 'high',
          flags: [],
        },
      };
    });
}
