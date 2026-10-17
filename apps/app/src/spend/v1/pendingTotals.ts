import type { Minor, Totals } from '@gogospend/contracts';

import type { PendingEntry } from '../../storage/types.ts';

export type DisplayedTotals = { confirmed: Totals; pendingAdjustment: Totals; estimated: Totals };

function add(by: Map<string, bigint>, wallet: string, amount: bigint): void {
  by.set(wallet, (by.get(wallet) ?? 0n) + amount);
}

const asMinor = (by: Map<string, bigint>): Record<string, Minor> => Object.fromEntries([...by].map(([wallet, amount]) => [wallet, amount.toString()]));

/**
 * Confirmed totals stay exactly what the server confirmed. Drafts waiting on
 * the device form a separate adjustment (income adds, expenses subtract, a
 * transfer moves money between wallets), and the estimate is their exact sum
 * - integer strings throughout, never floating point.
 */
export function deriveDisplayedTotals(confirmed: Totals, pending: readonly PendingEntry[]): DisplayedTotals {
  let income = 0n;
  let expense = 0n;
  const adjustment = new Map<string, bigint>();
  for (const entry of pending) {
    const amount = BigInt(entry.amount_minor);
    if (entry.type === 'transfer') {
      add(adjustment, entry.source_wallet_id, -amount);
      add(adjustment, entry.destination_wallet_id, amount);
    } else if (entry.type === 'income') {
      income += amount;
      add(adjustment, entry.wallet_id, amount);
    } else {
      expense += amount;
      add(adjustment, entry.wallet_id, -amount);
    }
  }
  const pendingAdjustment: Totals = { income_minor: income.toString(), expense_minor: expense.toString(), balance_minor: (income - expense).toString(), by_wallet: asMinor(adjustment) };
  const estimatedByWallet = new Map(Object.entries(confirmed.by_wallet).map(([wallet, amount]) => [wallet, BigInt(amount)]));
  for (const [wallet, amount] of adjustment) add(estimatedByWallet, wallet, amount);
  const estimated: Totals = {
    income_minor: (BigInt(confirmed.income_minor) + income).toString(),
    expense_minor: (BigInt(confirmed.expense_minor) + expense).toString(),
    balance_minor: (BigInt(confirmed.balance_minor) + income - expense).toString(),
    by_wallet: asMinor(estimatedByWallet),
  };
  return { confirmed, pendingAdjustment, estimated };
}
