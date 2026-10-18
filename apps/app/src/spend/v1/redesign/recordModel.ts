// Record detail and edit: the receipt rows, the edit draft (keeping the
// version the edit command must send), Copy (a new draft with new ids dated
// today, only when the user asks), and the conflict comparison of "yours"
// against what is now on the server.
import { normalizeMerchant, normalizeNote } from '@gogospend/contracts';
import type { CategoryDto, TransactionDto, UpdateTransactionRequest, WalletSnapshot } from '@gogospend/contracts';

import type { OutboxCommand, PendingEntry } from '../../../storage/types.ts';
import { formatMinor } from '../money.ts';
import type { MoneyLocale } from '../money.ts';
import { categoryName } from '../viewModels.ts';
import { amountProblemOf, assertFreshIds, checkEntryFields } from './quickAddModel.ts';
import type { EntryFields, FieldErrors, QuickAddDraft } from './quickAddModel.ts';
import { confirmedRow, draftRow, longDateLabel } from './shared.ts';
import type { DateTag, Lookups, RowState, Translate } from './shared.ts';

export type ReceiptRowKey = 'amount' | 'type' | 'category' | 'wallet' | 'from_to' | 'date' | 'merchant' | 'note' | 'status';
export type ReceiptRow = { key: ReceiptRowKey; label: string; value: string };

export type RecordSource = { kind: 'confirmed'; record: TransactionDto } | { kind: 'draft'; command: OutboxCommand };

export type RecordDetail = {
  recordId: string;
  /** Drafts only. */
  commandId: string | null;
  /** Confirmed only: what edit and delete send. */
  version: number | null;
  type: TransactionDto['type'];
  title: string;
  amountText: string;
  amountLabel: string;
  state: RowState;
  stateText: string | null;
  /** Amount, type, category or wallet or From → To, date, then merchant and note when present, then status for a draft. */
  rows: ReceiptRow[];
  accessibilityLabel: string;
  actions: { edit: boolean; copy: boolean; delete: boolean; undo: boolean; discard: boolean };
};

export type DetailContext = { lookups: Lookups; tc: Translate; locale: MoneyLocale; dateTag: DateTag };

const TYPE_TEXT = { expense: 'Expense', income: 'Income', transfer: 'Transfer' } as const;
const fromToLabel = (tc: Translate) => `${tc('From')} → ${tc('To')}`;

/**
 * The record-detail receipt. A confirmed record can be edited, copied and
 * deleted; a draft on the device can be copied, undone while never sent, or
 * discarded once it needs review (never edited or deleted: it is not on the
 * server yet). Throws for an acknowledged command, which is not a draft.
 */
export function recordDetail(source: RecordSource, context: DetailContext): RecordDetail {
  const { tc, locale, dateTag } = context;
  const row = source.kind === 'confirmed' ? confirmedRow(source.record, context) : draftRow(source.command, context);
  if (!row) throw new TypeError('An acknowledged command is not a draft; show its confirmed record.');
  const rows: ReceiptRow[] = [
    { key: 'amount', label: tc('Amount'), value: formatMinor(row.amountMinor, locale) },
    { key: 'type', label: tc('Type'), value: tc(TYPE_TEXT[row.type]) },
    ...(row.type === 'transfer'
      ? [{ key: 'from_to' as const, label: fromToLabel(tc), value: row.detail }]
      : [{ key: 'category' as const, label: tc('Category'), value: row.title }, { key: 'wallet' as const, label: tc('Wallet'), value: row.detail }]),
    { key: 'date', label: tc('Date'), value: longDateLabel(row.occurredOn, dateTag) },
    ...(row.merchant ? [{ key: 'merchant' as const, label: tc('Merchant'), value: row.merchant }] : []),
    ...(row.note ? [{ key: 'note' as const, label: tc('Note'), value: row.note }] : []),
    ...(row.stateText ? [{ key: 'status' as const, label: tc('Status'), value: row.stateText }] : []),
  ];
  const confirmed = row.state === 'confirmed';
  return {
    recordId: row.recordId, commandId: row.commandId, version: row.version, type: row.type, title: row.title, amountText: row.amountText, amountLabel: row.amountLabel,
    state: row.state, stateText: row.stateText, rows, accessibilityLabel: row.accessibilityLabel,
    actions: { edit: confirmed, copy: true, delete: confirmed, undo: row.canUndo, discard: row.canDiscard },
  };
}

