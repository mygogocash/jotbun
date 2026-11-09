import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ContractValidationError, normalizeMerchant, normalizeNote, validateOccurredOn } from '@gogospend/contracts';

import { AmountInputError, parseAmountInput } from '../money.ts';
import type { CreateEntryInput, CreateTransferInput } from '../resources.ts';
import { AMOUNT_PROBLEM_TEXT, amountProblemOf, anotherDraft, buildQuickAdd, newQuickAddDraft, stepDay, toPendingEntry } from './quickAddModel.ts';
import type { EntryType, QuickAddDraft } from './quickAddModel.ts';
import type { Translate } from './shared.ts';
import { BANK, CASH, FOOD, PETS, SALARY, TRAVEL, WALLETS, marked, tc, uuid } from './testing/fixtures.ts';

const TODAY = '2026-10-18';

// ---------------------------------------------------------------------------
// The current form's rules, transcribed from AddTransactionScreen.tsx
// (`amountProblem` and `build()`), as the parity oracle.

function legacyAmountProblem(error: unknown, t: Translate): string {
  const problem = error instanceof AmountInputError ? error.problem : 'invalid';
  if (problem === 'empty') return t('Enter an amount');
  if (problem === 'too_precise') return t('Use at most two decimal places');
  if (problem === 'too_large') return t('Amounts go up to ฿999,999,999.99');
  return t('Enter an amount like 65 or 65.50');
}

type LegacyForm = {
  recordId: string; type: EntryType; amount: string; walletId: string; categoryByType: Record<'expense' | 'income', string | undefined>;
  fromId: string; toId: string; date: string; note: string; merchant: string;
};

function legacyBuild(form: LegacyForm, t: Translate): { errors: Record<string, string> } | { input: CreateEntryInput | CreateTransferInput } {
  const next: Record<string, string> = {};
  let amountMinor = '';
  try {
    amountMinor = parseAmountInput(form.amount, 'en');
    if (amountMinor === '0') next.amount_minor = t('Enter an amount above zero');
  } catch (error) {
    next.amount_minor = legacyAmountProblem(error, t);
  }
  try {
    validateOccurredOn(form.date, '1970-01-01', TODAY);
  } catch (error) {
    next.occurred_on = error instanceof ContractValidationError && error.code === 'DATE_IN_FUTURE' ? t('This date is in the future.') : t('Enter a real date as YYYY-MM-DD');
  }
  let cleanNote: string | null = null;
  let cleanMerchant: string | null = null;
  try {
    cleanNote = normalizeNote(form.note);
  } catch {
    next.note = t('Notes are up to 500 characters.');
  }
  try {
    cleanMerchant = normalizeMerchant(form.merchant);
  } catch {
    next.merchant = t('Use one line of up to 120 characters.');
  }
  const categoryId = form.type === 'transfer' ? undefined : form.categoryByType[form.type];
  if (form.type === 'transfer' && form.fromId === form.toId) next.wallets = t('Choose two different wallets');
  if (form.type !== 'transfer' && !categoryId) next.category_id = t('Choose a category');
  if (Object.keys(next).length > 0) return { errors: next };
  const common = { id: form.recordId, amount_minor: amountMinor, occurred_on: form.date, note: cleanNote, merchant: cleanMerchant };
  return {
    input: form.type === 'transfer'
      ? { ...common, source_wallet_id: form.fromId, destination_wallet_id: form.toId }
      : { ...common, type: form.type, wallet_id: form.walletId, category_id: categoryId as string },
  };
}

// The same intent typed into the old text field and tapped on the keypad.
// `1.234` (too precise) has no keypad equivalent and is left out.
const AMOUNTS: [text: string, minor: string][] = [
  ['', ''], ['0', '0'], ['0.00', '0'], ['65', '6500'], ['65.5', '6550'], ['0.01', '1'], ['999999999.99', '99999999999'], ['1000000000', '100000000000'], ['abc', 'abc'], ['007', '007'],
];
const DATES = [TODAY, '2026-10-17', '2026-10-19', '2026-02-30', '', '18/10/2026', '1969-12-31'];
const NOTES = ['', 'lunch', '  ', 'x'.repeat(500), 'x'.repeat(501), 'line one\r\nline two', 'evil‮text', 'Café'];
const MERCHANTS = ['', '7-Eleven', 'two\nlines', 'm'.repeat(120), 'm'.repeat(121), ' Café '];
type Shape = { type: EntryType; categoryByType: Record<'expense' | 'income', string | null>; fromId: string; toId: string };
const SHAPES: Shape[] = [
  { type: 'expense', categoryByType: { expense: FOOD.id, income: SALARY.id }, fromId: CASH, toId: BANK },
  { type: 'expense', categoryByType: { expense: null, income: SALARY.id }, fromId: CASH, toId: BANK },
  { type: 'income', categoryByType: { expense: FOOD.id, income: SALARY.id }, fromId: CASH, toId: BANK },
  { type: 'income', categoryByType: { expense: FOOD.id, income: null }, fromId: CASH, toId: BANK },
  { type: 'transfer', categoryByType: { expense: null, income: null }, fromId: CASH, toId: BANK },
  { type: 'transfer', categoryByType: { expense: FOOD.id, income: null }, fromId: BANK, toId: BANK },
];

