// Data loading and sharing for the month recap (insights redesign R5, moved in P2-T32).
import { HISTORY_MAX_LIMIT } from '@gogospend/contracts';
import type { TransactionDto } from '@gogospend/contracts';
import { trackRecapOpened, trackRecapShared } from '@mobile/analytics/events';
import type { MonthDays, RecapData, RecapLoad } from '@mobile/spend/v1/redesign/insights/recapModel';
import { compareWindow, monthPhase, readMonthDays } from '@mobile/spend/v1/redesign/insights/recapModel';
import { useSpendV1 } from '@mobile/spend/v1/SpendV1Context';
import { monthRange, todayInBangkok } from '@mobile/spend/v1/viewModels';
import { Share } from 'react-native';
import { useLoad } from '../../v1/parts';

const NOTHING_READ: MonthDays = { days: [], complete: true };

export type RecapDataWithRecords = RecapData & {
  records: readonly TransactionDto[];
};

export type RecapLoadWithRecords =
  | { state: 'loading' }
  | { state: 'ready'; data: RecapDataWithRecords }
  | { state: 'error'; error: unknown };

/**
 * Loads the recap's month totals, categories, days logged and compare bars.
 * Keeps the records read during history paging for wallet recap's biggest day.
 * Calls `trackRecapOpened()` once when it first shows a month (R61).
 */
export function useRecapData(month: string, now?: Date): RecapLoadWithRecords & { reload: () => void; refresh: () => void } {
  const resources = useSpendV1();
  const today = todayInBangkok(now ?? new Date());

  const loaded = useLoad<RecapDataWithRecords>(async () => {
    const months = compareWindow(month, today);
    // A month that has not started has nothing to read.
    const started = monthPhase(month, today) !== 'future';
    const monthRecords: TransactionDto[] = [];
    const historyReader = async (cursor: string | undefined) => {
      const page = await resources.history({ ...monthRange(month), sort: 'date_desc' }, cursor, HISTORY_MAX_LIMIT);
      monthRecords.push(...page.items);
      return page;
    };

    const [summary, categories, days, others] = await Promise.all([
      started ? resources.summary(month) : null,
      resources.categories(),
      started ? readMonthDays(month, historyReader) : NOTHING_READ,
      // The month shown shares its own summary with its bar.
      Promise.all(months.filter((other) => other !== month).map(async (other) => [other, (await resources.summary(other)).expense_minor] as const)),
    ]);
    const spentIn = new Map(others);
    trackRecapOpened();
    return {
      summary,
      categories,
      days,
      records: monthRecords,
      compare: months.map((shown) => ({ month: shown, expenseMinor: shown === month && summary ? summary.expense_minor : spentIn.get(shown) ?? '0' })),
    };
  }, [resources, month, today]);

  return loaded;
}

/**
 * Shares text through the system share sheet, rejecting when the sheet cannot open.
 * Tracks `recap_shared` after the share sheet resolves (R61).
 */
export async function shareText(message: string): Promise<void> {
  await Share.share({ message });
  trackRecapShared();
}
