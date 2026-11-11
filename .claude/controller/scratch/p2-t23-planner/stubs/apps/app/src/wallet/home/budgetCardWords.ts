// RED stub (P2-T23): the real types, with no words.
import type { BudgetPace } from '../../spend/v1/redesign/budgetPace.ts';
import type { WalletT } from '../copy/draftText.ts';

export type BudgetCardTone = 'under' | 'over' | 'ink';

export type BudgetCardWords = {
  headline: string;
  side: { text: string; tone: BudgetCardTone } | null;
  spoken: string;
};

export function budgetCardWords(_pace: BudgetPace, _hidden: boolean, _t: WalletT): BudgetCardWords {
  return { headline: '', side: null, spoken: '' };
}
