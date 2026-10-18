// The redesigned History ("calm data"): one month's records in day groups
// with day totals, device drafts merged into their days with their state,
// type / wallet / category filters, and a search over the category name,
// merchant and note with a summary ("5 entries, ฿420.00 out"). Also the
// "Recently deleted" rows for records still restorable (30 days).
import { RESTORE_WINDOW_DAYS } from '@gogospend/contracts';
import type { Minor, TransactionDto, TransactionType } from '@gogospend/contracts';

import type { OutboxCommand } from '../../../storage/types.ts';
import type { MoneyLocale } from '../money.ts';
import { categoryName, monthOf } from '../viewModels.ts';
import { confirmedRow, dateTagFor, dayTotals, groupDays, mergeRows, openDrafts, say } from './shared.ts';
import type { CopyLine, DateTag, DayGroup, EntryLike, Lookups, Translate } from './shared.ts';

export type HistoryFilters = {
  type?: TransactionType;
  /** A transfer matches when the wallet is either side. */
  walletId?: string;
  categoryId?: string;
};

export type HistoryInput = {
  /** `YYYY-MM`. */
  month: string;
  today: string;
  tc: Translate;
  locale: MoneyLocale;
  dateTag?: DateTag;
  /** The month's confirmed records as loaded (every page so far). */
  records: readonly TransactionDto[];
  /** False while more pages exist: a search then covers only what is loaded, and says so. */
  complete: boolean;
  /** The device outbox; open drafts in this month join their days. */
  drafts: readonly OutboxCommand[];
  lookups: Lookups;
  filters?: HistoryFilters;
  query?: string;
};

export type SearchSummary = {
  /** Confirmed matches. */
  count: number;
  /** Drafts on the device that match, counted apart. */
  draftCount: number;
  outMinor: Minor;
  inMinor: Minor;
  /** "5 entries, ฿420.00 out" (confirmed only). */
  text: string;
  /** "1 more saved on this device", or null. */
  draftText: string | null;
  /** Not every page is loaded yet, so the summary may be short. */
  partial: boolean;
};

export type HistoryModel = {
  month: string;
  groups: DayGroup[];
  empty: boolean;
  emptyText: string | null;
  /** A search or a filter is on. */
  filtered: boolean;
  /** Present while a search or filter is on. */
  summary: SearchSummary | null;
};

/**
 * Search folding: NFKC (full-width and half-width forms become their usual
 * form; Thai stays Thai, and canonical mark order is fixed so a tone mark
 * typed before a lower vowel matches), then a locale-independent lower case,
 * then NFC again. Marks are never stripped: in Thai they are letters.
 * Whitespace runs become one space.
 */
export function foldForSearch(text: string): string {
  return text.normalize('NFKC').toLowerCase().normalize('NFC').replace(/\s+/gu, ' ').trim();
}

/** True when every word of the query appears in at least one field (folded). An empty query matches. */
export function matchesSearch(fields: readonly (string | null | undefined)[], query: string): boolean {
  const words = foldForSearch(query).split(' ').filter((word) => word.length > 0);
  if (words.length === 0) return true;
  const haystack = fields.filter((field): field is string => typeof field === 'string').map(foldForSearch);
  return words.every((word) => haystack.some((field) => field.includes(word)));
}

/** The fields a row is searched by: its category's name as shown, its merchant and its note. */
function searchFields(item: EntryLike, lookups: Lookups, tc: Translate): (string | null | undefined)[] {
  const category = item.type === 'transfer' ? undefined : lookups.categories.get(item.category_id);
  return [category ? categoryName(category, tc) : null, item.merchant, item.note];
}

function matchesFilters(item: EntryLike, filters: HistoryFilters): boolean {
  if (filters.type && item.type !== filters.type) return false;
  if (filters.walletId) {
    const touches = item.type === 'transfer' ? item.source_wallet_id === filters.walletId || item.destination_wallet_id === filters.walletId : item.wallet_id === filters.walletId;
    if (!touches) return false;
  }
  if (filters.categoryId && (item.type === 'transfer' || item.category_id !== filters.categoryId)) return false;
  return true;
}

function summaryLine(count: number, out: string | null, income: string | null): CopyLine {
  if (count === 0) return { text: 'No entries match' };
  const one = count === 1;
  if (out && income) return { text: one ? '1 entry, {out} out, {in} in' : '{count} entries, {out} out, {in} in', values: { count, out, in: income } };
  if (out) return { text: one ? '1 entry, {out} out' : '{count} entries, {out} out', values: { count, out } };
  if (income) return { text: one ? '1 entry, {in} in' : '{count} entries, {in} in', values: { count, in: income } };
  return one ? { text: '1 entry' } : { text: '{count} entries', values: { count } };
}

