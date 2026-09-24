import { Types } from 'mongoose';

import { SpendService } from './spend.service';

const USER_ID = '507f1f77bcf86cd799439011';

describe('SpendService diary', () => {
  it('adds a manual expense in satang and reads it back on the month summary and list', async () => {
    const { service, created } = makeService();

    const added = await service.addTx(USER_ID, {
      amount_minor: 29000,
      type: 'expense',
      occurred_on: '2025-12-01',
      category: 'อาหาร',
      note: 'ข้าวมันไก่',
    });
    expect(Types.ObjectId.isValid(added.id)).toBe(true);
    expect(created.txs).toHaveLength(1);
    expect(created.txs[0]).toMatchObject({
      amount_minor: 29000,
      type: 'expense',
      occurred_on: '2025-12-01',
      source: 'manual',
      import_id: null,
    });

    const summary = await service.summary(USER_ID, '2025-12');
    expect(summary).toMatchObject({
      month: '2025-12',
      expense_minor: 29000,
      income_minor: 0,
      tx_count: 1,
    });
    expect(summary.pie).toEqual([{ category: 'อาหาร', amount_minor: 29000 }]);

    const list = await service.listTxs(USER_ID, '2025-12');
    expect(list).toEqual([
      expect.objectContaining({
        id: added.id,
        occurred_on: '2025-12-01',
        type: 'expense',
        amount_minor: 29000,
        category: 'อาหาร',
        source: 'manual',
      }),
    ]);
  });

  it('keeps both of two identical manual entries on the same day', async () => {
    const { service, created } = makeService();
    const entry = {
      amount_minor: 6000,
      type: 'expense' as const,
      occurred_on: '2025-12-01',
      category: 'กาแฟ',
    };

    const first = await service.addTx(USER_ID, entry);
    const second = await service.addTx(USER_ID, entry);

    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(false);
    expect(second.id).not.toBe(first.id);
    expect(created.txs).toHaveLength(2);

    const summary = await service.summary(USER_ID, '2025-12');
    expect(summary.expense_minor).toBe(12000);
    expect(summary.tx_count).toBe(2);
  });

  it('keeps two same-day same-amount manual entries filed under different categories', async () => {
    const { service, created } = makeService();

    await service.addTx(USER_ID, {
      amount_minor: 6000,
      type: 'expense',
      occurred_on: '2025-12-01',
      category: 'กาแฟ',
    });
    const second = await service.addTx(USER_ID, {
      amount_minor: 6000,
      type: 'expense',
      occurred_on: '2025-12-01',
      category: 'เดินทาง',
    });

    expect(second.duplicate).toBe(false);
    expect(created.txs).toHaveLength(2);
  });

  it('still collapses a replayed autolog row so cashback is not double counted', async () => {
    const { service, created } = makeService();
    const row = {
      amount_minor: 15000,
      type: 'income' as const,
      occurred_on: '2025-12-02',
      category: 'Cashback',
      merchant: 'Shopee',
      source: 'autolog' as const,
    };

    const first = await service.addTx(USER_ID, row);
    const second = await service.addTx(USER_ID, row);

    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(created.txs).toHaveLength(1);
  });

  /*
   * The cashback card shows "Cashback this month" directly above "Purchases
   * that could have earned cashback". The autolog rows feeding the first line
   * must never be counted into the second, or the card contradicts itself.
   */
  it('does not count an autolog cashback row as a purchase that missed cashback', async () => {
    const { service } = makeService(['Shopee']);

    await service.addTx(USER_ID, {
      amount_minor: 15000,
      type: 'income',
      occurred_on: '2025-12-02',
      category: 'Cashback',
      merchant: 'Shopee',
      source: 'autolog',
    });

    const summary = await service.summary(USER_ID, '2025-12');
    expect(summary.cashback_minor).toBe(15000);
    expect(summary.missed_offer_count).toBe(0);
  });

  /*
   * Matching ran over a concatenated, punctuation-stripped name, so any brand
   * whose letters happened to sit inside another's matched it. The hint sends
   * the member to a shop, so a wrong one is worse than none.
   */
  it('does not match a brand whose letters merely sit inside another name', async () => {
    const { service } = makeService(['Pineapple Store']);

    await service.addTx(USER_ID, {
      amount_minor: 25000,
      type: 'expense',
      occurred_on: '2025-12-03',
      category: 'ของกิน',
      merchant: 'Apple',
    });

    const summary = await service.summary(USER_ID, '2025-12');
    expect(summary.missed_offer_count).toBe(0);
  });

  it('matches a brand that is a whole word of a longer merchant name', async () => {
    const { service } = makeService(['Shopee']);

    await service.addTx(USER_ID, {
      amount_minor: 25000,
      type: 'expense',
      occurred_on: '2025-12-03',
      category: 'ช้อปปิ้ง',
      merchant: 'Shopee Thailand',
    });

    const summary = await service.summary(USER_ID, '2025-12');
    expect(summary.missed_offer_count).toBe(1);
  });

  /*
   * Thai writes a shop name without spaces, so there are no words to match on
   * and the brand only ever appears as a fragment. Latin names keep the
   * stricter rule; this is the exception that keeps Thai brands findable.
   */
  it('still finds a Thai brand written inside a longer shop name', async () => {
    const { service } = makeService(['โลตัส']);

    await service.addTx(USER_ID, {
      amount_minor: 25000,
      type: 'expense',
      occurred_on: '2025-12-03',
      category: 'ของกิน',
      merchant: 'โลตัสสาขาสีลม',
    });

    const summary = await service.summary(USER_ID, '2025-12');
    expect(summary.missed_offer_count).toBe(1);
  });

  it('picks the exact brand rather than whichever row the scan reached first', async () => {
    // "Shopee Mall" is listed first on purpose: an unordered first-match scan
    // returned it for a purchase that names Shopee exactly.
    const { service } = makeService(['Shopee Mall', 'Shopee']);

    await service.addTx(USER_ID, {
      amount_minor: 25000,
      type: 'expense',
      occurred_on: '2025-12-03',
      category: 'ช้อปปิ้ง',
      merchant: 'Shopee',
    });

    const [row] = await service.listTxs(USER_ID, '2025-12');
    expect(row.missed_cashback?.offer_name).toBe('Shopee');
  });

  it('counts a real expense at a cashback brand as a missed purchase', async () => {
    const { service } = makeService(['Shopee']);

    await service.addTx(USER_ID, {
      amount_minor: 25000,
      type: 'expense',
      occurred_on: '2025-12-03',
      category: 'ช้อปปิ้ง',
      merchant: 'Shopee',
    });

    const summary = await service.summary(USER_ID, '2025-12');
    expect(summary.missed_offer_count).toBe(1);
  });

  it('keeps transfers out of the pie and expense totals', async () => {
    const { service } = makeService();
    await service.addTx(USER_ID, {
      amount_minor: 12050,
      type: 'expense',
      occurred_on: '2025-01-15',
      category: 'อาหาร',
    });
    await service.addTx(USER_ID, {
      amount_minor: 100000,
      type: 'income',
      occurred_on: '2025-01-16',
      category: 'เงินเดือน',
    });
    await service.addTx(USER_ID, {
      amount_minor: 20000,
      type: 'transfer',
      occurred_on: '2025-01-17',
      category: 'Transfer',
    });

    const summary = await service.summary(USER_ID, '2025-01');
    expect(summary.expense_minor).toBe(12050);
    expect(summary.income_minor).toBe(100000);
    expect(summary.tx_count).toBe(3);
    expect(summary.pie).toEqual([{ category: 'อาหาร', amount_minor: 12050 }]);
    expect(summary.pie.some((slice) => slice.category === 'Transfer')).toBe(
      false,
    );
  });

  it('skips autolog when an imported row already has the same merchant, day, and amount', async () => {
    const { service, created } = makeService();
    await service.addTx(USER_ID, {
      amount_minor: 1250,
      type: 'expense',
      occurred_on: '2026-08-01',
      category: 'Shopping',
      merchant: 'Shopee',
      source: 'manual',
    });
    const autolog = await service.addTx(USER_ID, {
      amount_minor: 1250,
      type: 'income',
      occurred_on: '2026-08-01',
      category: 'Cashback',
      merchant: 'Shopee',
      note: 'cashback:C-1',
      source: 'autolog',
    });
    expect(autolog.duplicate).toBe(true);
    expect(created.txs).toHaveLength(1);
    expect(created.txs[0]).toMatchObject({ source: 'manual', type: 'expense' });
  });

  it('still writes autolog income when merchant or amount differs from imported rows', async () => {
    const { service, created } = makeService();
    await service.addTx(USER_ID, {
      amount_minor: 99000,
      type: 'expense',
      occurred_on: '2026-08-01',
      category: 'Shopping',
      merchant: 'Shopee',
    });
    const autolog = await service.addTx(USER_ID, {
      amount_minor: 1250,
      type: 'income',
      occurred_on: '2026-08-01',
      category: 'Cashback',
      merchant: 'Shopee',
      note: 'cashback:C-1',
      source: 'autolog',
    });
    expect(autolog.duplicate).toBe(false);
    expect(created.txs).toHaveLength(2);
    expect(created.txs[1]).toMatchObject({
      source: 'autolog',
      type: 'income',
      amount_minor: 1250,
    });
  });

  it('does not write withdraw collections', async () => {
    const { service, created } = makeService();
    await service.addTx(USER_ID, {
      amount_minor: 100,
      type: 'expense',
      occurred_on: '2025-12-01',
      category: 'Other',
    });
    expect(JSON.stringify(created)).not.toMatch(/withdraw/i);
  });
});

