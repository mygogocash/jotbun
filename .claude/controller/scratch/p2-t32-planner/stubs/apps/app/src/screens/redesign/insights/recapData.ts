import type { TransactionDto } from '@gogospend/contracts';
import type { RecapData } from '@mobile/spend/v1/redesign/insights/recapModel';

export type RecapDataWithRecords = RecapData & {
  records: readonly TransactionDto[];
};

export type RecapLoadWithRecords =
  | { state: 'loading' }
  | { state: 'ready'; data: RecapDataWithRecords }
  | { state: 'error'; error: unknown };

export function useRecapData(month: string, now?: Date): RecapLoadWithRecords & { reload: () => void; refresh: () => void } {
  return {
    state: 'loading',
    reload: () => {},
    refresh: () => {},
  };
}

export async function shareText(message: string): Promise<void> {}
