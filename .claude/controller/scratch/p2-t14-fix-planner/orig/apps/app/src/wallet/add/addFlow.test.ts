// The add flow's rules (P2-T14; W14, W29; bw-tray-confirm, rh-transfer): the
// tray's title by type; where the amount's Next goes; which keypad problem the
// amount step shows; the confirm step's rows, and Bun's guesses until the
// person changes them; move all, offered only for a known balance above zero;
// and each wallet's balance after a transfer, exact in BigInt.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { CategoryDto } from '@gogospend/contracts';

import type { QuickAddDraft } from '../../spend/v1/redesign/quickAddModel.ts';
import type { Lookups } from '../../spend/v1/redesign/shared.ts';
import { applyKey, EMPTY_KEYPAD, keypadFromMinor } from '../../ui/keypadExpression.ts';
import type { KeypadKey, KeypadState } from '../../ui/keypadExpression.ts';
import { amountProblem, balancesAfter, confirmRows, moveAllMinor, stepAfterAmount, stillGuessed, trayTitleKey } from './addFlow.ts';

const TODAY = '2026-10-24';

const category = (id: string, type: 'expense' | 'income', label: string | null, builtin: CategoryDto['builtin_key'] = null): CategoryDto => (
  { id, type, builtin_key: builtin, label, color: null, archived: false, version: 1 }
);

const LOOKUPS: Lookups = {
  wallets: new Map([['w-main', { id: 'w-main', name: 'บัญชีหลัก' }], ['w-cash', { id: 'w-cash', name: 'เงินสด' }]]),
  categories: new Map([
    ['c-food', category('c-food', 'expense', null, 'food')],
    ['c-merit', category('c-merit', 'expense', 'ทำบุญ')],
    ['c-salary', category('c-salary', 'income', null, 'salary')],
  ]),
};

const DRAFT: QuickAddDraft = {
  mode: 'create', recordId: 'r-1', commandId: 'k-1', type: 'expense', amountMinor: '', occurredOn: TODAY, walletId: 'w-main',
  categoryByType: { expense: 'c-food', income: 'c-salary' }, fromWalletId: 'w-main', toWalletId: 'w-cash', note: '', merchant: '',
};

/** The app's copy as tc gives it in Thai, for the built-in categories these cases name. */
const THAI: Readonly<Record<string, string>> = { Food: 'อาหาร', Salary: 'เงินเดือน' };
const tc = (english: string) => THAI[english] ?? english;

const context = (guessed: readonly string[] = []) => ({ lookups: LOOKUPS, today: TODAY, dateLocale: 'th' as const, guessed: new Set(guessed), tc });
const shown = (rows: ReturnType<typeof confirmRows>) => rows.map((row) => [row.key, row.labelKey, row.value]);
const guessedKeys = (rows: ReturnType<typeof confirmRows>) => rows.filter((row) => row.guessed).map((row) => row.key);

const typed = (...keys: KeypadKey[]): KeypadState => keys.reduce(applyKey, EMPTY_KEYPAD);

test("the tray's title follows its type, and the amount's Next goes to confirm, or a transfer's to its two wallets", () => {
  assert.equal(trayTitleKey('expense'), 'add.titleExpense');
  assert.equal(trayTitleKey('income'), 'add.titleIncome');
  assert.equal(trayTitleKey('transfer'), 'add.titleTransfer');
  assert.equal(stepAfterAmount('expense'), 'confirm');
  assert.equal(stepAfterAmount('income'), 'confirm');
  assert.equal(stepAfterAmount('transfer'), 'transfer');
});

test('an expense confirms category, wallet, date and note; a transfer confirms from, to, date and note', () => {
  assert.deepEqual(shown(confirmRows(DRAFT, context())), [
    ['category', 'add.rowCategory', 'อาหาร'],
    ['wallet', 'add.rowWallet', 'บัญชีหลัก'],
    ['date', 'add.rowDate', 'วันนี้'],
    ['note', 'add.rowNote', ''],
  ]);
  // Income names its own category, a custom name as written; yesterday and an earlier day as dateStep says them; the note trimmed.
  const income = { ...DRAFT, type: 'income' as const, occurredOn: '2026-10-23', note: '  โบนัสปลายปี ' };
  assert.deepEqual(shown(confirmRows(income, context())).map(([, , value]) => value), ['เงินเดือน', 'บัญชีหลัก', 'เมื่อวาน', 'โบนัสปลายปี']);
  const merit = { ...DRAFT, categoryByType: { expense: 'c-merit', income: null }, occurredOn: '2026-10-15' };
  assert.deepEqual(shown(confirmRows(merit, context())).map(([, , value]) => value), ['ทำบุญ', 'บัญชีหลัก', 'พฤหัส 15 ต.ค.', '']);
  assert.equal(confirmRows(merit, { ...context(), dateLocale: 'en' })[2]?.value, 'Thu 15 Oct');
  assert.deepEqual(shown(confirmRows({ ...DRAFT, type: 'transfer', note: 'ค่าห้อง' }, context())), [
    ['from', 'add.rowFrom', 'บัญชีหลัก'],
    ['to', 'add.rowTo', 'เงินสด'],
    ['date', 'add.rowDate', 'วันนี้'],
    ['note', 'add.rowNote', 'ค่าห้อง'],
  ]);
  // Nothing chosen, or a wallet or category no longer listed, shows nothing for the step to ask about.
  const unchosen = { ...DRAFT, walletId: null, categoryByType: { expense: 'c-gone', income: null } };
  assert.deepEqual(shown(confirmRows(unchosen, context())).map(([, , value]) => value), ['', '', 'วันนี้', '']);
  assert.deepEqual(shown(confirmRows({ ...DRAFT, type: 'transfer', fromWalletId: 'w-gone', toWalletId: null }, context())).map(([, , value]) => value), ['', '', 'วันนี้', '']);
});

