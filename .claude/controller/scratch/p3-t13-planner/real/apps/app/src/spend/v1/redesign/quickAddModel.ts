// Quick add (and the same sheet's edit mode): the draft the sheet holds and
// the create input it builds. Every check the current AddTransactionScreen
// `build()` runs is kept, with the same field-error keys and messages, so the
// screen's error mapping (and `saveProblem` field errors) still line up.
//
// Id rules the screen must keep (they make a resend safe):
// - One record id per draft. `newQuickAddDraft` takes it once, when the sheet
//   opens; it never changes while the draft lives, even across "Try again",
//   so a resent command always names the same record, and a create refused
//   because that id already exists (`isOwnCreate(error, recordId)`) means an
//   earlier attempt committed: the entry is saved.
// - One device command id per draft. `diary.saveDraft(entry, commandId)` with
//   the same id is a no-op, so a double tap saves one draft.
// - Online saves use `keys.keyFor('create', input)`: the same payload keeps
//   its key until the outcome is known; a definite refusal settles it, and an
//   unconfirmed save keeps the draft frozen and resends the same command
//   online (never re-queued on the device), exactly as the current form does.
// - "Saved, add another?" starts a new draft with new ids (`anotherDraft`).
//   A copy of a record is a new draft with new ids too (`duplicateDraft` in
//   recordModel.ts). Nothing ever reuses a saved draft's ids.
// - How the record was made (`source`, P3-T13; H9: set once, at create) is
//   named only when the caller gives it, after the fields the current form
//   sends, so a create without one is the same JSON it always was. The add
//   tray names one; Quick add names none.
import { ContractValidationError, MINOR_AMOUNT_MAX, normalizeMerchant, normalizeNote, validateOccurredOn } from '@gogospend/contracts';
import type { CategoryDto, TransactionSource, TransactionType, WalletSnapshot } from '@gogospend/contracts';

import type { PendingEntry } from '../../../storage/types.ts';
import type { CreateEntryInput, CreateTransferInput } from '../resources.ts';
import { addDays } from './shared.ts';
import type { Translate } from './shared.ts';

export type EntryType = TransactionType;

/** The fields the sheet edits. The amount is a canonical satang string from the keypad ('' while empty). */
export type EntryFields = {
  type: EntryType;
  amountMinor: string;
  occurredOn: string;
  /** Expense and income: the wallet. Null asks the user to choose. */
  walletId: string | null;
  /** The chosen category per type, kept while the user switches type (as the current form does). */
  categoryByType: { expense: string | null; income: string | null };
  /** Move (transfer): from and to. */
  fromWalletId: string | null;
  toWalletId: string | null;
  note: string;
  merchant: string;
};

export type QuickAddDraft = EntryFields & {
  mode: 'create';
  /** Fixed for the draft's life (see the id rules above). */
  recordId: string;
  /** The device command id for `diary.saveDraft`; fixed for the draft's life. */
  commandId: string;
};

export type DraftIds = { recordId: string; commandId: string };

/**
 * Field-error keys, the same as the current form's: `amount_minor`,
 * `occurred_on`, `note`, `merchant`, `wallets` (a move's two wallets) and
 * `category_id`; plus `wallet_id`, which the current form already renders
 * and which appears only when a prefilled draft's wallet is gone.
 */
export type QuickAddField = 'amount_minor' | 'occurred_on' | 'note' | 'merchant' | 'wallets' | 'category_id' | 'wallet_id';
export type FieldErrors = Partial<Record<QuickAddField, string>>;

export type AmountProblem = 'empty' | 'invalid' | 'zero' | 'too_large';

const CANONICAL_MINOR = /^(?:0|[1-9][0-9]*)$/;

/** What is wrong with a keypad amount, or null when it is a canonical amount above zero and within the cap. */
export function amountProblemOf(amountMinor: string): AmountProblem | null {
  if (amountMinor === '') return 'empty';
  if (!CANONICAL_MINOR.test(amountMinor)) return 'invalid';
  if (amountMinor === '0') return 'zero';
  if (BigInt(amountMinor) > MINOR_AMOUNT_MAX) return 'too_large';
  return null;
}

/** English source text for each amount problem (the current form's messages). */
export const AMOUNT_PROBLEM_TEXT: Readonly<Record<AmountProblem, string>> = {
  empty: 'Enter an amount',
  invalid: 'Enter an amount like 65 or 65.50',
  zero: 'Enter an amount above zero',
  too_large: 'Amounts go up to ฿999,999,999.99',
};

/**
 * A new draft as the sheet opens: an expense dated today, the first wallet,
 * a move from the first wallet to the second (or the first again, which the
 * check refuses until the user picks), and the first category of each type.
 * Pass categories in the order chips show them (e.g. `rankRecentCategories`)
 * so the default is the most used one.
 */
export function newQuickAddDraft(context: {
  ids: DraftIds;
  today: string;
  wallets: readonly Pick<WalletSnapshot, 'id'>[];
  categories: readonly CategoryDto[];
  type?: EntryType;
}): QuickAddDraft {
  const { ids, today, wallets, categories } = context;
  const first = (type: 'expense' | 'income') => categories.find((category) => category.type === type && !category.archived)?.id ?? null;
  return {
    mode: 'create', recordId: ids.recordId, commandId: ids.commandId, type: context.type ?? 'expense', amountMinor: '', occurredOn: today,
    walletId: wallets[0]?.id ?? null, categoryByType: { expense: first('expense'), income: first('income') },
    fromWalletId: wallets[0]?.id ?? null, toWalletId: (wallets[1] ?? wallets[0])?.id ?? null, note: '', merchant: '',
  };
}