function makeService(offerNames: string[] = []): {
  service: SpendService;
  created: {
    txs: Record<string, unknown>[];
    wallets: unknown[];
    categories: unknown[];
  };
} {
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
    // Models the real `{user_id, fingerprint}` unique index. Without this the
    // fake accepts colliding rows that Mongo would reject, so a fingerprint
    // that is not unique enough reads as working here and loses rows in prod.
    create: jest.fn(async (doc: Record<string, unknown>) => {
      const clash = txs.some(
        (row) =>
          String(row.user_id) === String(doc.user_id) &&
          String(row.fingerprint) === String(doc.fingerprint),
      );
      if (clash) {
        throw Object.assign(new Error('E11000 duplicate key error'), {
          code: 11000,
        });
      }
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
        return {
          lean,
          sort: () => ({
            limit: () => ({ lean }),
          }),
        };
      },
    ),
    findOne: jest.fn(
      (filter: { _id: Types.ObjectId; user_id: Types.ObjectId }) => ({
        lean: async () =>
          txs.find(
            (row) =>
              String(row._id) === String(filter._id) &&
              String(row.user_id) === String(filter.user_id),
          ) ?? null,
      }),
    ),
    updateOne: jest.fn(
      async (
        filter: { _id: Types.ObjectId; user_id: Types.ObjectId },
        update: { $set: Record<string, unknown> },
      ) => {
        const row = txs.find(
          (item) =>
            String(item._id) === String(filter._id) &&
            String(item.user_id) === String(filter.user_id),
        );
        if (!row) return { matchedCount: 0 };
        Object.assign(row, update.$set);
        return { matchedCount: 1 };
      },
    ),
    deleteOne: jest.fn(
      async (filter: { _id: Types.ObjectId; user_id: Types.ObjectId }) => {
        const index = txs.findIndex(
          (item) =>
            String(item._id) === String(filter._id) &&
            String(item.user_id) === String(filter.user_id),
        );
        if (index < 0) return { deletedCount: 0 };
        txs.splice(index, 1);
        return { deletedCount: 1 };
      },
    ),
  };

  // Only the chain matchMissedCashback actually calls: find().select().limit().lean()
  const offerModel = {
    find: jest.fn(() => ({
      select: () => ({
        sort: () => ({
          limit: () => ({
            // Returned in the order given, so a test can put the row an
            // unordered scan used to reach first at the front on purpose.
            lean: async () =>
              offerNames.map((offer_name, index) => ({
                offer_name,
                merchant_id: index + 1,
              })),
          }),
        }),
      }),
    })),
  };
  const service = new SpendService(
    walletModel as never,
    categoryModel as never,
    txModel as never,
    undefined,
    offerNames.length ? (offerModel as never) : undefined,
  );
  return { service, created: { txs, wallets, categories } };
}