function both(shape: Shape, amount: [string, string], date: string, note: string, merchant: string) {
  const recordId = uuid();
  const legacy = legacyBuild({ recordId, type: shape.type, amount: amount[0], walletId: CASH, categoryByType: { expense: shape.categoryByType.expense ?? undefined, income: shape.categoryByType.income ?? undefined }, fromId: shape.fromId, toId: shape.toId, date, note, merchant }, tc);
  const draft: QuickAddDraft = {
    mode: 'create', recordId, commandId: uuid(), type: shape.type, amountMinor: amount[1], occurredOn: date, walletId: CASH, categoryByType: shape.categoryByType,
    fromWalletId: shape.fromId, toWalletId: shape.toId, note, merchant,
  };
  return { legacy, mine: buildQuickAdd(draft, { today: TODAY, tc }) };
}

function assertParity(legacy: ReturnType<typeof legacyBuild>, mine: ReturnType<typeof buildQuickAdd>, label: string): void {
  if ('errors' in legacy) {
    assert.equal(mine.ok, false, label);
    if (!mine.ok) assert.deepEqual(mine.errors, legacy.errors, label);
  } else {
    assert.equal(mine.ok, true, label);
    // Byte-for-byte: `keys.keyFor('create', input)` compares the JSON text.
    if (mine.ok) assert.equal(JSON.stringify(mine.input), JSON.stringify(legacy.input), label);
  }
}

test('quick add parity table: the same errors, keys, messages and inputs as the current form', () => {
  let rows = 0;
  let accepted = 0;
  for (const shape of SHAPES) {
    for (const amount of AMOUNTS) {
      for (const date of DATES) {
        const { legacy, mine } = both(shape, amount, date, 'lunch', '');
        assertParity(legacy, mine, `${shape.type} ${JSON.stringify(amount)} ${date}`);
        rows += 1;
        if ('input' in legacy) accepted += 1;
      }
    }
    for (const note of NOTES) {
      for (const merchant of MERCHANTS) {
        const { legacy, mine } = both(shape, ['65', '6500'], TODAY, note, merchant);
        assertParity(legacy, mine, `${shape.type} ${JSON.stringify(note)} ${JSON.stringify(merchant)}`);
        rows += 1;
        if ('input' in legacy) accepted += 1;
      }
    }
  }
  assert.equal(rows, SHAPES.length * (AMOUNTS.length * DATES.length + NOTES.length * MERCHANTS.length));
  assert.ok(accepted > 20 && accepted < rows, 'the table covers both accepted and refused drafts');
});

test('keypad amounts: canonical satang above zero and within the cap', () => {
  const table: [string, string | null][] = [
    ['', 'empty'], ['0', 'zero'], ['00', 'invalid'], ['-1', 'invalid'], ['1.5', 'invalid'], [' 1', 'invalid'], ['1e3', 'invalid'], ['๑๒', 'invalid'],
    ['1', null], ['6500', null], ['99999999999', null], ['100000000000', 'too_large'], ['9'.repeat(60), 'too_large'],
  ];
  for (const [value, problem] of table) assert.equal(amountProblemOf(value), problem, JSON.stringify(value));
  assert.deepEqual(AMOUNT_PROBLEM_TEXT, {
    empty: 'Enter an amount', invalid: 'Enter an amount like 65 or 65.50', zero: 'Enter an amount above zero', too_large: 'Amounts go up to ฿999,999,999.99',
  });
});

test('errors go through tc', () => {
  const draft = newQuickAddDraft({ ids: { recordId: uuid(), commandId: uuid() }, today: TODAY, wallets: WALLETS, categories: [FOOD] });
  const result = buildQuickAdd({ ...draft, occurredOn: '2026-10-19' }, { today: TODAY, tc: marked });
  assert.deepEqual(result, { ok: false, errors: { amount_minor: '[Enter an amount]', occurred_on: '[This date is in the future.]' } });
});

test('a new draft starts like the current form', () => {
  const ids = { recordId: uuid(), commandId: uuid() };
  const draft = newQuickAddDraft({ ids, today: TODAY, wallets: WALLETS, categories: [PETS, FOOD, SALARY, TRAVEL] });
  assert.deepEqual(draft, {
    mode: 'create', recordId: ids.recordId, commandId: ids.commandId, type: 'expense', amountMinor: '', occurredOn: TODAY, walletId: CASH,
    categoryByType: { expense: PETS.id, income: SALARY.id }, fromWalletId: CASH, toWalletId: BANK, note: '', merchant: '',
  });
  const single = newQuickAddDraft({ ids, today: TODAY, wallets: [WALLETS[0]], categories: [FOOD], type: 'transfer' });
  assert.deepEqual([single.type, single.fromWalletId, single.toWalletId, single.categoryByType.income], ['transfer', CASH, CASH, null]);
  const result = buildQuickAdd({ ...single, amountMinor: '100' }, { today: TODAY, tc });
  assert.deepEqual(result, { ok: false, errors: { wallets: 'Choose two different wallets' } });
  const empty = newQuickAddDraft({ ids, today: TODAY, wallets: [], categories: [] });
  assert.deepEqual([empty.walletId, empty.fromWalletId, empty.toWalletId], [null, null, null]);
});