test('fields Bun filled are marked guessed until the person changes them', () => {
  const guess = ['category', 'wallet', 'date', 'merchant'];
  assert.deepEqual(guessedKeys(confirmRows(DRAFT, context(guess))), ['category', 'wallet', 'date']);
  // The person picks another category: only that row stops being Bun's guess.
  const picked = { ...DRAFT, categoryByType: { ...DRAFT.categoryByType, expense: 'c-merit' } };
  const afterPick = stillGuessed(new Set(guess), DRAFT, picked);
  assert.deepEqual([...afterPick], ['wallet', 'date', 'merchant']);
  assert.deepEqual(guessedKeys(confirmRows(picked, context([...afterPick]))), ['wallet', 'date']);
  // A change that leaves every row as it was keeps every guess; the same value set again is no change.
  assert.deepEqual([...stillGuessed(new Set(guess), DRAFT, { ...DRAFT, amountMinor: '5000' })], guess);
  assert.deepEqual([...stillGuessed(new Set(guess), DRAFT, { ...DRAFT })], guess);
  // A new day and a new wallet are changes too; so is a note, and a type whose category differs.
  assert.deepEqual([...stillGuessed(new Set(guess), DRAFT, { ...DRAFT, occurredOn: '2026-10-23', walletId: 'w-cash' })], ['category', 'merchant']);
  assert.deepEqual([...stillGuessed(new Set(['note']), DRAFT, { ...DRAFT, note: 'ข้าวมันไก่' })], []);
  assert.deepEqual([...stillGuessed(new Set(['category']), DRAFT, { ...DRAFT, type: 'income' })], []);
  // A transfer's two wallets are their own rows.
  const transfer = { ...DRAFT, type: 'transfer' as const };
  assert.deepEqual([...stillGuessed(new Set(['from', 'to']), transfer, { ...transfer, fromWalletId: 'w-cash', toWalletId: 'w-main' })], []);
  assert.deepEqual(guessedKeys(confirmRows(transfer, context(['from', 'to', 'date']))), ['from', 'to', 'date']);
});

test('move all offers the available balance only when it is known and above zero', () => {
  const balances = new Map([['w-main', '2486000'], ['w-zero', '0'], ['w-owed', '-500'], ['w-satang', '1']]);
  assert.equal(moveAllMinor(null, 'w-main'), null);
  assert.equal(moveAllMinor(balances, 'w-zero'), null);
  assert.equal(moveAllMinor(balances, 'w-owed'), null);
  assert.equal(moveAllMinor(balances, 'w-gone'), null);
  assert.equal(moveAllMinor(balances, null), null);
  assert.equal(moveAllMinor(balances, 'w-main'), '2486000');
  assert.equal(moveAllMinor(balances, 'w-satang'), '1');
});

test('balances after a transfer move the exact amount', () => {
  const balances = new Map([['w-main', '2486000'], ['w-cash', '124000'], ['w-card', '-392000'], ['w-big', '99999999999'], ['w-huge', '9007199254740993']]);
  // rh-transfer's numbers: ฿24,860 and ฿1,240, with ฿500 moved.
  assert.deepEqual(balancesAfter(balances, 'w-main', 'w-cash', '50000'), { from: '2436000', to: '174000' });
  // Below zero, and past what a JS number holds exactly (2^53 + 1), still to the satang.
  assert.deepEqual(balancesAfter(balances, 'w-big', 'w-card', '99999999999'), { from: '0', to: '99999607999' });
  assert.deepEqual(balancesAfter(balances, 'w-card', 'w-big', '1'), { from: '-392001', to: '100000000000' });
  assert.deepEqual(balancesAfter(balances, 'w-huge', 'w-cash', '1'), { from: '9007199254740992', to: '124001' });
  // A balance that is not known stays unknown; offline nothing is known.
  assert.deepEqual(balancesAfter(balances, 'w-gone', 'w-cash', '50000'), { from: null, to: '174000' });
  assert.deepEqual(balancesAfter(balances, 'w-main', null, '50000'), { from: '2436000', to: null });
  assert.deepEqual(balancesAfter(null, 'w-main', 'w-cash', '50000'), { from: null, to: null });
  // One wallet on both sides moves nothing.
  assert.deepEqual(balancesAfter(balances, 'w-main', 'w-main', '50000'), { from: '2486000', to: '2486000' });
});

test("the amount step's problem: a refused key's, else why the amount cannot go on, but nothing for a keypad nothing was typed on", () => {
  assert.equal(amountProblem(EMPTY_KEYPAD), null);
  assert.equal(amountProblem(typed('5', 'backspace')), null);
  assert.equal(amountProblem(typed('5', '0')), null);
  assert.equal(amountProblem(typed('0')), 'zero');
  assert.equal(amountProblem(typed('000')), 'zero');
  // A tenth digit passes ฿999,999,999.99: refused, so the amount stays and says why.
  const nine = typed('9', '9', '9', '9', '9', '9', '9', '9', '9');
  assert.equal(amountProblem(nine), null);
  assert.equal(amountProblem(applyKey(nine, '9')), 'too_large');
  assert.equal(amountProblem(applyKey(applyKey(nine, '9'), 'backspace')), null);
  assert.equal(amountProblem(keypadFromMinor('99999999999')), null);
});
