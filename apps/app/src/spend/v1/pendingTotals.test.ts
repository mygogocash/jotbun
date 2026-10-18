import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Totals } from '@gogospend/contracts';

import { FOOD, SAVINGS, WALLET, draft } from '../../storage/testing/diaryFixtures.ts';
import { deriveDisplayedTotals } from './pendingTotals.ts';

const confirmed: Totals = { income_minor: '0', expense_minor: '10000', balance_minor: '-10000', by_wallet: { [WALLET]: '-10000' } };

test('pending_expense_is_distinct_from_confirmed_total', () => {
  const display = deriveDisplayedTotals(confirmed, [draft({ amount_minor: '6500' })]);
  assert.equal(display.confirmed.expense_minor, '10000');
  assert.equal(display.pendingAdjustment.expense_minor, '6500');
  assert.equal(display.estimated.expense_minor, '16500');
  assert.deepEqual(display.confirmed, confirmed, 'confirmed totals are never changed by drafts');
});

test('income, expenses and transfers adjust exactly, per wallet, beyond safe integers', () => {
  const display = deriveDisplayedTotals(confirmed, [
    draft({ amount_minor: '99999999999' }),
    draft({ amount_minor: '99999999999' }),
    draft({ type: 'income', amount_minor: '2800000', category_id: FOOD } as never),
    { id: crypto.randomUUID(), type: 'transfer', amount_minor: '50000', occurred_on: '2026-03-02', source_wallet_id: WALLET, destination_wallet_id: SAVINGS },
  ]);
  assert.deepEqual(display.pendingAdjustment, {
    income_minor: '2800000',
    expense_minor: '199999999998',
    balance_minor: String(2800000n - 199999999998n),
    by_wallet: { [WALLET]: String(2800000n - 199999999998n - 50000n), [SAVINGS]: '50000' },
  });
  assert.equal(display.estimated.balance_minor, String(-10000n + 2800000n - 199999999998n));
  assert.equal(display.estimated.by_wallet[SAVINGS], '50000');
});

test('no drafts means a zero adjustment and estimates equal to the confirmed totals', () => {
  const display = deriveDisplayedTotals(confirmed, []);
  assert.deepEqual(display.pendingAdjustment, { income_minor: '0', expense_minor: '0', balance_minor: '0', by_wallet: {} });
  assert.deepEqual(display.estimated, confirmed);
});