/**
 * The edit sheet's draft. `original` is the record as the user opened it:
 * changes are the fields that differ from it, so a field the user never
 * touched is never sent. `baseVersion` is the If-Match version the edit
 * command sends (`resources.updateTransaction(recordId, baseVersion,
 * changes, key)`, key from `keys.keyFor('edit:<id>', { version, changes })`):
 * the original's version, or the server's after "Apply my change". The type
 * never changes.
 */
export type EditDraft = EntryFields & { mode: 'edit'; recordId: string; baseVersion: number; original: TransactionDto };

export function editDraftFrom(record: TransactionDto): EditDraft {
  const common = {
    mode: 'edit' as const, recordId: record.id, baseVersion: record.version, original: record, type: record.type, amountMinor: record.amount_minor,
    occurredOn: record.occurred_on, note: record.note ?? '', merchant: record.merchant ?? '',
  };
  if (record.type === 'transfer') {
    return { ...common, walletId: null, categoryByType: { expense: null, income: null }, fromWalletId: record.source_wallet_id, toWalletId: record.destination_wallet_id };
  }
  return {
    ...common, walletId: record.wallet_id, fromWalletId: null, toWalletId: null,
    categoryByType: { expense: record.type === 'expense' ? record.category_id : null, income: record.type === 'income' ? record.category_id : null },
  };
}

/**
 * "Apply my change" after a conflict: the same changes (still measured
 * against the original), sent on top of the server's current version, as the
 * current list does. Throws for another record.
 */
export function rebaseEdit(draft: EditDraft, server: TransactionDto): EditDraft {
  if (server.id !== draft.recordId) throw new TypeError('The server record is another record.');
  return { ...draft, baseVersion: server.version };
}

export type EditResult =
  | { ok: true; id: string; version: number; changes: UpdateTransactionRequest; unchanged: boolean }
  | { ok: false; errors: FieldErrors };

/**
 * The PATCH body: only fields that differ from the original, after the same
 * checks quick add runs; `version` is `baseVersion`. `unchanged` means there
 * is nothing to send (close the sheet). Throws if the draft's type is not the
 * original's (the type never changes).
 */
export function buildEditChanges(draft: EditDraft, context: { today: string; tc: Translate }): EditResult {
  const original = draft.original;
  if (draft.type !== original.type || draft.recordId !== original.id) throw new TypeError('An edit keeps its record and its type.');
  const { errors, clean } = checkEntryFields(draft, context);
  if (!clean) return { ok: false, errors };
  const changes: UpdateTransactionRequest = {};
  if (clean.amount_minor !== original.amount_minor) changes.amount_minor = clean.amount_minor;
  if (clean.occurred_on !== original.occurred_on) changes.occurred_on = clean.occurred_on;
  if (clean.note !== original.note) changes.note = clean.note;
  if (clean.merchant !== original.merchant) changes.merchant = clean.merchant;
  if (clean.type === 'transfer' && original.type === 'transfer') {
    if (clean.source_wallet_id !== original.source_wallet_id) changes.source_wallet_id = clean.source_wallet_id;
    if (clean.destination_wallet_id !== original.destination_wallet_id) changes.destination_wallet_id = clean.destination_wallet_id;
  } else if (clean.type !== 'transfer' && original.type !== 'transfer') {
    if (clean.wallet_id !== original.wallet_id) changes.wallet_id = clean.wallet_id;
    if (clean.category_id !== original.category_id) changes.category_id = clean.category_id;
  }
  return { ok: true, id: draft.recordId, version: draft.baseVersion, changes, unchanged: Object.keys(changes).length === 0 };
}

type OpenLists = { wallets?: readonly (Pick<WalletSnapshot, 'id'> & { archived?: boolean })[]; categories?: readonly CategoryDto[] };

/**
 * Copy: a new quick-add draft with the same type, amount, wallet(s),
 * category, merchant and note, new record and command ids, dated today. It is
 * only ever made when the user taps Copy, and it is a draft to review and
 * save, never saved by itself. A wallet or category that is no longer open
 * (when the open lists are given) is left unchosen. Throws if `newId` would
 * reuse the source's id or give the same id twice.
 */
