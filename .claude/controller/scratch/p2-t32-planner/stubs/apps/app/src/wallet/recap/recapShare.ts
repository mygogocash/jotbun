import type { Minor } from '@gogospend/contracts';
import type { WalletT } from '../copy/draftText.ts';

export type RecapShareInput = {
  monthLabel: string;
  daysLogged: string;
  spentMinor: Minor;
  budgetMinor: Minor | null;
  top: readonly { name: string; minor: Minor }[];
};

export function recapShareText(input: RecapShareInput, hidden: boolean, t: WalletT): string {
  return '';
}