test('a missing wallet asks the user to choose one, with the keys the form renders', () => {
  const draft = newQuickAddDraft({ ids: { recordId: uuid(), commandId: uuid() }, today: TODAY, wallets: WALLETS, categories: [FOOD, SALARY] });
  assert.deepEqual(buildQuickAdd({ ...draft, amountMinor: '100', walletId: null }, { today: TODAY, tc }), { ok: false, errors: { wallet_id: 'Choose a wallet' } });
  assert.deepEqual(buildQuickAdd({ ...draft, type: 'transfer', amountMinor: '100', fromWalletId: null }, { today: TODAY, tc }), { ok: false, errors: { wallets: 'Choose two different wallets' } });
  assert.deepEqual(buildQuickAdd({ ...draft, type: 'transfer', amountMinor: '100', fromWalletId: null, toWalletId: null }, { today: TODAY, tc }), { ok: false, errors: { wallets: 'Choose two different wallets' } });
});

test('the move-wallets rule: two different wallets, in either order', () => {
  const draft = newQuickAddDraft({ ids: { recordId: uuid(), commandId: uuid() }, today: TODAY, wallets: WALLETS, categories: [FOOD], type: 'transfer' });
  const forward = buildQuickAdd({ ...draft, amountMinor: '5000' }, { today: TODAY, tc });
  assert.ok(forward.ok);
  assert.deepEqual([forward.input.id, 'source_wallet_id' in forward.input && forward.input.source_wallet_id, 'destination_wallet_id' in forward.input && forward.input.destination_wallet_id], [draft.recordId, CASH, BANK]);
  const back = buildQuickAdd({ ...draft, amountMinor: '5000', fromWalletId: BANK, toWalletId: CASH }, { today: TODAY, tc });
  assert.ok(back.ok);
  for (const same of [CASH, BANK]) {
    assert.deepEqual(buildQuickAdd({ ...draft, amountMinor: '5000', fromWalletId: same, toWalletId: same }, { today: TODAY, tc }), { ok: false, errors: { wallets: 'Choose two different wallets' } });
  }
});

test('one record id per draft: building again names the same record, and a device draft gains its type', () => {
  const draft = { ...newQuickAddDraft({ ids: { recordId: uuid(), commandId: uuid() }, today: TODAY, wallets: WALLETS, categories: [FOOD] }), amountMinor: '6500', note: ' lunch ' };
  const first = buildQuickAdd(draft, { today: TODAY, tc });
  const again = buildQuickAdd(draft, { today: TODAY, tc });
  assert.ok(first.ok && again.ok);
  assert.deepEqual(first, again);
  assert.equal(first.input.id, draft.recordId);
  assert.deepEqual(first.entry, { id: draft.recordId, amount_minor: '6500', occurred_on: TODAY, note: 'lunch', merchant: null, type: 'expense', wallet_id: CASH, category_id: FOOD.id });
  const move = buildQuickAdd({ ...draft, type: 'transfer' }, { today: TODAY, tc });
  assert.ok(move.ok);
  assert.deepEqual(move.entry, { ...move.input, type: 'transfer' });
  assert.deepEqual(toPendingEntry(first.input), first.entry);
});

test('"add another" starts a new draft with new ids, keeping the choices', () => {
  const saved: QuickAddDraft = { ...newQuickAddDraft({ ids: { recordId: uuid(), commandId: uuid() }, today: TODAY, wallets: WALLETS, categories: [FOOD, SALARY] }), amountMinor: '6500', note: 'n', merchant: 'm', occurredOn: '2026-10-17', walletId: BANK };
  const ids = { recordId: uuid(), commandId: uuid() };
  const next = anotherDraft(saved, ids);
  assert.deepEqual(next, { ...saved, ...ids, amountMinor: '', note: '', merchant: '' });
  assert.throws(() => anotherDraft(saved, { recordId: saved.recordId, commandId: uuid() }));
  assert.throws(() => anotherDraft(saved, { recordId: uuid(), commandId: saved.commandId }));
});

test('the date chip steps by days, never into the future or before 1970', () => {
  assert.equal(stepDay(TODAY, -1, TODAY), '2026-10-17');
  assert.equal(stepDay(TODAY, 1, TODAY), TODAY);
  assert.equal(stepDay('2026-10-01', -1, TODAY), '2026-09-30');
  assert.equal(stepDay('2026-10-16', 5, TODAY), TODAY);
  assert.equal(stepDay('2026-10-16', 1, TODAY), '2026-10-17');
  assert.equal(stepDay('1970-01-01', -1, TODAY), '1970-01-01');
});
