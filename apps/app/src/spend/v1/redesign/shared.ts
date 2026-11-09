// Shared pieces for the redesigned core-loop view models (R3): copy lines,
// Bangkok calendar maths, device-draft states and diary rows grouped by day.
// Pure TypeScript: no React, no React Native. Money stays exact (BigInt over
// canonical strings); dates are Asia/Bangkok calendar dates (`YYYY-MM-DD`).
import type { CategoryDto, Minor, TransactionDto, TransactionType, WalletSnapshot } from '@gogospend/contracts';

import { OUTBOX_STATES } from '../../../storage/types.ts';
import type { OutboxCommand, OutboxState } from '../../../storage/types.ts';
import { formatMinor } from '../money.ts';
import type { MoneyLocale } from '../money.ts';
import { categoryName } from '../viewModels.ts';

export type CopyValues = Readonly<Record<string, string | number>>;
/** English source text for `tc()` plus its `{placeholder}` values (what `useCopyLine()` renders). */
export type CopyLine = { text: string; values?: CopyValues };
/** The screens' `tc()`: English source text in, the active locale's text out. */
export type Translate = (english: string, values?: CopyValues) => string;

/** Renders a copy line with `tc()`. */
export const say = (tc: Translate, line: CopyLine): string => tc(line.text, line.values);

/** Wallet names and categories by id. Server wallets (`WalletDto`) and device wallets (`WalletSnapshot`) both fit. */
export type Lookups = {
  wallets: ReadonlyMap<string, Pick<WalletSnapshot, 'id' | 'name'>>;
  categories: ReadonlyMap<string, CategoryDto>;
};

// ---------------------------------------------------------------------------
// Bangkok calendar dates

const DAY_MS = 86_400_000;
const ISO_DATE = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/;

/** Days since 1970-01-01 for a real Gregorian `YYYY-MM-DD` date; throws for anything else. */
export function dayNumber(date: string): number {
  const match = ISO_DATE.exec(date);
  if (!match) throw new TypeError(`Expected a YYYY-MM-DD date: ${date}`);
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const time = Date.UTC(year, month - 1, day);
  const check = new Date(time);
  if (month < 1 || month > 12 || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) throw new TypeError(`Not a real date: ${date}`);
  return time / DAY_MS;
}

const fromDayNumber = (days: number): string => new Date(days * DAY_MS).toISOString().slice(0, 10);

/** The calendar date `delta` days after `date`. */
export function addDays(date: string, delta: number): string {
  return fromDayNumber(dayNumber(date) + delta);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return dayNumber(to) - dayNumber(from);
}

function nextMonth(month: string): string {
  const [year, number] = month.split('-').map(Number);
  return number === 12 ? `${String(year + 1).padStart(4, '0')}-01` : `${String(year).padStart(4, '0')}-${String(number + 1).padStart(2, '0')}`;
}

/** Days in a `YYYY-MM` month. */
export function daysInMonth(month: string): number {
  return daysBetween(`${month}-01`, `${nextMonth(month)}-01`);
}

/** BCP 47 tag for date labels: Thai dates in Thai, others as en-GB (what the current screens do). */
export type DateTag = 'th-TH' | 'en-GB';
export function dateTagFor(locale: string): DateTag {
  return locale === 'th' ? 'th-TH' : 'en-GB';
}

const utcMidnight = (date: string) => dayNumber(date) * DAY_MS;

/**
 * "Today", "Yesterday", else a short date such as "13 Oct 2026" (Thai:
 * Buddhist-era year), through the device's Intl data; Vietnamese reads en-GB.
 * It names `DayGroup.label` and its spoken summary. Screens draw day labels
 * with `src/ui/dateStep.ts` instead (DayHeader, DateChip), which reads the
 * same on every phone and has Vietnamese words.
 */