/** Refuses ids that a saved draft already used. */
export function assertFreshIds(ids: DraftIds, used: readonly string[]): void {
  if (ids.recordId === ids.commandId || used.includes(ids.recordId) || used.includes(ids.commandId)) {
    throw new Error('A new draft needs a new record id and a new command id.');
  }
}

/** "Saved, add another?": a fresh draft with new ids that keeps the type, wallets, categories and date. */
export function anotherDraft(saved: QuickAddDraft, ids: DraftIds): QuickAddDraft {
  assertFreshIds(ids, [saved.recordId, saved.commandId]);
  return { ...saved, recordId: ids.recordId, commandId: ids.commandId, amountMinor: '', note: '', merchant: '' };
}

const EARLIEST = '1970-01-01';

/** Steps the date chip by whole days, never past today (records cannot be in the future) or before 1970. */
export function stepDay(date: string, delta: number, today: string): string {
  const next = addDays(date, delta);
  if (next > today) return today;
  if (next < EARLIEST) return EARLIEST;
  return next;
}

/** The checked, normalized fields both create and edit build from. */
export type CleanFields = {
  amount_minor: string;
  occurred_on: string;
  note: string | null;
  merchant: string | null;
} & ({ type: 'expense' | 'income'; wallet_id: string; category_id: string } | { type: 'transfer'; source_wallet_id: string; destination_wallet_id: string });

/** Every check of the current form, in its order. Errors are translated with `tc`. */
export function checkEntryFields(fields: EntryFields, context: { today: string; tc: Translate }): { errors: FieldErrors; clean: CleanFields | null } {
  const { tc } = context;
  const errors: FieldErrors = {};
  const problem = amountProblemOf(fields.amountMinor);
  if (problem) errors.amount_minor = tc(AMOUNT_PROBLEM_TEXT[problem]);
  try {
    validateOccurredOn(fields.occurredOn, EARLIEST, context.today);
  } catch (error) {
    errors.occurred_on = error instanceof ContractValidationError && error.code === 'DATE_IN_FUTURE' ? tc('This date is in the future.') : tc('Enter a real date as YYYY-MM-DD');
  }
  let note: string | null = null;
  let merchant: string | null = null;
  try {
    note = normalizeNote(fields.note);
  } catch {
    errors.note = tc('Notes are up to 500 characters.');
  }
  try {
    merchant = normalizeMerchant(fields.merchant);
  } catch {
    errors.merchant = tc('Use one line of up to 120 characters.');
  }
  const transfer = fields.type === 'transfer';
  const categoryId = fields.type === 'transfer' ? null : fields.categoryByType[fields.type];
  const from = fields.fromWalletId;
  const to = fields.toWalletId;
  if (transfer && (from === null || to === null || from === to)) errors.wallets = tc('Choose two different wallets');
  if (!transfer && !categoryId) errors.category_id = tc('Choose a category');
  if (!transfer && !fields.walletId) errors.wallet_id = tc('Choose a wallet');
  if (Object.keys(errors).length > 0) return { errors, clean: null };
  const common = { amount_minor: fields.amountMinor, occurred_on: fields.occurredOn, note, merchant };
  const clean: CleanFields = fields.type === 'transfer'
    ? { ...common, type: 'transfer', source_wallet_id: from as string, destination_wallet_id: to as string }
    : { ...common, type: fields.type, wallet_id: fields.walletId as string, category_id: categoryId as string };
  return { errors, clean };
}

export type QuickAddResult =
  | { ok: true; input: CreateEntryInput | CreateTransferInput; entry: PendingEntry }
  | { ok: false; errors: FieldErrors };

/**
 * The create input for `resources.createTransaction` / `createTransfer`, and
 * the same entry as a device draft for `diary.saveDraft(entry, commandId)`.
 * The input's keys are in the current form's order, so `keys.keyFor` sees the
 * same JSON for the same draft; a `source` the caller gives comes last.
 */
export function buildQuickAdd(draft: QuickAddDraft, context: { today: string; tc: Translate; source?: TransactionSource }): QuickAddResult {
  const { errors, clean } = checkEntryFields(draft, context);
  if (!clean) return { ok: false, errors };
  const common = { id: draft.recordId, amount_minor: clean.amount_minor, occurred_on: clean.occurred_on, note: clean.note, merchant: clean.merchant };
  const made = context.source === undefined ? {} : { source: context.source };
  const input: CreateEntryInput | CreateTransferInput = clean.type === 'transfer'
    ? { ...common, source_wallet_id: clean.source_wallet_id, destination_wallet_id: clean.destination_wallet_id, ...made }
    : { ...common, type: clean.type, wallet_id: clean.wallet_id, category_id: clean.category_id, ...made };
  return { ok: true, input, entry: toPendingEntry(input) };
}

/** A create input as a device draft: a transfer gains its `type` (as the current form saves it). */
export function toPendingEntry(input: CreateEntryInput | CreateTransferInput): PendingEntry {
  return 'source_wallet_id' in input ? { ...input, type: 'transfer' } : input;
}
