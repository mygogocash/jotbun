import { Types } from 'mongoose';

import { SpendService } from './spend.service';

const USER_ID = '507f1f77bcf86cd799439011';

/*
 * Two numbers the Overview card leads with, and they are NOT the same kind of
 * number.
 *
 * `cashback_minor` is money: the approved cashback GoGoCash already mirrored
 * into the diary as income, marked `source: 'autolog'`.
 *
 * `missed_offer_count` is a COUNT, and deliberately never a baht total.
 * `matchMissedCashback` resolves a merchant to `{ href, offer_name }` — it
 * knows a live offer exists for that shop and nothing whatsoever about what it
 * would have paid. There is no rate in the data, so any baht figure on that
 * half of the card would be invented.
 */
describe('SpendService summary > cashback and missed offers', () => {
  it('counts approved cashback as cashback, and the member own income as income', async () => {
    const { service } = makeService();

    await service.addTx(USER_ID, {
      amount_minor: 38_000,
      type: 'income',
      occurred_on: '2026-09-03',
      category: 'Cashback',
      source: 'autolog',
      external_ref: 'conv-1',
    });
    await service.addTx(USER_ID, {
      amount_minor: 50_000,
      type: 'income',
      occurred_on: '2026-09-04',
      category: 'Salary',
    });
    await service.addTx(USER_ID, {
      amount_minor: 123_456,
      type: 'expense',
      occurred_on: '2026-09-05',
      category: 'Food',
    });

    const summary = await service.summary(USER_ID, '2026-09');

    expect(summary.cashback_minor).toBe(38_000);
    // Cashback is income too — it is a slice of the total, not a second total.
    expect(summary.income_minor).toBe(88_000);
    expect(summary.expense_minor).toBe(123_456);
  });

  it('reports no cashback as zero rather than leaving the field off', async () => {
    const { service } = makeService();
    await service.addTx(USER_ID, {
      amount_minor: 9_900,
      type: 'expense',
      occurred_on: '2026-09-06',
      category: 'Food',
    });

    const summary = await service.summary(USER_ID, '2026-09');

    expect(summary.cashback_minor).toBe(0);
    expect(summary.missed_offer_count).toBe(0);
  });

  it('counts the month rows whose merchant has a live offer', async () => {
    const { service } = makeService({
      offers: [{ offer_name: 'Shopee', merchant_id: 'shopee-th' }],
    });

    await service.addTx(USER_ID, {
      amount_minor: 45_000,
      type: 'expense',
      occurred_on: '2026-09-07',
      category: 'Shopping',
      merchant: 'Shopee',
    });
    await service.addTx(USER_ID, {
      amount_minor: 12_000,
      type: 'expense',
      occurred_on: '2026-09-08',
      category: 'Food',
      merchant: 'Corner noodle stall',
    });

    const summary = await service.summary(USER_ID, '2026-09');

    expect(summary.missed_offer_count).toBe(1);
  });

  it('never states a baht figure for a missed offer', async () => {
    const { service } = makeService({
      offers: [{ offer_name: 'Shopee', merchant_id: 'shopee-th' }],
    });
    await service.addTx(USER_ID, {
      amount_minor: 45_000,
      type: 'expense',
      occurred_on: '2026-09-07',
      category: 'Shopping',
      merchant: 'Shopee',
    });

    const summary = await service.summary(USER_ID, '2026-09');

    /*
     * The offer carries no rate. A total here could only be a guess, and a
     * guess about money on a money screen is worse than the count.
     */
    expect(summary).not.toHaveProperty('missed_cashback_minor');
    expect(summary).not.toHaveProperty('missed_minor');
  });
});

function makeService(
  options: { offers?: Array<Record<string, unknown>> } = {},
): { service: SpendService } {
  const wallets: Array<{ _id: Types.ObjectId; name: string }> = [];
  const categories: Array<{
    _id: Types.ObjectId;
    name: string;
    type: string;
  }> = [];
  const txs: Array<Record<string, unknown>> = [];

  const walletModel = {
    findOneAndUpdate: jest.fn(
      async (filter: { user_id: Types.ObjectId; name: string }) => {
        let row = wallets.find((item) => item.name === filter.name);
        if (!row) {
          row = { _id: new Types.ObjectId(), name: filter.name };
          wallets.push(row);
        }
        return row;
      },
    ),
    // `listTxs` resolves each row's wallet_id to its name, the same way it
    // already resolves category_id.
    find: jest.fn((filter: { _id?: { $in: Types.ObjectId[] } }) => ({
      lean: async () => {
        const ids = new Set((filter._id?.$in ?? []).map((id) => String(id)));
        return wallets.filter((row) => ids.has(String(row._id)));
      },
    })),
  };
  const categoryModel = {
    findOneAndUpdate: jest.fn(
      async (filter: { name: string; type: string }) => {
        let row = categories.find(
          (item) => item.name === filter.name && item.type === filter.type,
        );
        if (!row) {
          row = {
            _id: new Types.ObjectId(),
            name: filter.name,
            type: filter.type,
          };
          categories.push(row);
        }
        return row;
      },
    ),
    find: jest.fn((filter: { _id?: { $in: Types.ObjectId[] } }) => ({
      lean: async () => {
        const ids = new Set((filter._id?.$in ?? []).map((id) => String(id)));
        return categories.filter((row) => ids.has(String(row._id)));
      },
    })),
  };
  const txModel = {
    create: jest.fn(async (doc: Record<string, unknown>) => {
      const created = { _id: new Types.ObjectId(), ...doc };
      txs.push(created);
      return created;
    }),
    find: jest.fn(
      (filter: {
        user_id: Types.ObjectId;
        occurred_on?: string | { $gte: string; $lte: string };
        amount_minor?: number;
        source?: { $ne: string };
      }) => {
        const matched = txs.filter((row) => {
          if (String(row.user_id) !== String(filter.user_id)) return false;
          const on = String(row.occurred_on);
          if (typeof filter.occurred_on === 'string') {
            if (on !== filter.occurred_on) return false;
          } else if (filter.occurred_on) {
            if (on < filter.occurred_on.$gte || on > filter.occurred_on.$lte) {
              return false;
            }
          }
          if (
            typeof filter.amount_minor === 'number' &&
            row.amount_minor !== filter.amount_minor
          ) {
            return false;
          }
          if (filter.source?.$ne && row.source === filter.source.$ne) {
            return false;
          }
          return true;
        });
        const lean = async () => matched;
        return { lean, sort: () => ({ limit: () => ({ lean }) }) };
      },
    ),
  };
  const offerModel = options.offers
    ? {
        find: jest.fn(() => ({
          select: () => ({
            sort: () => ({
              limit: () => ({ lean: async () => options.offers }),
            }),
          }),
        })),
      }
    : undefined;

  const service = new SpendService(
    walletModel as never,
    categoryModel as never,
    txModel as never,
    undefined,
    offerModel as never,
  );
  return { service };
}
