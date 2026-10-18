// The redesigned Home: the month's budget pace, today's records as a receipt
// with the day's totals, earlier days, and every state the current Home has
// (loading, first wallet, load problems, offline with device drafts).
// Drafts on the device show their state ("Saving…", "Checking with Jotbun",
// "Needs a look", "Update Jotbun to send") and never enter confirmed totals.
// A draft whose record is already confirmed counts once, as confirmed money;
// a sending draft may already be committed, so it is checked, never added.
import type { BudgetDto, CategoryDto, HistoryPage, MonthSummary, TransactionDto, WalletDto } from '@gogospend/contracts';

import { V1Error } from '../../../api/client.ts';
import type { OutboxCommand } from '../../../storage/types.ts';
import { deriveDisplayedTotals } from '../pendingTotals.ts';
import { formatMinor } from '../money.ts';
import type { MoneyLocale } from '../money.ts';
import type { DiaryView } from '../spendDiary.ts';
import { monthOf, walletsTotal } from '../viewModels.ts';
import { budgetPace, paceCopy } from './budgetPace.ts';
import type { BudgetPace, PaceCopy } from './budgetPace.ts';
import { addDays, countDrafts, dateTagFor, dayOf, groupDays, mergeRows, moneyGroupOf, pendingMoneyLines, say, unconfirmedDrafts } from './shared.ts';
import type { DateTag, DayContext, DayGroup, DiaryRow, DraftCounts, Lookups, MoneyGroup, RowContext, Translate } from './shared.ts';

export type HomeData = {
  wallets: WalletDto[];
  categories: CategoryDto[];
  /** This month's summary. */
  summary: MonthSummary;
  /** This month's budget, or null. */
  budget: BudgetDto | null;
  /** Recent confirmed records, newest first (today's and earlier days'). */
  records: TransactionDto[];
  /**
   * The oldest day whose confirmed records are all in `records`, when the
   * earlier records were cut back to whole days (`earlierWholeDays`). Drafts
   * dated before it stay out of the day groups, so no day shows without its
   * confirmed money; `openDrafts` still lists them and the month's money
   * still counts them. Null or absent: nothing was cut.
   */
  oldestWholeDay?: string | null;
  /** False when not every record of today was read (`readWholeDay`): today's group is marked `partial`. Absent: true. */
  todayComplete?: boolean;
};

/** The same shape as `useLoad`'s result. */
export type HomeLoad = { state: 'loading' } | { state: 'ready'; data: HomeData } | { state: 'error'; error: unknown };

export type HomeInput = {
  today: string;
  tc: Translate;
  locale: MoneyLocale;
  dateTag?: DateTag;
  load: HomeLoad;
  /** The device diary's view, or null where there is no diary (web). */
  diary: DiaryView | null;
  /** At most this many earlier days (default: all that the records and drafts cover). */
  earlierDays?: number;
};

/**
 * The current screens' `loadProblem()` outcomes, by name:
 * upgrade_required, terms_required (policy_required), signed_out (signed out
 * or session changed), unsupported_platform, and load_failed (anything else,
 * the only one with "Try again").
 */
export type LoadProblemKind = 'upgrade_required' | 'terms_required' | 'signed_out' | 'unsupported_platform' | 'load_failed';
export type LoadProblem = { kind: LoadProblemKind; message: string; retry: boolean };

/** `loadProblem()` from screens/v1/parts.tsx, without React: the same messages and retry rule. */
export function classifyLoadProblem(error: unknown, tc: Translate): LoadProblem {
  switch (error instanceof V1Error ? error.outcome : undefined) {
    case 'upgrade_required': return { kind: 'upgrade_required', message: tc('Update Jotbun to keep using your diary. Nothing you saved is lost.'), retry: false };
    case 'policy_required': return { kind: 'terms_required', message: tc('Review and accept the updated terms to continue.'), retry: false };
    case 'signed_out':
    case 'session_changed': return { kind: 'signed_out', message: tc('Sign in again to see your diary.'), retry: false };
    case 'unsupported_platform': return { kind: 'unsupported_platform', message: tc('Your diary is available in the Jotbun app on iOS and Android.'), retry: false };
    default: return { kind: 'load_failed', message: tc("We couldn't load your diary."), retry: true };
  }
}

/** For the SyncBanner: the diary's phase and lock, and how many drafts are in each state. */
export type SyncFacts = {
  phase: DiaryView['phase'] | 'none';
  lockReason: DiaryView['lockReason'];
  drafts: DraftCounts;
};

