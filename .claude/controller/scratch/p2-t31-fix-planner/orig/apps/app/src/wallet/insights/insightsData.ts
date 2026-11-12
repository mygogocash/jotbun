// Insights data hook and types (P2-T31).
import { HISTORY_MAX_LIMIT } from '@gogospend/contracts';
import type { CategoryDto, MonthSummary, TransactionDto } from '@gogospend/contracts';
import { useCallback, useEffect, useRef } from 'react';

import { useCopy } from '@mobile/i18n/useCopy';
import { useLoad } from '@mobile/screens/v1/parts';
import { readAllPages } from '@mobile/spend/v1/redesign/insights/insightsModel';
import type { RecapProblem } from '@mobile/spend/v1/redesign/insights/recapModel';
import { compareWindow, monthPhase, recapProblem } from '@mobile/spend/v1/redesign/insights/recapModel';
import { useDiaryView, useSpendDiary } from '@mobile/spend/v1/SpendDiaryContext';
import { useSpendV1 } from '@mobile/spend/v1/SpendV1Context';
import { monthRange } from '@mobile/spend/v1/viewModels';
import type { OutboxCommand } from '@mobile/storage/types';

export type InsightsTab = 'spending' | 'in_out' | 'calendar';

export type InsightsData = {
  month: string;
  today: string;
  summary: MonthSummary | null;
  categories: readonly CategoryDto[];
  records: readonly TransactionDto[];
  drafts: readonly OutboxCommand[];
  compare: readonly MonthSummary[];
  refreshSuggested: boolean;
};

export type InsightsLoad =
  | { state: 'loading'; reload?: () => void; refresh?: () => void }
  | { state: 'ready'; data: InsightsData; reload: () => void; refresh: () => void }
  | { state: 'error'; error: unknown; problem: RecapProblem; reload: () => void; refresh: () => void };

const NO_DRAFTS: readonly OutboxCommand[] = [];

function useRefreshOnResolve(outbox: readonly OutboxCommand[], refresh: () => void): void {
  const open = useRef(new Set<string>());
  useEffect(() => {
    const now = new Set(outbox.filter((c) => c.state !== 'acknowledged').map((c) => c.commandId));
    const resolved = [...open.current].some((id) => !now.has(id));
    open.current = now;
    if (resolved) refresh();
  }, [outbox, refresh]);
}

/**
 * Loads the month's summary, categories, all history pages for the month,
 * drafts from the local outbox, and the 6 compare months' summaries.
 * Errors are reported in recapProblem's words.
 */
export function useInsightsData(month: string, today: string): InsightsLoad {
  const resources = useSpendV1();
  const tc = useCopy();
  const diary = useSpendDiary();
  const diaryView = useDiaryView();

  const loaded = useLoad<InsightsData>(async () => {
    const months = compareWindow(month, today);
    const started = monthPhase(month, today) !== 'future';

    const [summary, categories, historyResult, compareList] = await Promise.all([
      started ? resources.summary(month) : Promise.resolve(null),
      resources.categories(),
      started
        ? readAllPages((cursor) => resources.history({ ...monthRange(month), sort: 'date_desc' }, cursor, HISTORY_MAX_LIMIT))
        : Promise.resolve({ records: [], summary: { expense_minor: '0', income_minor: '0', count: 0 }, refreshSuggested: false }),
      Promise.all(
        months.map(async (m) => {
          try {
            return await resources.summary(m);
          } catch {
            return {
              month: m,
              expense_minor: '0',
              income_minor: '0',
              categories: [],
              budget: null,
            } as unknown as MonthSummary;
          }
        }),
      ),
    ]);

    const drafts = diary && diaryView.phase === 'ready' ? diaryView.outbox : NO_DRAFTS;

    return {
      month,
      today,
      summary,
      categories,
      records: historyResult.records,
      drafts,
      compare: compareList,
      refreshSuggested: historyResult.refreshSuggested,
    };
  }, [resources, month, today, diary, diaryView.phase, diaryView.outbox]);

  useRefreshOnResolve(diary && diaryView.phase === 'ready' ? diaryView.outbox : NO_DRAFTS, loaded.refresh);

  if (loaded.state === 'loading') {
    return { state: 'loading', reload: loaded.reload, refresh: loaded.refresh };
  }
  if (loaded.state === 'error') {
    return {
      state: 'error',
      error: loaded.error,
      problem: recapProblem(loaded.error, tc),
      reload: loaded.reload,
      refresh: loaded.refresh,
    };
  }
  return {
    state: 'ready',
    data: loaded.data,
    reload: loaded.reload,
    refresh: loaded.refresh,
  };
}
