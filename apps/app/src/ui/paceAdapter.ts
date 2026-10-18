// The bridge from the budget logic to the kit (redesign R2 unification).
//
// `budgetPace()` (src/spend/v1/redesign/budgetPace.ts) works the month out in
// full: phase, days gone, the spent breakdown, how far over, per category.
// BudgetBar and PaceRing take the kit's smaller, presentational `BudgetPace`
// (./budgetWords.ts). `toKitPace` maps one onto the other by picking fields
// (its one change is the sign of the over amount), so the bar and the ring
// always say what the logic decided.
//
// Mapping rules:
// - **State:** the same four words (`on_track`, `tight`, `over`, `no_budget`).
// - **Spent:** the logic's estimate, `spent.estimatedMinor`: confirmed
//   spending plus expense drafts still waiting to sync. Drafts being checked
//   with Jotbun are not added (the server may count them already), and drafts
//   that need a look never count. The same figure decides the state, left and
//   per day, so the words always agree with the colour. Screens show
//   `paceCopy().pendingNote` and `checkingNote` beside the bar to say so.
// - **Limit:** the month's limit, or null without a budget.
// - **Left:** the logic's `leftMinor` while not over. When over, it is minus
//   `overByMinor`: the logic's own over amount is what the kit says ("฿0.01
//   over"), even if a left figure ever reads zero. Null without a budget.
// - **Per day:** the logic's `perDayMinor`, rounded down to the satang; '0' at
//   exactly zero left; null when over, after the month or without a budget.
// - **Days left:** the logic's `daysLeft`, today included.
// - **Phases:** the kit has none, so the phase shows only through the days.
//   `during` maps as above, and the last day reads "Last day". `before` (a
//   month not started yet) has the whole month left, so it reads like its
//   first day: "฿X a day left", "N days to go". `after` (a month that has
//   ended) has no days left and no per day, so the kit says "฿X left" or
//   "฿X over" with no days line. The logic never calls a finished month
//   tight.
import type { BudgetPace as LogicPace } from '../spend/v1/redesign/budgetPace.ts';
import type { BudgetPace as KitPace } from './budgetWords.ts';

export type { KitPace, LogicPace };

/** The kit's BudgetBar and PaceRing props for a month the logic has worked out. */
export function toKitPace(pace: LogicPace): KitPace {
  return {
    state: pace.state,
    spentMinor: pace.spent.estimatedMinor,
    limitMinor: pace.limitMinor,
    leftMinor: kitLeft(pace),
    perDayMinor: pace.perDayMinor,
    daysLeft: pace.daysLeft,
  };
}

function kitLeft(pace: LogicPace): string | null {
  if (pace.limitMinor === null || pace.leftMinor === null) return null;
  if (pace.state !== 'over') return pace.leftMinor;
  const over = BigInt(pace.overByMinor ?? '0');
  return over > 0n ? (-over).toString() : pace.leftMinor;
}
