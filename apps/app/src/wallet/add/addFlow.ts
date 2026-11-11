// The Bun Wallet's add flow (P2-T14; W14, W29; bw-tray-amount, rh-income,
// rh-transfer, bw-tray-confirm): the tray's types and steps, and the rules its
// steps share. One tray serves spending, income and money moved between the
// person's own wallets (W14). Every step is controlled by its host through
// StepProps, so the add tray (P2-T16) and the edit tray (P2-T27) drive the
// same steps. Money stays exact: satang strings through BigInt, never a JS
// number. Pure: a Node test reads it, so it imports by relative path and
// loads no React or React Native.
import type { Minor } from '@gogospend/contracts';

import type { QuickAddDraft } from '../../spend/v1/redesign/quickAddModel.ts';
import type { Lookups, Translate } from '../../spend/v1/redesign/shared.ts';
import { categoryName } from '../../spend/v1/viewModels.ts';
import { dayLabel } from '../../ui/dateStep.ts';
import type { DateLocale } from '../../ui/dateStep.ts';
import { applyKey, EMPTY_KEYPAD, evaluateKeypad, keypadFromMinor } from '../../ui/keypadExpression.ts';
import type { KeypadDigit, KeypadProblem, KeypadState } from '../../ui/keypadExpression.ts';

/** What the tray adds: spending, income, or money moved between the person's own wallets (W14). */
export type AddType = 'expense' | 'income' | 'transfer';

/**
 * The tray's steps. Spending and income go amount, then confirm; a transfer
 * goes amount, transfer (rh-transfer's two wallets), then confirm (P2-T16).
 * Confirm's rows open the pick steps, which return to confirm (P2-T15).
 */
export type AddStep = 'amount' | 'transfer' | 'confirm' | 'category' | 'wallet' | 'from' | 'to' | 'date' | 'note';

/** Every step is controlled: its host holds the draft, the keypad and the step shown. */
export type StepProps = {
  draft: QuickAddDraft;
  keypad: KeypadState;
  onDraft(next: QuickAddDraft): void;
  onKeypad(next: KeypadState): void;
  onStep(step: AddStep): void;
};

const TITLE_KEYS = { expense: 'add.titleExpense', income: 'add.titleIncome', transfer: 'add.titleTransfer' } as const;

/** The tray's title, which names its dialog: จดรายจ่าย, จดรายรับ or โอนเงิน. */
export function trayTitleKey(type: AddType): 'add.titleExpense' | 'add.titleIncome' | 'add.titleTransfer' {
  return TITLE_KEYS[type];
}

/** Where the amount's Next goes: a transfer chooses its two wallets first. */
export function stepAfterAmount(type: AddType): AddStep {
  return type === 'transfer' ? 'transfer' : 'confirm';
}

/**
 * The keypad problem the amount step shows above Next, in today's words
 * (KEYPAD_PROBLEM_TEXT through tc): a refused key's (a tenth digit passes
 * ฿999,999,999.99), else why the amount cannot go on (zero). A keypad with
 * nothing typed only keeps Next waiting, and says nothing: nothing nags (§2).
 */
export function amountProblem(keypad: KeypadState): KeypadProblem | null {
  if (keypad.problem !== null) return keypad.problem;
  const outcome = evaluateKeypad(keypad);
  return outcome.ok || outcome.problem === 'empty' ? null : outcome.problem;
}

/**
 * The keypad for an amount the person did not type: a chip's, Bun's reading,
 * a copy, move all, or the edit tray's opening amount (R106). It shows as
 * keypadFromMinor shows it (6550 as 65.50) and is `fresh`, so private mode
 * masks it until a key is pressed, and the first key starts the amount over
 * (walletKey).
 */
export function filledKeypad(minor: Minor): KeypadState {
  return { ...keypadFromMinor(minor), fresh: true };
}

/**
 * Whether the keypad holds an amount the person did not type: a fill
 * (filledKeypad), or satang, which only a fill can give, since this keypad has
 * no point (W29).
 */
export function isFilled(keypad: KeypadState): boolean {
  return keypad.fresh || keypad.operands.some((operand) => operand.includes('.'));
}

/** The tray keypad's keys (W29): digits, 000, 0 and delete. */
export type WalletKey = KeypadDigit | '000' | 'backspace';

/**
 * One key of the tray's keypad, through today's applyKey. On a filled amount
 * the first key starts over: a digit begins a new amount and delete clears it.
 * So delete never walks a fill's satang down to a bare point (฿65.50, ฿65.5,
 * ฿65.), no digit is refused as too precise, and no digit of a fill shows once
 * a key is pressed (R106).
 */