/** Offline (a load problem with a diary): what the device holds is still shown, and Add works from it. */
export type OfflineHome = {
  today: DayGroup;
  earlier: DayGroup[];
  /** "Waiting to sync: money out ฿65.00" and "Checking with Jotbun: …" lines for this month. */
  waitingMoney: string[];
  canAdd: boolean;
  /** Every open draft on the device, whatever its date (see the ready model's `openDrafts`). */
  openDrafts: DiaryRow[];
};

export type BudgetCard = {
  pace: BudgetPace;
  copy: PaceCopy;
  /** The copy lines, translated. */
  total: string;
  headline: string;
  pendingNote: string | null;
  checkingNote: string | null;
  reassurance: string | null;
  setBudget: string | null;
};

export type HomeModel =
  | { kind: 'loading'; label: string }
  | { kind: 'problem'; problem: LoadProblem; offline: OfflineHome | null; sync: SyncFacts }
  | { kind: 'first_run'; reason: 'no_wallet'; headline: string; body: string; sync: SyncFacts }
  | {
      kind: 'ready';
      month: string;
      budget: BudgetCard;
      balance: { totalText: string; wallets: { id: string; name: string; balanceText: string; archived: boolean }[] };
      /** Today's receipt, with zero rows when nothing is logged yet. */
      today: DayGroup;
      todayEmptyText: string | null;
      earlier: DayGroup[];
      waitingMoney: string[];
      /**
       * Every open draft on the device (from an open diary), newest first,
       * whatever its date: also the ones on days Home does not show, and one
       * whose record already shows as confirmed (the sync counts include it
       * too). The review list and Remove/Discard come from here (`state`,
       * `canUndo`, `canDiscard`, `commandId`). Not money: no total reads it.
       */
      openDrafts: DiaryRow[];
      sync: SyncFacts;
    };

const ZERO = { income_minor: '0', expense_minor: '0', balance_minor: '0', by_wallet: {} };

// ---------------------------------------------------------------------------
// Loading helpers (pure; the screen does the fetching)

/** One page of a history query; the screen binds the filter and page size. */
export type HistoryPageReader = (cursor: string | undefined) => Promise<Pick<HistoryPage, 'items' | 'next_cursor'>>;

/**
 * Every record of one day, page by page, so the day's total is never a
 * partial sum, reading at most `maxPages` pages. A day with more is not an
 * error: what was read comes back with `complete: false`. Pass that on as
 * `HomeData.todayComplete`, and today's group is marked `partial`.
 */
export async function readWholeDay(read: HistoryPageReader, maxPages: number): Promise<{ records: TransactionDto[]; complete: boolean }> {
  const records: TransactionDto[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < maxPages; page += 1) {
    const result = await read(cursor);
    records.push(...result.items);
    if (result.next_cursor === null) return { records, complete: true };
    cursor = result.next_cursor;
  }
  return { records, complete: false };
}

/**
 * Newest-first earlier records cut back to whole days. When more pages
 * follow, the oldest day on this page may continue on the next one, so it is
 * left out rather than shown with a partial total. `oldestWholeDay` is the
 * day after it (every record from then on is here), or null when this page
 * is the last. Pass it on as `HomeData.oldestWholeDay`.
 */
export function earlierWholeDays(page: Pick<HistoryPage, 'items' | 'next_cursor'>): { records: TransactionDto[]; oldestWholeDay: string | null } {
  if (page.next_cursor === null || page.items.length === 0) return { records: page.items, oldestWholeDay: null };
  const oldest = page.items.reduce((day, record) => (record.occurred_on < day ? record.occurred_on : day), page.items[0].occurred_on);
  return { records: page.items.filter((record) => record.occurred_on !== oldest), oldestWholeDay: addDays(oldest, 1) };
}

// ---------------------------------------------------------------------------
// The model

/**
 * HomeScreen's `WaitingMoney` lines for one month: waiting and checking money
 * in and out, never mixed with confirmed money. A draft whose record is in
 * `confirmedIds` is confirmed money already, so it is left out.
 */
export function waitingMoneyLines(outbox: readonly OutboxCommand[], month: string, tc: Translate, locale: MoneyLocale, confirmedIds: ReadonlySet<string> = new Set()): string[] {
  const drafts = unconfirmedDrafts(outbox, confirmedIds).filter((command) => monthOf(command.payload.occurred_on) === month);
  const pair = (group: MoneyGroup) => {
    const totals = deriveDisplayedTotals(ZERO, drafts.filter((command) => moneyGroupOf(command.state) === group).map((command) => command.payload)).pendingAdjustment;
    return { outMinor: totals.expense_minor, inMinor: totals.income_minor, outText: formatMinor(totals.expense_minor, locale), inText: formatMinor(totals.income_minor, locale) };
  };
  return pendingMoneyLines(pair('waiting'), pair('checking'), tc);
}

