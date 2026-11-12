// RED stub (P2-T15): the plan's interface, with no behaviour yet.
import type { CategoryDto, Minor, WalletSnapshot } from '@gogospend/contracts';

import type { Ranking } from '@mobile/screens/redesign/entry/entryHelpers';
import type { AddStep, StepProps } from './addFlow';

type Back = { back?: AddStep };

export function isPickStep(_step: AddStep): boolean {
  return false;
}

export function CategoryPick(_props: StepProps & Back & { categories: readonly CategoryDto[]; ranking: Ranking }) {
  return null;
}

export function WalletPick(_props: StepProps & Back & { wallets: readonly WalletSnapshot[]; balances: ReadonlyMap<string, Minor> | null; role: 'wallet' | 'from' | 'to' }) {
  return null;
}

export function DatePick(_props: StepProps & Back & { today: string; earliest?: string }) {
  return null;
}

export function NotePick(_props: StepProps & Back) {
  return null;
}
