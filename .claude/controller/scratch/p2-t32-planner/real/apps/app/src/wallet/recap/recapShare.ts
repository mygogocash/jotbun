import type { Minor } from '@gogospend/contracts';
import type { WalletT } from '../copy/draftText.ts';
import { walletMoneyText } from '../money/walletMoney.ts';

export type RecapShareInput = {
  monthLabel: string;
  daysLogged: string;
  spentMinor: Minor;
  budgetMinor: Minor | null;
  top: readonly { name: string; minor: Minor }[];
};

/**
 * Builds the plain text recap to share.
 * When hidden is true (private mode on, D41, Review Focus 2), strictly omits all
 * amounts and currency symbols (฿), naming only the month, days logged, and
 * category names.
 */
export function recapShareText(input: RecapShareInput, hidden: boolean, t: WalletT): string {
  const lines: string[] = [t('recap.title', { month: input.monthLabel }), input.daysLogged];

  if (!hidden) {
    lines.push(`${t('recap.spentLabel')}: ${walletMoneyText(input.spentMinor)}`);
    if (input.budgetMinor !== null) {
      const spent = BigInt(input.spentMinor);
      const budget = BigInt(input.budgetMinor);
      if (spent > budget) {
        const over = String(spent - budget) as Minor;
        lines.push(`${t('recap.budget')}: ${walletMoneyText(input.budgetMinor)} (${t('recap.over')} ${walletMoneyText(over)})`);
      } else {
        const left = String(budget - spent) as Minor;
        lines.push(`${t('recap.budget')}: ${walletMoneyText(input.budgetMinor)} (${t('recap.under')} ${walletMoneyText(left)})`);
      }
    }
  }

  if (input.top.length > 0) {
    lines.push(t('recap.topCategories'));
    for (const cat of input.top) {
      if (hidden) {
        lines.push(`• ${cat.name}`);
      } else {
        lines.push(`• ${cat.name}: ${walletMoneyText(cat.minor)}`);
      }
    }
  }

  return lines.join('\n');
}
