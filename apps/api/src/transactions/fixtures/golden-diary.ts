// The pinned golden diary (plan M3): two wallets, one income, two expenses
// and one transfer, with the exact balances every view must reconcile to.
// Synthetic data only.
export const GOLDEN_START = '2026-09-01';

export const GOLDEN_WALLETS = {
  cash: { name: 'Cash', opening_minor: '403200' },
  daily: { name: 'Daily account', opening_minor: '146800' },
} as const;

/** Records in entry order; wallets are named by fixture key. */
export const GOLDEN_RECORDS = [
  { type: 'income', amount_minor: '2800000', occurred_on: '2026-09-25', wallet: 'daily', category: 'salary', note: 'September salary' },
  { type: 'expense', amount_minor: '18200', occurred_on: '2026-09-26', wallet: 'cash', category: 'food', note: null },
  { type: 'expense', amount_minor: '1226800', occurred_on: '2026-09-27', wallet: 'daily', category: 'bills', note: 'Rent' },
  { type: 'transfer', amount_minor: '150000', occurred_on: '2026-09-28', source: 'cash', destination: 'daily', note: null },
] as const;

export const GOLDEN_BALANCES = { cash: '235000', daily: '1870000', total: '2105000' } as const;
/** Income and expense exclude opening balances and transfers. */
export const GOLDEN_TOTALS = { income_minor: '2800000', expense_minor: '1245000' } as const;