export function walletKey(keypad: KeypadState, key: WalletKey): KeypadState {
  if (!isFilled(keypad)) return applyKey(keypad, key);
  return key === 'backspace' ? EMPTY_KEYPAD : applyKey(EMPTY_KEYPAD, key);
}

export type ConfirmRow = { key: 'category' | 'wallet' | 'from' | 'to' | 'date' | 'note'; labelKey: string; value: string; guessed: boolean };
type RowKey = ConfirmRow['key'];

/** Each row's label: หมวด, กระเป๋า, จาก, ไป, วันที่ and โน้ต, lines P2-T15 adds to add/copy.ts. */
const ROW_LABELS: Readonly<Record<RowKey, string>> = {
  category: 'add.rowCategory',
  wallet: 'add.rowWallet',
  from: 'add.rowFrom',
  to: 'add.rowTo',
  date: 'add.rowDate',
  note: 'add.rowNote',
};

/**
 * The confirm step's rows (bw-tray-confirm): category, wallet, date and note
 * for spending and income; from, to, date and note for a transfer. Each value
 * is what its row shows: the category's name (a built-in category's through
 * `tc`, the app's copy, as every screen names it), the wallet's name, the day
 * as วันนี้, เมื่อวาน or the date (W12: no time), and the note. A value is empty
 * when there is nothing chosen or written, and the step says what to add. A
 * row is `guessed` while Bun filled it and the person has not changed it.
 */
export function confirmRows(
  draft: QuickAddDraft,
  context: { lookups: Lookups; today: string; dateLocale: DateLocale; guessed: ReadonlySet<string>; tc: Translate },
): ConfirmRow[] {
  const { lookups, today, dateLocale, guessed, tc } = context;
  const row = (key: RowKey, value: string): ConfirmRow => ({ key, labelKey: ROW_LABELS[key], value, guessed: guessed.has(key) });
  const walletName = (id: string | null) => (id === null ? '' : lookups.wallets.get(id)?.name ?? '');
  const date = row('date', dayLabel(draft.occurredOn, today, dateLocale).text);
  const note = row('note', draft.note.trim());
  if (draft.type === 'transfer') return [row('from', walletName(draft.fromWalletId)), row('to', walletName(draft.toWalletId)), date, note];
  const categoryId = draft.categoryByType[draft.type];
  const category = categoryId === null ? undefined : lookups.categories.get(categoryId);
  return [row('category', category ? categoryName(category, tc) : ''), row('wallet', walletName(draft.walletId)), date, note];
}

/** What each row shows of the draft, to tell whether the person changed it: the note as its row shows it, trimmed. */
const ROW_FIELDS = new Map<string, (draft: QuickAddDraft) => string | null>([
  ['category', (draft) => (draft.type === 'transfer' ? null : draft.categoryByType[draft.type])],
  ['wallet', (draft) => draft.walletId],
  ['from', (draft) => draft.fromWalletId],
  ['to', (draft) => draft.toWalletId],
  ['date', (draft) => draft.occurredOn],
  ['note', (draft) => draft.note.trim()],
]);

/**
 * What Bun filled stays marked as its guess until the person changes it: each
 * row whose value changed from `before` to `after` leaves `guessed`. A key
 * that is not a row stays.
 */
export function stillGuessed(guessed: ReadonlySet<string>, before: QuickAddDraft, after: QuickAddDraft): ReadonlySet<string> {
  const changed = (key: string) => {
    const field = ROW_FIELDS.get(key);
    return field !== undefined && field(before) !== field(after);
  };
  return new Set([...guessed].filter((key) => !changed(key)));
}

/**
 * Move all (rh-transfer): the wallet's available balance, offered only when it
 * is known and above zero. Offline there are no balances, and no guessed
 * number is ever offered.
 */
export function moveAllMinor(balances: ReadonlyMap<string, Minor> | null, walletId: string | null): Minor | null {
  if (balances === null || walletId === null) return null;
  const balance = balances.get(walletId);
  return balance !== undefined && BigInt(balance) > 0n ? balance : null;
}

/**
 * Each card's balance after the move (rh-transfer's หลังโอน), exact in BigInt:
 * the amount leaves `from` and reaches `to`. A balance that is not known stays
 * unknown, and one wallet on both sides keeps its balance.
 */
export function balancesAfter(
  balances: ReadonlyMap<string, Minor> | null,
  fromId: string | null,
  toId: string | null,
  amountMinor: Minor,
): { from: Minor | null; to: Minor | null } {
  const after = (id: string | null, sign: bigint): Minor | null => {
    const balance = balances === null || id === null ? undefined : balances.get(id);
    if (balance === undefined) return null;
    return fromId === toId ? balance : (BigInt(balance) + sign * BigInt(amountMinor)).toString();
  };
  return { from: after(fromId, -1n), to: after(toId, 1n) };
}
