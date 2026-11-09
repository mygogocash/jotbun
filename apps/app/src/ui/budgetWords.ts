// The words for a month's budget pace (redesign R2b), shared by BudgetBar and
// PaceRing. The numbers come in already worked out (another module computes
// spent, left, per day and the state); this only says them. State is always
// spelled out, so red and green are never the only signal (WCAG 1.4.1), and
// going over is stated kindly and plainly: no scolding, no advice. A finished
// month (`phase: 'after'`) reads as its result, "฿X under budget" or
// "฿X over", never as a pace.
import type { Minor } from '@gogospend/contracts';

import { formatMinor } from '../spend/v1/money.ts';
import type { MoneyLocale } from '../spend/v1/money.ts';

export type BudgetState = 'on_track' | 'tight' | 'over' | 'no_budget';
/** Where today sits relative to the budget's month, as the budget logic says. */
export type BudgetPhase = 'before' | 'during' | 'after';

/** The presentational inputs of BudgetBar and PaceRing. Amounts are canonical satang. */
export type BudgetPace = {
  readonly state: BudgetState;
  readonly spentMinor: Minor;
  /** Null when there is no budget. */
  readonly limitMinor: Minor | null;
  /** Limit minus spent; negative when over. Null when there is no budget. */
  readonly leftMinor: Minor | null;
  /** What can be spent each remaining day; null when it does not apply. */
  readonly perDayMinor: Minor | null;
  /** Days left in the month, counting today. */
  readonly daysLeft: number;
  /**
   * `after`: the month has ended, so it reads as a plain result ("฿X under
   * budget", "฿X over") with no pace words. Left out, or `before`/`during`,
   * the month reads as a pace.
   */
  readonly phase?: BudgetPhase;
};

export type BudgetWords = {
  /** The one number a ring centres on, and the word under it. */
  readonly figure: string;
  readonly figureWord: string;
  /** "9 days to go", "Last day", or null once the month is over. */
  readonly days: string | null;
  readonly headline: string;
  readonly detail: string;
  /** Headline and detail as one sentence for screen readers. */
  readonly spoken: string;
  /** Spent as a share of the limit, 0–1000, capped at the limit; null without a budget. */
  readonly spentPermille: number | null;
  /** The only colour the state may use: `under`, `over`, or none. */
  readonly tone: 'under' | 'over' | 'none';
};

export type Translate = (english: string, values?: Readonly<Record<string, string | number>>) => string;

const SEPARATOR = ' · ';

export function budgetWords(pace: BudgetPace, tc: Translate, locale: MoneyLocale): BudgetWords {
  const money = (minor: bigint) => formatMinor(minor.toString(), locale);
  const spent = BigInt(pace.spentMinor);
  const limit = pace.limitMinor === null ? null : BigInt(pace.limitMinor);
  const ended = pace.phase === 'after';
  const days = ended ? null : pace.daysLeft >= 2 ? tc('{days} days to go', { days: pace.daysLeft }) : pace.daysLeft === 1 ? tc('Last day') : null;
  const join = (...pieces: (string | null)[]) => pieces.filter((piece): piece is string => piece !== null && piece !== '').join(SEPARATOR);
  const finish = (words: Omit<BudgetWords, 'spoken' | 'days'>): BudgetWords => ({
    ...words,
    days,
    spoken: `${words.headline}${SEPARATOR}${words.detail}`.split(SEPARATOR).join(', '),
  });

  if (pace.state === 'no_budget' || limit === null) {
    return finish({
      figure: money(spent),
      figureWord: tc('spent'),
      headline: tc('No budget this month'),
      detail: tc('{amount} spent so far', { amount: money(spent) }),
      spentPermille: null,
      tone: 'none',
    });
  }

  const left = pace.leftMinor === null ? limit - spent : BigInt(pace.leftMinor);
  const share = limit === 0n ? 1000n : (spent < 0n ? 0n : (spent * 1000n) / limit);
  const spentPermille = Number(share > 1000n ? 1000n : share);

  if (pace.state === 'over') {
    const overBy = left < 0n ? -left : spent > limit ? spent - limit : 0n;
    return finish({
      figure: money(overBy),
      figureWord: tc('over'),
      headline: join(tc('{amount} over', { amount: money(overBy) }), days),
      detail: tc('It happens. {spent} of {limit} spent.', { spent: money(spent), limit: money(limit) }),
      spentPermille,
      tone: 'over',
    });
  }

  if (ended) {
    // A finished month is a result, not a pace: no "On track", no days, no per day.
    const result = { spent: money(spent), limit: money(limit) };
    return finish({
      figure: money(left),
      figureWord: tc('under budget'),
      headline: left === 0n ? tc('Right on budget') : tc('{amount} under budget', { amount: money(left) }),
      detail: tc('{spent} of {limit}', result),
      spentPermille,
      tone: 'under',
    });
  }

  const status = pace.state === 'tight' ? tc('Tight') : tc('On track');
  if (pace.perDayMinor !== null) {
    const perDay = money(BigInt(pace.perDayMinor));
    return finish({
      figure: perDay,
      figureWord: tc('a day left'),
      headline: tc('{amount} a day left', { amount: perDay }),
      detail: join(status, tc('{amount} left', { amount: money(left) }), days),
      spentPermille,
      tone: 'under',
    });
  }
  return finish({
    figure: money(left),
    figureWord: tc('left'),
    headline: tc('{amount} left', { amount: money(left) }),
    detail: join(status, days),
    spentPermille,
    tone: 'under',
  });
}