const OTHER_USER_ID = '507f1f77bcf86cd799439012';

/**
 * Owner call 2026-08-30: a member must be able to fix a typo without deleting
 * and retyping the row.
 *
 * The amount is a different matter from the filing. Category and note are the
 * member's own words about their own row, so they are always theirs to change.
 * The AMOUNT of a row GoGoCash filled in — a cashback mirror, or a line the bank
 * sent us — is not: editing it would leave GoGoSpend telling a different story
 * from the wallet the number came from. Those rows can still be deleted, which
 * removes the disagreement instead of hiding it.
 */
describe('SpendService editing', () => {
  it('given a row the member typed > then the amount, date, category and note all change', async () => {
    const { service } = makeService();
    const added = await service.addTx(USER_ID, {
      amount_minor: 6500,
      type: 'expense',
      occurred_on: '2026-08-30',
      category: 'Food',
      note: 'noodles',
    });

    await service.updateTx(USER_ID, added.id, {
      amount_minor: 7000,
      occurred_on: '2026-08-29',
      category: 'Travel',
      note: 'taxi',
    });

    const [row] = await service.listTxs(USER_ID, '2026-08');
    expect(row).toMatchObject({
      amount_minor: 7000,
      occurred_on: '2026-08-29',
      category: 'Travel',
      note: 'taxi',
    });
  });

  /*
   * Tags are stored, not derived at read time, so an edit that turns a row into
   * a travel row has to re-run the compare rule. Otherwise Compare never sees a
   * row the member re-filed, and the only way to fix it is to delete and retype
   * — the exact thing editing exists to avoid.
   */
  it('picks up the compare tag when an edit re-files a row as travel', async () => {
    const { service } = makeService();
    const added = await service.addTx(USER_ID, {
      amount_minor: 6500,
      type: 'expense',
      occurred_on: '2026-08-30',
      category: 'Food',
      note: 'noodles',
    });
    expect((await service.listTxs(USER_ID, '2026-08'))[0].compare).toBe(false);

    await service.updateTx(USER_ID, added.id, { category: 'Travel' });

    const [row] = await service.listTxs(USER_ID, '2026-08');
    expect(row.compare).toBe(true);
    expect(row.tags).toContain('compare');
  });

  it('picks up the compare tag from an edited note', async () => {
    const { service } = makeService();
    const added = await service.addTx(USER_ID, {
      amount_minor: 6500,
      type: 'expense',
      occurred_on: '2026-08-30',
      category: 'Other',
      note: 'nothing special',
    });

    await service.updateTx(USER_ID, added.id, { note: 'โรงแรม' });

    const [row] = await service.listTxs(USER_ID, '2026-08');
    expect(row.compare).toBe(true);
  });

  it('given a cashback row > then the filing changes but the amount is refused', async () => {
    const { service, created } = makeService();
    const added = await service.addTx(USER_ID, {
      amount_minor: 2400,
      type: 'income',
      occurred_on: '2026-08-30',
      category: 'Cashback',
      merchant: 'Shopee',
      source: 'autolog',
    });

    await service.updateTx(USER_ID, added.id, {
      category: 'Bonus',
      note: 'from the app',
    });
    expect(created.txs[0]).toMatchObject({
      category: 'Bonus',
      note: 'from the app',
      amount_minor: 2400,
    });

    await expect(
      service.updateTx(USER_ID, added.id, { amount_minor: 9999 }),
    ).rejects.toMatchObject({ response: { code: 'SPEND_AMOUNT_LOCKED' } });
    expect(created.txs[0]).toMatchObject({ amount_minor: 2400 });
  });

  it("given another member's row > then it is not found, edited or leaked", async () => {
    const { service } = makeService();
    const added = await service.addTx(USER_ID, {
      amount_minor: 6500,
      type: 'expense',
      occurred_on: '2026-08-30',
      category: 'Food',
    });

    await expect(
      service.updateTx(OTHER_USER_ID, added.id, { amount_minor: 1 }),
    ).rejects.toMatchObject({ response: { code: 'SPEND_TX_NOT_FOUND' } });
  });

  it('given a nonsense id > then it is rejected before any lookup', async () => {
    const { service } = makeService();
    await expect(
      service.updateTx(USER_ID, 'not-an-id', { note: 'x' }),
    ).rejects.toMatchObject({ response: { code: 'SPEND_TX_NOT_FOUND' } });
  });
});

