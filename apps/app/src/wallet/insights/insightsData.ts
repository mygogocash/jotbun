// Insights' data (P2-T31): one load of the month and its six compare months,
// keyed by the month and today only, so the diary's sync never reloads it.
//
// - One load reads the month's summary, the categories, the wallets, every
//   page of the month's history (`readAllPages`, never an early stop) and the
//   other compare months' summaries. The month shown shares its own summary
//   with its bar, as the recap does. A compare month that cannot be read fails
//   the load, so no bar is drawn or said as ฿0 for a month that was not read.
// - Drafts on this phone are read at render time, from the diary's view, so a
//   draft saved meanwhile shows at once (dayFacts keeps their money apart).
//   When a draft the screen was showing resolves, the load runs again quietly,
//   in place: the screen never blanks, and the chosen day and an open tray
//   stay. A new outbox with the same drafts (every sync run) reads nothing.
// - Data read for another month is never shown as this one's: a month step
//   renders once before its load starts.
// - Problems are recapProblem's words. Offline is said only where entries are
//   kept on this phone (InsightsScreen's rule).
import { HISTORY_MAX_LIMIT } from '@gogospend/contracts';
import type { CategoryDto, EntryDto, Minor, MonthSummary, TransactionDto, WalletDto } from '@gogospend/contracts';
import { useEffect, useRef } from 'react';

import { V1Error } from '@mobile/api/client';
import { useCopy } from '@mobile/i18n/useCopy';
import { useLoad } from '@mobile/screens/v1/parts';
import { readAllPages } from '@mobile/spend/v1/redesign/insights/insightsModel';
import { compareWindow, recapProblem } from '@mobile/spend/v1/redesign/insights/recapModel';
import type { RecapProblem } from '@mobile/spend/v1/redesign/insights/recapModel';
import { useDiaryView, useSpendDiary } from '@mobile/spend/v1/SpendDiaryContext';
import { useSpendV1 } from '@mobile/spend/v1/SpendV1Context';
import { monthRange } from '@mobile/spend/v1/viewModels';
import type { OutboxCommand } from '@mobile/storage/types';

/** 1D-T1's tab values (R61). */
export type InsightsTab = 'spending' | 'in_out' | 'calendar';

/** One compare month's money in and out, from its summary. */
export type CompareMonth = { month: string; incomeMinor: Minor; expenseMinor: Minor };

export type InsightsData = {
  month: string;
  today: string;
  /** The month's totals: money in and out, the budget, each category's money. */
  summary: MonthSummary;
  categories: readonly CategoryDto[];
  wallets: readonly WalletDto[];
  /** Every confirmed record of the month, from every page. */
  records: readonly TransactionDto[];
  /** The six compare months, oldest first (`compareWindow`). */
  compare: readonly CompareMonth[];
  /** A later page said the diary changed after the first was read. */
  refreshSuggested: boolean;
};

export type InsightsLoad =
  | { state: 'loading' }
  | { state: 'ready'; data: InsightsData; drafts: readonly OutboxCommand[]; refresh: () => void }
  | { state: 'error'; problem: RecapProblem; offline: boolean; reload: () => void };

const NO_DRAFTS: readonly OutboxCommand[] = [];

/** A live expense: the records a category's count and a chosen day's list hold (a deleted record counts nowhere). */
export function isMoneyOut(record: TransactionDto): record is EntryDto {
  return record.deleted_at === null && record.type === 'expense';
}

/** A category that is no longer listed: its tile is an initial on `raised`, and its name `tc('Category')`. */
export function unknownCategory(id: string): Pick<CategoryDto, 'id' | 'builtin_key' | 'color' | 'label' | 'type'> {
  return { id, builtin_key: null, color: null, label: null, type: 'expense' };
}

/** Refreshes in place whenever a draft the screen was showing resolves (sent, discarded or undone). */
function useRefreshOnResolve(outbox: readonly OutboxCommand[], refresh: () => void): void {
  const open = useRef(new Set<string>());
  useEffect(() => {
    const now = new Set(outbox.filter((command) => command.state !== 'acknowledged').map((command) => command.commandId));
    const resolved = [...open.current].some((id) => !now.has(id));
    open.current = now;
    if (resolved) refresh();
  }, [outbox, refresh]);
}

export function useInsightsData(month: string, today: string): InsightsLoad {
  const resources = useSpendV1();
  const tc = useCopy();
  const diary = useSpendDiary();
  const diaryView = useDiaryView();

  const loaded = useLoad<InsightsData>(async () => {
    const months = compareWindow(month, today);
    const others = months.filter((other) => other !== month);
    const [summary, categories, wallets, read, otherSummaries] = await Promise.all([
      resources.summary(month),
      resources.categories(),
      resources.wallets(),
      readAllPages((cursor) => resources.history({ ...monthRange(month), sort: 'date_desc' }, cursor, HISTORY_MAX_LIMIT)),
      Promise.all(others.map((other) => resources.summary(other))),
    ]);
    const summaryOf = new Map(others.map((other, index) => [other, otherSummaries[index]]));
    const compare = months.map((shown): CompareMonth => {
      // The month shown shares its own summary with its bar.
      const totals = shown === month ? summary : summaryOf.get(shown)!;
      return { month: shown, incomeMinor: totals.income_minor, expenseMinor: totals.expense_minor };
    });
    return { month, today, summary, categories, wallets, records: read.records, compare, refreshSuggested: read.refreshSuggested };
  }, [resources, month, today]);

  const diaryOpen = diary !== null && diaryView.phase === 'ready';
  const drafts = diaryOpen ? diaryView.outbox : NO_DRAFTS;
  useRefreshOnResolve(drafts, loaded.refresh);

  if (loaded.state === 'error') {
    const unreachable = loaded.error instanceof V1Error && loaded.error.outcome === 'network';
    return { state: 'error', problem: recapProblem(loaded.error, tc), offline: unreachable && diaryOpen, reload: loaded.reload };
  }
  // A month step renders once before its load starts: the month before's data is never handed over as this one's.
  if (loaded.state === 'ready' && loaded.data.month === month) {
    return { state: 'ready', data: loaded.data, drafts, refresh: loaded.refresh };
  }
  return { state: 'loading' };
}
