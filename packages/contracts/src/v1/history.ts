/**
 * v1 history and totals. History pages are keyset-paginated on
 * (occurred_on, id) with an opaque cursor bound to the filter; nothing is
 * silently truncated. Totals are decimal strings; income and expense exclude
 * opening balances and transfers.
 */
import type { Minor, Revision } from "./common.ts";
import type { TransactionDto, TransactionType } from "./transactions.ts";

export const HISTORY_SORTS = ["date_desc", "date_asc"] as const;
export type HistorySort = (typeof HISTORY_SORTS)[number];
export const HISTORY_DEFAULT_LIMIT = 50;
export const HISTORY_MAX_LIMIT = 200;
export const HISTORY_QUERY_MAX_CHARS = 100;

/** Inclusive Gregorian date bounds plus optional scope. */
export type HistoryFilter = {
  from: string;
  through: string;
  wallet_id?: string;
  category_id?: string;
  type?: TransactionType;
  /** Case-insensitive text in the note or merchant. */
  query?: string;
  sort: HistorySort;
};

export type Totals = {
  income_minor: Minor;
  expense_minor: Minor;
  /** income − expense. */
  balance_minor: Minor;
  /** Net change per wallet in scope; transfers count on both sides and cancel overall. */
  by_wallet: Readonly<Record<string, Minor>>;
};

export type FilteredTotals = Totals & { count: number };

/** GET /v1/history */
export type HistoryPage = {
  items: TransactionDto[];
  next_cursor: string | null;
  /** The account revision these rows and totals were read at. */
  as_of_revision: Revision;
  /**
   * True when the account changed since the first page of this cursor
   * chain: keyset paging stays consistent for unchanged rows, but the client
   * should refresh rather than treat the pages as one snapshot.
   */
  refresh_suggested: boolean;
  /** Totals over the whole filter, not just this page. */
  summary: FilteredTotals;
};
