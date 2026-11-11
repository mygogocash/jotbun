// RED stub (P2-T23): the real exports and types, with wrong answers. The load
// never finishes, the controls do nothing, and the threshold haptic never
// plays. HomeScreen.tsx is not changed at RED, so Home's suite passes.
import type { TransactionDto } from '@gogospend/contracts';

import type { HomeLoad } from '@mobile/spend/v1/redesign/homeModel';
import type { SpendV1Resources } from '@mobile/spend/v1/resources';

export function readToday(_resources: SpendV1Resources, _day: string): Promise<{ records: TransactionDto[]; complete: boolean }> {
  return Promise.resolve({ records: [], complete: true });
}

export function useHomeData(_today: string): HomeLoad & { reload(): void; refresh(): void } {
  return { state: 'loading', reload: () => undefined, refresh: () => undefined };
}

export function useBudgetThresholdHaptic(_month: string, _spentMinor: string | null, _limitMinor: string | null): void {
  // Plays nothing.
}
