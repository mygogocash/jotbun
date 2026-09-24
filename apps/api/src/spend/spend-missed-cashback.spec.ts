import { Types } from 'mongoose';

import { ACTIVE_OFFER_FILTER } from 'src/offer/active-offer-filter';

import { SpendService } from './spend.service';

/*
 * `matchMissedCashback` suggests "you could have earned cashback here" against a
 * member's imported bank rows. It selected offers with `status: 'approved'`,
 * which is not the catalogue's liveness rule:
 *
 *   - legacy rows predate `status`, and an equality match skips documents where
 *     the field is absent, so a live brand was never suggested;
 *   - nothing excluded `disabled` or `partner_availability: 'unavailable'`, so a
 *     hidden brand could be suggested to a member.
 *
 * `ACTIVE_OFFER_FILTER` is the shared definition, and it exists precisely so the
 * rule is not re-derived per call site.
 */

function leanChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const method of ['find', 'select', 'sort', 'limit']) {
    chain[method] = jest.fn(() => chain);
  }
  chain.lean = jest.fn(async () => rows);
  return chain;
}

function makeService(offers: unknown[]) {
  const txRow = {
    _id: new Types.ObjectId(),
    occurred_on: '2026-09-01',
    type: 'expense',
    amount_minor: 12345,
    category_id: new Types.ObjectId(),
    merchant: 'HomePro Rama 9',
    note: '',
    tags: [],
    source: 'import',
  };

  const txModel = leanChain([txRow]);
  const categoryModel = leanChain([]);
  const offerModel = leanChain(offers);

  // `listTxs` now resolves each row's wallet name as well as its category, so
  // the wallet model needs the same lean chain rather than an empty object.
  const walletModel = leanChain([]);

  const service = new SpendService(
    walletModel as never,
    categoryModel as never,
    txModel as never,
    undefined,
    offerModel as never,
  );

  return { service, offerModel };
}

describe('spend missed-cashback offer selection', () => {
  it('given the offer query > then it uses the shared active-offer filter', async () => {
    const { service, offerModel } = makeService([]);

    await service.listTxs(new Types.ObjectId().toHexString(), '2026-09');

    // The offer read is the last `find` on the offer model.
    const calls = (offerModel.find as jest.Mock).mock.calls;
    const filter = calls[calls.length - 1]?.[0];
    expect(filter).toEqual(ACTIVE_OFFER_FILTER);
  });

  it('given the offer query > then status is never matched by equality', async () => {
    const { service, offerModel } = makeService([]);

    await service.listTxs(new Types.ObjectId().toHexString(), '2026-09');

    const calls = (offerModel.find as jest.Mock).mock.calls;
    const filter = calls[calls.length - 1]?.[0] as
      Record<string, unknown> | undefined;
    // An equality match would delist every legacy row that predates the field.
    expect(filter?.status).not.toBe('approved');
    expect(filter?.status).toEqual({
      $nin: ['pending_review', 'rejected'],
    });
    expect(filter?.disabled).toEqual({ $ne: true });
    expect(filter?.partner_availability).toEqual({ $ne: 'unavailable' });
  });

  it('given a live brand with no status field > then it is suggested', async () => {
    const { service } = makeService([
      { offer_name: 'HomePro', merchant_id: 'homepro-1' },
    ]);

    const rows = await service.listTxs(
      new Types.ObjectId().toHexString(),
      '2026-09',
    );

    expect(rows[0].missed_cashback).toEqual({
      href: '/offer/homepro-1',
      offer_name: 'HomePro',
    });
  });
});