describe('SpendService deleting', () => {
  it('given a row the member owns > then it leaves the list and the month total', async () => {
    const { service } = makeService();
    const added = await service.addTx(USER_ID, {
      amount_minor: 6500,
      type: 'expense',
      occurred_on: '2026-08-30',
      category: 'Food',
    });

    await service.deleteTx(USER_ID, added.id);

    expect(await service.listTxs(USER_ID, '2026-08')).toEqual([]);
    expect(await service.summary(USER_ID, '2026-08')).toMatchObject({
      expense_minor: 0,
      tx_count: 0,
    });
  });

  it('given a cashback row > then it can still be removed', async () => {
    const { service } = makeService();
    const added = await service.addTx(USER_ID, {
      amount_minor: 2400,
      type: 'income',
      occurred_on: '2026-08-30',
      category: 'Cashback',
      merchant: 'Shopee',
      source: 'autolog',
    });

    await service.deleteTx(USER_ID, added.id);
    expect(await service.listTxs(USER_ID, '2026-08')).toEqual([]);
  });

  it("given another member's row > then nothing is deleted", async () => {
    const { service, created } = makeService();
    const added = await service.addTx(USER_ID, {
      amount_minor: 6500,
      type: 'expense',
      occurred_on: '2026-08-30',
      category: 'Food',
    });

    await expect(
      service.deleteTx(OTHER_USER_ID, added.id),
    ).rejects.toMatchObject({ response: { code: 'SPEND_TX_NOT_FOUND' } });
    expect(created.txs).toHaveLength(1);
  });
});

