// The month recap's load and share (insights redesign R5, moved out of
// RecapScreen.tsx in P2-T32): the Bun diary recap and the Bun Wallet recap
// read the same month the same way.
import { HISTORY_MAX_LIMIT } from '@gogospend/contracts';
import type { TransactionDto } from '@gogospend/contracts';
import { trackRecapOpened, trackRecapShared } from '@mobile/analytics/events';
import { readAllPages } from '@mobile/spend/v1/redesign/insights/insightsModel';
import type { MonthDays, RecapData } from '@mobile/spend/v1/redesign/insights/recapModel';
import { compareWindow, monthPhase, readMonthDays } from '@mobile/spend/v1/redesign/insights/recapModel';
import { useSpendV1 } from '@mobile/spend/v1/SpendV1Context';
import { monthRange, todayInBangkok } from '@mobile/spend/v1/viewModels';
import { Share } from 'react-native';
import { useLoad } from '../../v1/parts';

const NOTHING_READ: MonthDays = { days: [], complete: true };
const NO_RECORDS: readonly TransactionDto[] = [];

/** The recap's data, with the month's records when the caller asks for them (none otherwise). */
export type RecapDataWithRecords = RecapData & {
  records: readonly TransactionDto[];
};

export type RecapLoadWithRecords =
  | { state: 'loading' }
  | { state: 'ready'; data: RecapDataWithRecords }
  | { state: 'error'; error: unknown };

/**
 * Loads the recap's month totals, categories, days logged and compare bars.
 * With `withRecords`, it also reads every history page of the month for its
 * records (the wallet recap's biggest day and cashback count): the days read
 * stops once every day is seen, so its pages can leave records out.
 * Calls `trackRecapOpened()` once the month is read (R61).
 */
export function useRecapData(month: string, now?: Date, options: { withRecords?: boolean } = {}): RecapLoadWithRecords & { reload: () => void; refresh: () => void } {
  const resources = useSpendV1();
  const today = todayInBangkok(now ?? new Date());
  const withRecords = options.withRecords === true;

  return useLoad<RecapDataWithRecords>(async () => {
    const months = compareWindow(month, today);
    // A month that has not started has nothing to read.
    const started = monthPhase(month, today) !== 'future';
    const page = (cursor: string | undefined) => resources.history({ ...monthRange(month), sort: 'date_desc' }, cursor, HISTORY_MAX_LIMIT);
    const [summary, categories, days, others, records] = await Promise.all([
      started ? resources.summary(month) : null,
      resources.categories(),
      started ? readMonthDays(month, page) : NOTHING_READ,
      // The month shown shares its own summary with its bar.
      Promise.all(months.filter((other) => other !== month).map(async (other) => [other, (await resources.summary(other)).expense_minor] as const)),
      started && withRecords ? readAllPages(page).then((read) => read.records) : NO_RECORDS,
    ]);
    const spentIn = new Map(others);
    trackRecapOpened();
    return {
      summary,
      categories,
      days,
      records,
      compare: months.map((shown) => ({ month: shown, expenseMinor: shown === month && summary ? summary.expense_minor : spentIn.get(shown) ?? '0' })),
    };
  }, [resources, month, today, withRecords]);
}

/**
 * Shares text through the system share sheet, rejecting when the sheet cannot open.
 * Tracks `recap_shared` after the share sheet resolves (R61).
 */
export async function shareText(message: string): Promise<void> {
  await Share.share({ message });
  trackRecapShared();
}