export function dayLabel(date: string, today: string, tc: Translate, tag: DateTag): string {
  const gap = daysBetween(date, today);
  if (gap === 0) return tc('Today');
  if (gap === 1) return tc('Yesterday');
  return new Intl.DateTimeFormat(tag, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(utcMidnight(date));
}

/** A long date for the record receipt, such as "Tuesday 13 October 2026". */
export function longDateLabel(date: string, tag: DateTag): string {
  return new Intl.DateTimeFormat(tag, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(utcMidnight(date));
}

// ---------------------------------------------------------------------------
// Device drafts

/**
 * What a draft on this device shows instead of looking confirmed:
 * - `saving`: unsent (queued on the device; never committed);
 * - `checking`: sending or uncertain. Either may already be committed: the
 *   sync engine counts both as uncertain (`summarize`), and so does v1's
 *   SyncStatus. A `session_changed` refusal leaves a command `sending` until
 *   the next session asks the server about it;
 * - `needs_look`: needs_review (the server refused it; the draft is kept);
 * - `update_to_send`: paused_upgrade (waits for an app update; refused
 *   before any commit).
 * `acknowledged` is committed and is not a draft any more.
 */
export type DraftState = 'saving' | 'checking' | 'needs_look' | 'update_to_send';

const DRAFT_STATES: Readonly<Record<OutboxState, DraftState | null>> = {
  unsent: 'saving',
  sending: 'checking',
  uncertain: 'checking',
  needs_review: 'needs_look',
  paused_upgrade: 'update_to_send',
  acknowledged: null,
};

export function draftStateOf(state: OutboxState): DraftState | null {
  return DRAFT_STATES[state];
}

/** English source text for each draft state (a quiet row subtitle). */
export const DRAFT_STATE_TEXT: Readonly<Record<DraftState, string>> = {
  saving: 'Saving…',
  checking: 'Checking with Jotbun',
  needs_look: 'Needs a look',
  update_to_send: 'Update Jotbun to send',
};

/**
 * Where a draft's money goes. It is decided by the draft's state (its label),
 * so a draft's label, its money group and every total it joins agree:
 * - `waiting` (saving, update to send): never committed, so it is added to
 *   the budget estimate and said as "Waiting to sync";
 * - `checking`: possibly committed already, so possibly in the server's
 *   totals: never added, only said apart ("Checking with Jotbun");
 * - none (needs a look): the server refused it, so it counts nowhere.
 */
export type MoneyGroup = 'waiting' | 'checking';

const MONEY_GROUPS: Readonly<Record<DraftState, MoneyGroup | null>> = {
  saving: 'waiting',
  update_to_send: 'waiting',
  checking: 'checking',
  needs_look: null,
};

/** The money group of a draft's state. */
export function moneyGroupOfDraft(state: DraftState): MoneyGroup | null {
  return MONEY_GROUPS[state];
}

/** The money group of an outbox state; null for a refused or acknowledged command. */
export function moneyGroupOf(state: OutboxState): MoneyGroup | null {
  const draft = draftStateOf(state);
  return draft === null ? null : moneyGroupOfDraft(draft);
}

/** Never committed: "waiting to sync" money, added to the budget estimate. */
export const WAITING_STATES: readonly OutboxState[] = OUTBOX_STATES.filter((state) => moneyGroupOf(state) === 'waiting');
/** Possibly committed already: kept apart from waiting money and never added. */
export const CHECKING_STATES: readonly OutboxState[] = OUTBOX_STATES.filter((state) => moneyGroupOf(state) === 'checking');

/** Drafts still on the device: every command that is not acknowledged. */
export function openDrafts(outbox: readonly OutboxCommand[]): OutboxCommand[] {
  return outbox.filter((command) => draftStateOf(command.state) !== null);
}

/**
 * Open drafts whose record is not among the confirmed ones. A confirmed
 * record wins over its own draft (a create the server committed before its
 * acknowledgement landed), so its money is never counted twice.
 */
export function unconfirmedDrafts(outbox: readonly OutboxCommand[], confirmedIds: ReadonlySet<string>): OutboxCommand[] {
  return openDrafts(outbox).filter((command) => !confirmedIds.has(command.payload.id));
}

/** Undo is `diary.removeDraft(commandId)`: only for a draft never transmitted. */
export function canUndoDraft(command: OutboxCommand): boolean {
  return command.state === 'unsent' && command.firstTransmissionAt === null;
}

/** Discard is `diary.discardDraft(commandId)`: only for a draft the server refused (needs review). */
export function canDiscardDraft(command: OutboxCommand): boolean {
  return command.state === 'needs_review';
}

export type DraftCounts = Readonly<Record<DraftState, number>>;
export function countDrafts(outbox: readonly OutboxCommand[]): DraftCounts {
  const counts: Record<DraftState, number> = { saving: 0, checking: 0, needs_look: 0, update_to_send: 0 };
  for (const command of outbox) {
    const state = draftStateOf(command.state);
    if (state) counts[state] += 1;
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Rows and day groups

export type RowState = 'confirmed' | DraftState;

/** One record or device draft as a diary row. */
export type DiaryRow = {
  /** Unique per row: the record id for a confirmed record, `draft:<commandId>` for a draft. */
  key: string;
  recordId: string;
  /** Drafts only: the device command (undo and discard use it). */
  commandId: string | null;
  /** Confirmed records only: the version an edit, delete or restore must send. */
  version: number | null;
  outboxState: OutboxState | null;
  type: TransactionType;
  occurredOn: string;
  /** The category name, or "Transfer". */
  title: string;
  /** The wallet, or "From → To" for a transfer. */
  detail: string;
  note: string | null;
  merchant: string | null;
  amountMinor: Minor;
  /** Signed: "-฿65.00" out, "+฿65.00" in, a transfer unsigned. */
  amountText: string;
  /** Spoken amount: "Expense ฿65.00", never just a sign. */
  amountLabel: string;
  state: RowState;
  /** "Saving…", "Needs a look"…; null when confirmed. */
  stateText: string | null;
  /** "Food, Expense ฿65.00, Saving…" */
  accessibilityLabel: string;
  canUndo: boolean;
  canDiscard: boolean;
  /** Edit and Delete work on confirmed records only (Copy works on both). */
  canEdit: boolean;
  /** C16: the record has a refused edit waiting for the person's choice on this phone. Never on a draft. */
  choicePending: boolean;
};

export type RowContext = {
  lookups: Lookups;
  tc: Translate;
  locale: MoneyLocale;
  /** C16: records with a pending choice on this phone. confirmedRow reads it; History passes it, Home leaves it out. */
  pendingChoiceIds?: ReadonlySet<string>;
};

/** The fields a confirmed record and a draft's payload share. */
export type EntryLike = { id: string; amount_minor: Minor; occurred_on: string; note?: string | null; merchant?: string | null } & (
  | { type: 'expense' | 'income'; wallet_id: string; category_id: string }
  | { type: 'transfer'; source_wallet_id: string; destination_wallet_id: string }
);

export type EntryWords = { title: string; detail: string; amountText: string; amountLabel: string };

/**
 * Title, detail and amount exactly as `recordView` words them. A category
 * that is not known reads "Category" for a confirmed record (recordView) and
 * "Expense" or "Income" for a draft (HomeScreen's draft title).
 */
export function entryWords(item: EntryLike, context: RowContext, missingCategory: 'category' | 'type'): EntryWords {
  const { lookups, tc, locale } = context;
  const walletName = (id: string) => lookups.wallets.get(id)?.name ?? tc('Wallet');
  const amount = formatMinor(item.amount_minor, locale);
  if (item.type === 'transfer') {
    return { title: tc('Transfer'), detail: `${walletName(item.source_wallet_id)} → ${walletName(item.destination_wallet_id)}`, amountText: amount, amountLabel: `${tc('Transfer')} ${amount}` };
  }
  const category = lookups.categories.get(item.category_id);
  const income = item.type === 'income';
  const fallback = missingCategory === 'category' ? tc('Category') : tc(income ? 'Income' : 'Expense');
  return {
    title: category ? categoryName(category, tc) : fallback,
    detail: walletName(item.wallet_id),
    amountText: `${income ? '+' : '-'}${amount}`,
    amountLabel: `${income ? tc('Income') : tc('Expense')} ${amount}`,
  };
}

export function confirmedRow(record: TransactionDto, context: RowContext): DiaryRow {
  const words = entryWords(record, context, 'category');
  return {
    key: record.id, recordId: record.id, commandId: null, version: record.version, outboxState: null,
    type: record.type, occurredOn: record.occurred_on, note: record.note, merchant: record.merchant, amountMinor: record.amount_minor,
    ...words, state: 'confirmed', stateText: null, accessibilityLabel: `${words.title}, ${words.amountLabel}`,
    canUndo: false, canDiscard: false, canEdit: true, choicePending: context.pendingChoiceIds?.has(record.id) ?? false,
  };
}

/** A device draft as a row; null for an acknowledged command (no longer a draft). */
export function draftRow(command: OutboxCommand, context: RowContext): DiaryRow | null {
  const state = draftStateOf(command.state);
  if (!state) return null;
  const entry = command.payload;
  const words = entryWords(entry, context, 'type');
  const stateText = context.tc(DRAFT_STATE_TEXT[state]);
  return {
    key: `draft:${command.commandId}`, recordId: entry.id, commandId: command.commandId, version: null, outboxState: command.state,
    type: entry.type, occurredOn: entry.occurred_on, note: entry.note ?? null, merchant: entry.merchant ?? null, amountMinor: entry.amount_minor,
    ...words, state, stateText, accessibilityLabel: `${words.title}, ${words.amountLabel}, ${stateText}`,
    canUndo: canUndoDraft(command), canDiscard: canDiscardDraft(command), canEdit: false, choicePending: false,
  };
}

const newestFirst = (a: OutboxCommand, b: OutboxCommand) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0);

/**
 * Confirmed records and open device drafts as rows. A draft whose record id is
 * already confirmed is left out (the confirmed record wins), so nothing is
 * counted twice. Drafts come first, newest first; records keep their order.
 */
export function mergeRows(records: readonly TransactionDto[], drafts: readonly OutboxCommand[], context: RowContext): DiaryRow[] {
  const draftRows = unconfirmedDrafts(drafts, new Set(records.map((record) => record.id)))
    .sort(newestFirst)
    .map((command) => draftRow(command, context))
    .filter((row): row is DiaryRow => row !== null);
  return [...draftRows, ...records.map((record) => confirmedRow(record, context))];
}

export type MoneyPair = { outMinor: Minor; inMinor: Minor; outText: string; inText: string };
/** A day's money: confirmed apart from drafts waiting to sync and drafts being checked. Transfers are neither in nor out. */
export type DayTotals = { confirmed: MoneyPair; waiting: MoneyPair; checking: MoneyPair };

export type DayGroup = {
  day: string;
  label: string;
  isToday: boolean;
  rows: DiaryRow[];
  totals: DayTotals;
  /** Confirmed money only: "Money out ฿120.00 · Money in ฿50.00"; null when none. */
  totalText: string | null;
  /** Draft money, kept apart: "Waiting to sync: money out ฿65.00", "Checking with Jotbun: …". */
  pendingLines: string[];
  /** Day header for screen readers: the label and the confirmed total. */
  accessibilityLabel: string;
  /**
   * Some of the day's confirmed records may not be loaded, so `totals` and
   * `totalText` may fall short: today past Home's page limit, or History's
   * oldest loaded day (and any earlier one) while more pages exist.
   */
  partial: boolean;
};

export type DayContext = RowContext & { today: string; dateTag: DateTag };

type Bucket = keyof DayTotals;

/** Confirmed money, or the money group of the row's draft state (its label); a draft that needs review counts nowhere. */
function bucketOf(row: DiaryRow): Bucket | null {
  return row.state === 'confirmed' ? 'confirmed' : moneyGroupOfDraft(row.state);
}

export function dayTotals(rows: readonly DiaryRow[], locale: MoneyLocale): DayTotals {
  const sums: Record<Bucket, { out: bigint; in: bigint }> = { confirmed: { out: 0n, in: 0n }, waiting: { out: 0n, in: 0n }, checking: { out: 0n, in: 0n } };
  for (const row of rows) {
    const bucket = bucketOf(row);
    if (!bucket || row.type === 'transfer') continue;
    if (row.type === 'expense') sums[bucket].out += BigInt(row.amountMinor);
    else sums[bucket].in += BigInt(row.amountMinor);
  }
  const pair = (sum: { out: bigint; in: bigint }): MoneyPair => ({
    outMinor: sum.out.toString(), inMinor: sum.in.toString(), outText: formatMinor(sum.out.toString(), locale), inText: formatMinor(sum.in.toString(), locale),
  });
  return { confirmed: pair(sums.confirmed), waiting: pair(sums.waiting), checking: pair(sums.checking) };
}

/** HomeScreen's waiting-money lines (existing catalog text), for any totals kept apart from confirmed money. */
export function pendingMoneyLines(waiting: MoneyPair, checking: MoneyPair, tc: Translate): string[] {
  return [
    waiting.inMinor === '0' ? null : tc('Waiting to sync: money in {amount}', { amount: waiting.inText }),
    waiting.outMinor === '0' ? null : tc('Waiting to sync: money out {amount}', { amount: waiting.outText }),
    checking.inMinor === '0' ? null : tc('Checking with Jotbun: money in {amount}', { amount: checking.inText }),
    checking.outMinor === '0' ? null : tc('Checking with Jotbun: money out {amount}', { amount: checking.outText }),
  ].filter((line): line is string => line !== null);
}

function dayGroup(day: string, rows: DiaryRow[], context: DayContext, partial: boolean): DayGroup {
  const { tc } = context;
  const totals = dayTotals(rows, context.locale);
  const parts = [
    totals.confirmed.outMinor === '0' ? null : `${tc('Money out')} ${totals.confirmed.outText}`,
    totals.confirmed.inMinor === '0' ? null : `${tc('Money in')} ${totals.confirmed.inText}`,
  ].filter((part): part is string => part !== null);
  const totalText = parts.length > 0 ? parts.join(' · ') : null;
  const label = dayLabel(day, context.today, tc, context.dateTag);
  return {
    day, label, isToday: day === context.today, rows, totals, totalText,
    pendingLines: pendingMoneyLines(totals.waiting, totals.checking, tc),
    accessibilityLabel: totalText ? `${label}, ${totalText}` : label,
    partial,
  };
}

const notPartial = () => false;

/**
 * Rows grouped by day, newest day first, each with its totals. Rows keep
 * their order within a day. `isPartial` marks the days whose confirmed
 * records may not all be loaded.
 */
export function groupDays(rows: readonly DiaryRow[], context: DayContext, isPartial: (day: string) => boolean = notPartial): DayGroup[] {
  const byDay = new Map<string, DiaryRow[]>();
  for (const row of rows) {
    const list = byDay.get(row.occurredOn);
    if (list) list.push(row);
    else byDay.set(row.occurredOn, [row]);
  }
  return [...byDay.keys()].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0)).map((day) => dayGroup(day, byDay.get(day) ?? [], context, isPartial(day)));
}

/** A group for one day from whatever rows fall on it (Home's "today" receipt, possibly empty). */
export function dayOf(day: string, rows: readonly DiaryRow[], context: DayContext, partial = false): DayGroup {
  return dayGroup(day, rows.filter((row) => row.occurredOn === day), context, partial);
}
