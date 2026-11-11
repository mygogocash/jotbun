// The words on the Bun Wallet Home's budget card (P2-T23; bw-home, bw-private,
// ax-voiceover, rh-offline; C4, W9, W10). `headline` is the month's spending,
// the card's 28 pt figure; `side` is the line beside it; `spoken` is what the
// card says to a screen reader. On track the line is the per-day hint (left
// ÷ days left, today included, whole baht rounded down) in the under colour;
// tight, the same words in ink; over, how far over in the over colour. With
// no budget there is no line (the screen offers to set one). Private mode
// keeps the line's place and colour with ตามแผน or เกินงบ and no amount, and
// the card says the amount is hidden (W10). Every figure is budgetPace's: the
// spending is its estimate (money confirmed plus money waiting on this phone),
// the one the hint is worked out from. Pure: a Node test reads it.
import type { Minor } from '@gogospend/contracts';

import type { BudgetPace } from '../../spend/v1/redesign/budgetPace.ts';
import type { WalletT } from '../copy/draftText.ts';
import { HIDDEN_AMOUNT, perDayText, spokenMoney, walletMoneyText } from '../money/walletMoney.ts';

export type BudgetCardTone = 'under' | 'over' | 'ink';

export type BudgetCardWords = {
  /** The month's spending: ฿12,480, or ฿•••• in private mode. */
  headline: string;
  /** The line beside it; null with no budget. */
  side: { text: string; tone: BudgetCardTone } | null;
  /** What a screen reader says for the card: ใช้ไปเดือนนี้ 12,480 บาท จากงบ 18,000 บาท, เหลือวันละ 690 บาท. */
  spoken: string;
};

type SideLine = { text: string; spoken: string; tone: BudgetCardTone };

/** The per-day figure in whole baht, rounded down, as perDayText shows it (W9). */
const wholeBaht = (minor: Minor): Minor => ((BigInt(minor) / 100n) * 100n).toString();

/** The line beside the figure, as shown and as said; null with no budget. */
function sideLine(pace: BudgetPace, hidden: boolean, t: WalletT): SideLine | null {
  // No budget: budgetPace gives no figure for how far over.
  if (pace.overByMinor === null) return null;
  if (pace.state === 'over') {
    if (hidden) return { text: t('home.overWord'), spoken: t('home.overWord'), tone: 'over' };
    const over = pace.overByMinor;
    return { text: t('home.over', { amount: walletMoneyText(over) }), spoken: t('home.over', { amount: spokenMoney(over, t) }), tone: 'over' };
  }
  const tone = pace.state === 'tight' ? 'ink' : 'under';
  const perDay = pace.perDayMinor;
  // After the month there is no per-day figure (budgetPace); Home always shows today's month.
  if (hidden || perDay === null) return { text: t('home.onTrack'), spoken: t('home.onTrack'), tone };
  return { text: t('home.perDay', { amount: perDayText(perDay) }), spoken: t('home.perDay', { amount: spokenMoney(wholeBaht(perDay), t) }), tone };
}

/** The card's words. `t` reads COMMON_COPY and the Home's COPY. */
export function budgetCardWords(pace: BudgetPace, hidden: boolean, t: WalletT): BudgetCardWords {
  const spent = pace.spent.estimatedMinor;
  const line = sideLine(pace, hidden, t);
  const total = hidden
    ? t('home.spokenSpent', { amount: t('common.amountHidden') })
    : pace.limitMinor === null
      ? t('home.spokenSpent', { amount: spokenMoney(spent, t) })
      : t('home.spokenBudget', { spent: spokenMoney(spent, t), limit: spokenMoney(pace.limitMinor, t) });
  return {
    headline: hidden ? HIDDEN_AMOUNT : walletMoneyText(spent),
    side: line === null ? null : { text: line.text, tone: line.tone },
    spoken: line === null ? total : `${total}, ${line.spoken}`,
  };
}