export function duplicateDraft(source: TransactionDto | PendingEntry, context: { newId: () => string; today: string } & OpenLists): QuickAddDraft {
  const ids = { recordId: context.newId(), commandId: context.newId() };
  assertFreshIds(ids, [source.id]);
  const wallet = (id: string) => (!context.wallets || context.wallets.some((open) => open.id === id && !open.archived) ? id : null);
  const category = (id: string, type: 'expense' | 'income') =>
    !context.categories || context.categories.some((open) => open.id === id && open.type === type && !open.archived) ? id : null;
  const common = {
    mode: 'create' as const, ...ids, type: source.type, amountMinor: source.amount_minor, occurredOn: context.today, note: source.note ?? '', merchant: source.merchant ?? '',
  };
  if (source.type === 'transfer') {
    return { ...common, walletId: null, categoryByType: { expense: null, income: null }, fromWalletId: wallet(source.source_wallet_id), toWalletId: wallet(source.destination_wallet_id) };
  }
  return {
    ...common, walletId: wallet(source.wallet_id), fromWalletId: null, toWalletId: null,
    categoryByType: { expense: source.type === 'expense' ? category(source.category_id, 'expense') : null, income: source.type === 'income' ? category(source.category_id, 'income') : null },
  };
}

/**
 * One field side by side. `youChanged`: the edit changes this field. A field
 * you did not touch keeps the server's value when your change is applied, so
 * it shows the server's value on both sides. `differs`: applying your change
 * would replace what is on the server.
 */
export type ConflictRow = { key: ReceiptRowKey; label: string; yours: string; server: string; youChanged: boolean; differs: boolean };

export type ConflictModel =
  | { kind: 'changed'; message: string; yoursLabel: string; serverLabel: string; rows: ConflictRow[]; keepMine: string; useServer: string }
  | { kind: 'deleted'; message: string };

const normalized = (normalize: (value: unknown) => string | null, value: string): string | null => {
  try {
    return normalize(value);
  } catch {
    return value.trim() || null;
  }
};

/** "Yours" (the edit draft) against "on the server" (the current record), field by field. */
export function conflictModel(draft: EditDraft, server: TransactionDto, context: DetailContext): ConflictModel {
  const { tc, locale, lookups, dateTag } = context;
  if (server.deleted_at !== null) return { kind: 'deleted', message: tc('This entry was deleted on another device.') };
  if (server.id !== draft.recordId) throw new TypeError('The server record is another record.');
  const original = draft.original;
  const none = tc('None');
  const money = (value: string) => (amountProblemOf(value) === null ? formatMinor(value, locale) : value || none);
  const walletName = (id: string | null) => (id === null ? none : lookups.wallets.get(id)?.name ?? tc('Wallet'));
  const categoryText = (id: string | null) => {
    const found = id === null ? undefined : lookups.categories.get(id);
    return found ? categoryName(found, tc) : id === null ? none : tc('Category');
  };
  const date = (value: string) => {
    try {
      return longDateLabel(value, dateTag);
    } catch {
      return value || none;
    }
  };
  const row = <T>(key: ReceiptRowKey, label: string, mine: T, before: T, now: T, show: (value: T) => string): ConflictRow => {
    const same = (a: T, b: T) => JSON.stringify(a) === JSON.stringify(b);
    const youChanged = !same(mine, before);
    return { key, label, yours: show(youChanged ? mine : now), server: show(now), youChanged, differs: youChanged && !same(mine, now) };
  };
  const text = (value: string | null) => value ?? none;
  const rows: ConflictRow[] = [row('amount', tc('Amount'), draft.amountMinor, original.amount_minor, server.amount_minor, money)];
  if (server.type === 'transfer' && original.type === 'transfer') {
    rows.push(row('from_to', fromToLabel(tc), [draft.fromWalletId, draft.toWalletId], [original.source_wallet_id, original.destination_wallet_id],
      [server.source_wallet_id, server.destination_wallet_id], ([from, to]) => `${walletName(from)} → ${walletName(to)}`));
  } else if (server.type !== 'transfer' && original.type !== 'transfer') {
    const mine = draft.type === 'transfer' ? null : draft.categoryByType[draft.type];
    rows.push(row('category', tc('Category'), mine, original.category_id, server.category_id, categoryText));
    rows.push(row('wallet', tc('Wallet'), draft.walletId, original.wallet_id, server.wallet_id, walletName));
  }
  rows.push(row('date', tc('Date'), draft.occurredOn, original.occurred_on, server.occurred_on, date));
  rows.push(row('merchant', tc('Merchant'), normalized(normalizeMerchant, draft.merchant), original.merchant, server.merchant, text));
  rows.push(row('note', tc('Note'), normalized(normalizeNote, draft.note), original.note, server.note, text));
  return {
    kind: 'changed', message: tc('This entry changed on another device.'), yoursLabel: tc('Yours'), serverLabel: tc('On the server'), rows,
    keepMine: tc('Apply my change'), useServer: tc("Keep what's on the server"),
  };
}
