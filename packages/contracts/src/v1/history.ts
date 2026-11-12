/**
 * v1 history and totals. History pages are keyset-paginated on
 * (occurred_on, id) with an opaque cursor bound to the filter; nothing is
 * silently truncated. Totals are decimal strings; income and expense exclude
 * opening balances and transfers.
 */
import type { Minor, Revision } from "./common.ts";
import type { CurrencyCode } from "./currency.ts";
import type { TransactionDto, TransactionType } from "./transactions.ts";

export const HISTORY_SORTS = ["date_desc", "date_asc"] as const;
export type HistorySort = (typeof HISTORY_SORTS)[number];
export const HISTORY_DEFAULT_LIMIT = 50;
export const HISTORY_MAX_LIMIT = 200;
export const HISTORY_QUERY_MAX_CHARS = 100;
/** The most wallets one filter's `wallet_ids` names (P5-T2). */
export const HISTORY_MAX_WALLETS = 20;

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
  /** P5-T2: the records of one trip. */
  trip_id?: string;
  /** P5-T2: the records in one currency. */
  currency?: CurrencyCode;
  /** P5-T2: the records of any of these wallets, 1 to HISTORY_MAX_WALLETS; never with `wallet_id`. */
  wallet_ids?: string[];
};

export type Totals = {
  income_minor: Minor;
  expense_minor: Minor;
  /** income − expense. */
  balance_minor: Minor;
  /**
   * Net of the matching records per wallet they touch; transfers count on
   * both sides. Under a wallet filter, the other side of a matching transfer
   * shows only that transfer, not the other wallet's net change.
   */
  by_wallet: Readonly<Record<string, Minor>>;
  /**
   * P5-T2: the home currency of every amount here but `by_wallet`, whose
   * amounts are each in its wallet's currency. Totals read before phase 5
   * leave it out, and their amounts are baht.
   */
  currency?: CurrencyCode;
};

export type FilteredTotals = Totals & { count: number };

/** A record inside the restore window: the persisted shape, always with its deletion instant. */
export type DeletedTransactionDto = TransactionDto & { deleted_at: string };

/**
 * GET /v1/history/deleted ("Recently deleted"): the account's deleted records
 * still restorable, i.e. deleted at most RESTORE_WINDOW_DAYS ago (the restore
 * command's own rule), most recently deleted first. Keyset-paginated on
 * (deleted_at, id) with an opaque cursor; the only query parameters are
 * `limit` (1-HISTORY_MAX_LIMIT, default HISTORY_DEFAULT_LIMIT) and `cursor`.
 * Restore with POST /v1/transactions/:id/restore and the item's version.
 * Purged records are gone and never listed.
 */
export type DeletedHistoryPage = {
  items: DeletedTransactionDto[];
  next_cursor: string | null;
  /** The account revision these rows were read at. */
  as_of_revision: Revision;
  /** As in HistoryPage: the account changed since the first page of this cursor chain. */
  refresh_suggested: boolean;
};

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