/**
 * Owner call 2026-09-06: the summary card gets a month dropdown, and it lists
 * only the months a member actually has records in.
 *
 * The app cannot work this out for itself. It can ask for any month it likes,
 * but "which months have anything in them?" is a question about the whole
 * collection, and asking month by month until one comes back empty would be
 * both slow and wrong — a member who skipped February still has January.
 */
describe('SpendService month list', () => {
  it('given records across three months > then lists them newest first, each totalled', async () => {
    const { service } = makeService();
    await service.addTx(USER_ID, {
      amount_minor: 1250000,
      type: 'expense',
      occurred_on: '2026-07-14',
      category: 'Household',
    });
    await service.addTx(USER_ID, {
      amount_minor: 3200000,
      type: 'income',
      occurred_on: '2026-08-01',
      category: 'Salary',
    });
    await service.addTx(USER_ID, {
      amount_minor: 24000,
      type: 'expense',
      occurred_on: '2026-08-19',
      category: 'Food',
    });
    await service.addTx(USER_ID, {
      amount_minor: 8900,
      type: 'expense',
      occurred_on: '2026-09-01',
      category: 'Food',
    });

    await expect(service.listMonths(USER_ID)).resolves.toEqual([
      { month: '2026-09', expense_minor: 8900, income_minor: 0 },
      { month: '2026-08', expense_minor: 24000, income_minor: 3200000 },
      { month: '2026-07', expense_minor: 1250000, income_minor: 0 },
    ]);
  });

  it("given a transfer between the member's own wallets > then it counts in neither total", async () => {
    const { service } = makeService();
    await service.addTx(USER_ID, {
      amount_minor: 50000,
      type: 'transfer',
      occurred_on: '2026-09-02',
      category: 'Transfer',
    });
    await service.addTx(USER_ID, {
      amount_minor: 7500,
      type: 'expense',
      occurred_on: '2026-09-03',
      category: 'Food',
    });

    await expect(service.listMonths(USER_ID)).resolves.toEqual([
      { month: '2026-09', expense_minor: 7500, income_minor: 0 },
    ]);
  });

  it('given a member with nothing recorded > then the list is empty', async () => {
    const { service } = makeService();
    await expect(service.listMonths(USER_ID)).resolves.toEqual([]);
  });

  it('given another member with records > then their months are not listed', async () => {
    const { service } = makeService();
    await service.addTx(OTHER_USER_ID, {
      amount_minor: 99900,
      type: 'expense',
      occurred_on: '2026-05-05',
      category: 'Food',
    });

    await expect(service.listMonths(USER_ID)).resolves.toEqual([]);
  });
});

/**
 * The same card lets a member switch the ring and the list from money out to
 * money in, so the summary has to break BOTH down by category. It only ever
 * broke down expenses, and the list of transactions cannot stand in: that call
 * is capped at 200 rows a month, so a busy month would quietly under-report.
 */
describe('SpendService summary money-in breakdown', () => {
  it('given money in from two sources > then the summary breaks it down by category', async () => {
    const { service } = makeService();
    await service.addTx(USER_ID, {
      amount_minor: 3200000,
      type: 'income',
      occurred_on: '2026-09-01',
      category: 'Salary',
    });
    await service.addTx(USER_ID, {
      amount_minor: 150000,
      type: 'income',
      occurred_on: '2026-09-05',
      category: 'Freelance',
    });
    await service.addTx(USER_ID, {
      amount_minor: 8900,
      type: 'expense',
      occurred_on: '2026-09-06',
      category: 'Food',
    });

    const summary = await service.summary(USER_ID, '2026-09');
    expect(summary.pie).toEqual([{ category: 'Food', amount_minor: 8900 }]);
    expect(summary.pie_in).toEqual([
      { category: 'Salary', amount_minor: 3200000 },
      { category: 'Freelance', amount_minor: 150000 },
    ]);
  });

  it('given a month with money out only > then the money-in breakdown is empty', async () => {
    const { service } = makeService();
    await service.addTx(USER_ID, {
      amount_minor: 8900,
      type: 'expense',
      occurred_on: '2026-09-06',
      category: 'Food',
    });

    const summary = await service.summary(USER_ID, '2026-09');
    expect(summary.pie_in).toEqual([]);
  });
});