export function historyModel(input: HistoryInput): HistoryModel {
  const { month, tc, locale, lookups } = input;
  const filters = input.filters ?? {};
  const query = input.query ?? '';
  const filtered = foldForSearch(query).length > 0 || Boolean(filters.type || filters.walletId || filters.categoryId);
  const keep = (item: EntryLike) => matchesFilters(item, filters) && matchesSearch(searchFields(item, lookups, tc), query);
  const records = input.records.filter((record) => monthOf(record.occurred_on) === month && keep(record));
  const drafts = openDrafts(input.drafts).filter((command) => monthOf(command.payload.occurred_on) === month && keep(command.payload));
  const context = { lookups, tc, locale, today: input.today, dateTag: input.dateTag ?? dateTagFor(locale) };
  const rows = mergeRows(records, drafts, context);
  const groups = groupDays(rows, context);
  const empty = rows.length === 0;
  let summary: SearchSummary | null = null;
  if (filtered) {
    const confirmed = rows.filter((row) => row.state === 'confirmed');
    const totals = dayTotals(confirmed, locale).confirmed;
    const draftCount = rows.length - confirmed.length;
    summary = {
      count: confirmed.length,
      draftCount,
      outMinor: totals.outMinor,
      inMinor: totals.inMinor,
      text: say(tc, summaryLine(confirmed.length, totals.outMinor === '0' ? null : totals.outText, totals.inMinor === '0' ? null : totals.inText)),
      draftText: draftCount === 0 ? null : draftCount === 1 ? tc('1 more saved on this device') : tc('{count} more saved on this device', { count: draftCount }),
      partial: !input.complete,
    };
  }
  return {
    month, groups, empty, filtered, summary,
    emptyText: empty ? (filtered ? tc('No entries match') : tc('No entries in this month')) : null,
  };
}

// ---------------------------------------------------------------------------
// Recently deleted

/**
 * Documented gap: no existing API lists deleted records.
 * - `SpendV1Resources.history` (GET /v1/history) returns active records only;
 *   the server filters `deleted_at IS NULL`.
 * - `DiaryView` exposes the device's wallets and categories, not records.
 *   The diary's confirmed state does hold deleted transaction snapshots from
 *   sync (state `deleted`, with `deleted_at` and the post-delete version), so
 *   exposing them there, or a server listing, would feed this model.
 * Until one exists, the model takes whatever deleted records the caller has
 * (for example the one just deleted, from its acknowledgement) and computes
 * what is still restorable, exactly as the server's rule does.
 */
export const RECENTLY_DELETED_GAP = {
  source: 'none',
  detail: 'No existing API lists deleted records: /v1/history returns active records only and DiaryView exposes no records. The device diary holds deleted transaction snapshots from sync; exposing them (or a server listing) is needed to fill this list.',
} as const;

export type DeletedRow = {
  recordId: string;
  /** The version a restore must send (the deleted record's current version). */
  version: number;
  title: string;
  detail: string;
  amountText: string;
  amountLabel: string;
  occurredOn: string;
  deletedAt: string;
  /** ISO instant: deleted_at + 30 days. */
  restorableUntil: string;
  /** Whole days left to restore, rounded up (1 on the last day). */
  daysLeft: number;
  daysLeftText: string;
};

export type RecentlyDeletedModel = {
  rows: DeletedRow[];
  emptyText: string | null;
  gap: typeof RECENTLY_DELETED_GAP;
};

const DAY_MS = 86_400_000;
const WINDOW_MS = RESTORE_WINDOW_DAYS * DAY_MS;

/**
 * Deleted records still restorable at `now`, most recently deleted first.
 * The server allows a restore while `deleted_at >= now − 30 days`.
 */
export function recentlyDeletedModel(input: { records: readonly TransactionDto[]; now: Date; lookups: Lookups; tc: Translate; locale: MoneyLocale }): RecentlyDeletedModel {
  const { tc } = input;
  const now = input.now.getTime();
  const rows = input.records
    .filter((record): record is TransactionDto & { deleted_at: string } => record.deleted_at !== null && Number.isFinite(Date.parse(record.deleted_at)))
    .map((record) => ({ record, until: Date.parse(record.deleted_at) + WINDOW_MS }))
    .filter(({ until }) => now <= until)
    .sort((a, b) => b.until - a.until)
    .map(({ record, until }): DeletedRow => {
      const row = confirmedRow(record, input);
      const daysLeft = Math.min(RESTORE_WINDOW_DAYS, Math.max(1, Math.ceil((until - now) / DAY_MS)));
      return {
        recordId: record.id, version: record.version, title: row.title, detail: row.detail, amountText: row.amountText, amountLabel: row.amountLabel,
        occurredOn: record.occurred_on, deletedAt: record.deleted_at, restorableUntil: new Date(until).toISOString(), daysLeft,
        daysLeftText: daysLeft === 1 ? tc('Last day to restore') : tc('{days} days left to restore', { days: daysLeft }),
      };
    });
  return { rows, emptyText: rows.length === 0 ? tc('Nothing deleted in the last 30 days') : null, gap: RECENTLY_DELETED_GAP };
}