function syncFacts(diary: DiaryView | null): SyncFacts {
  return { phase: diary?.phase ?? 'none', lockReason: diary?.lockReason ?? null, drafts: countDrafts(diary?.outbox ?? []) };
}

/** Drafts are shown only from an open diary (as the current Home's device drafts are). */
const visibleDrafts = (diary: DiaryView | null): OutboxCommand[] => (diary?.phase === 'ready' ? diary.outbox : []);

type DaysOptions = { earlierDays?: number; oldestWholeDay?: string | null; todayComplete?: boolean };

function days(records: readonly TransactionDto[], drafts: readonly OutboxCommand[], context: DayContext, options: DaysOptions) {
  // A draft dated before the oldest whole day would bring back a day whose confirmed records were cut.
  const cutFrom = options.oldestWholeDay;
  const onWholeDays = cutFrom ? drafts.filter((command) => command.payload.occurred_on >= cutFrom) : drafts;
  const rows = mergeRows(records, onWholeDays, context);
  const today = dayOf(context.today, rows, context, options.todayComplete === false);
  const earlier = groupDays(rows.filter((row) => row.occurredOn < context.today), context);
  return { today, earlier: options.earlierDays === undefined ? earlier : earlier.slice(0, options.earlierDays) };
}

/** Every open draft as a row, newest first, whatever its date. */
const openDraftRows = (drafts: readonly OutboxCommand[], context: RowContext): DiaryRow[] => mergeRows([], drafts, context);

const lookupsOf = (wallets: readonly { id: string; name: string }[], categories: readonly CategoryDto[]): Lookups => ({
  wallets: new Map(wallets.map((wallet) => [wallet.id, wallet])),
  categories: new Map(categories.map((category) => [category.id, category])),
});

export function homeModel(input: HomeInput): HomeModel {
  const { today, tc, locale, load, diary } = input;
  const month = monthOf(today);
  const dateTag = input.dateTag ?? dateTagFor(locale);
  const sync = syncFacts(diary);
  if (load.state === 'loading') return { kind: 'loading', label: tc('Loading your diary') };

  if (load.state === 'error') {
    const problem = classifyLoadProblem(load.error, tc);
    if (!diary) return { kind: 'problem', problem, offline: null, sync };
    // Offline: what the device holds is still here, and new entries are saved on it.
    const context: DayContext = { lookups: lookupsOf(diary.wallets, diary.categories), tc, locale, today, dateTag };
    const drafts = visibleDrafts(diary);
    const grouped = days([], drafts, context, { earlierDays: input.earlierDays });
    return {
      kind: 'problem', problem, sync,
      offline: {
        ...grouped, waitingMoney: waitingMoneyLines(diary.outbox, month, tc, locale), canAdd: diary.phase === 'ready' && diary.wallets.length > 0,
        openDrafts: openDraftRows(drafts, context),
      },
    };
  }

  const { wallets, categories, summary, budget, records } = load.data;
  if (wallets.length === 0) {
    return {
      kind: 'first_run', reason: 'no_wallet', sync,
      headline: tc('Add your first wallet'),
      body: tc('A wallet is where money sits, like cash or a bank account. Its opening balance is not income.'),
    };
  }

  const context: DayContext = { lookups: lookupsOf(wallets, categories), tc, locale, today, dateTag };
  // A draft whose record is among the loaded ones is confirmed money already (the summary has it).
  const confirmedIds = new Set(records.map((record) => record.id));
  const pace = budgetPace({ budget, summary, today, outbox: diary?.outbox ?? [], confirmedIds });
  const copy = paceCopy(pace, locale);
  const line = (value: typeof copy.total | null) => (value ? say(tc, value) : null);
  const drafts = visibleDrafts(diary);
  const grouped = days(records, drafts, context, { earlierDays: input.earlierDays, oldestWholeDay: load.data.oldestWholeDay, todayComplete: load.data.todayComplete });
  return {
    kind: 'ready',
    month,
    budget: {
      pace, copy, total: say(tc, copy.total), headline: say(tc, copy.headline), pendingNote: line(copy.pendingNote), checkingNote: line(copy.checkingNote),
      reassurance: line(copy.reassurance), setBudget: line(copy.setBudget),
    },
    balance: {
      totalText: formatMinor(walletsTotal(wallets), locale),
      wallets: wallets.map((wallet) => ({ id: wallet.id, name: wallet.name, balanceText: formatMinor(wallet.balance_minor, locale), archived: wallet.archived })),
    },
    today: grouped.today,
    todayEmptyText: grouped.today.rows.length === 0 ? tc('Nothing logged today yet') : null,
    earlier: grouped.earlier,
    waitingMoney: waitingMoneyLines(diary?.outbox ?? [], month, tc, locale, confirmedIds),
    openDrafts: openDraftRows(drafts, context),
    sync,
  };
}
