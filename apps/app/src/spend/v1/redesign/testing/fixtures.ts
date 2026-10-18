// Fixtures for the R3 view-model tests. Test use only.
import type { BudgetDto, CategoryDto, MonthSummary, TransactionDto, WalletDto } from '@gogospend/contracts';

import type { OutboxCommand, OutboxState, PendingEntry } from '../../../../storage/types.ts';
import type { CopyValues, Lookups, Translate } from '../shared.ts';

/** English in, English out, with `{placeholders}` filled: assertions read like the screen. */
export const tc: Translate = (english: string, values?: CopyValues) =>
  values ? english.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match)) : english;

/** Marks every translated piece, to prove text went through `tc`. */
export const marked: Translate = (english, values) => `[${tc(english, values)}]`;

export const CASH = 'w0000000-0000-4000-8000-000000000001';
export const BANK = 'w0000000-0000-4000-8000-000000000002';
export const OLD = 'w0000000-0000-4000-8000-000000000003';

export function walletDto(id: string, name: string, balance = '0', archived = false): WalletDto {
  return { id, name, currency: 'THB', opening_minor: '0', tracking_start: '2026-01-01', archived, version: 1, balance_minor: balance };
}

export const WALLETS: WalletDto[] = [walletDto(CASH, 'Cash', '120000'), walletDto(BANK, 'Bank', '5000000')];

const builtin = (key: CategoryDto['builtin_key'] & string, type: CategoryDto['type'], index: number): CategoryDto => ({
  id: `c0000000-0000-4000-8000-0000000000${String(index).padStart(2, '0')}`, type, builtin_key: key, label: null, color: null, archived: false, version: 1,
});

export const FOOD = builtin('food', 'expense', 1);
export const TRAVEL = builtin('travel', 'expense', 2);
export const HOUSEHOLD = builtin('household', 'expense', 3);
export const BILLS = builtin('bills', 'expense', 4);
export const SHOPPING = builtin('shopping', 'expense', 5);
export const FUN = builtin('fun', 'expense', 6);
export const SALARY = builtin('salary', 'income', 7);
export const BONUS = builtin('bonus', 'income', 8);
export const SIDE_JOB = builtin('side_job', 'income', 9);
export const GIFT = builtin('gift', 'income', 10);
export const PETS: CategoryDto = { id: 'c0000000-0000-4000-8000-000000000011', type: 'expense', builtin_key: null, label: 'Pets', color: null, archived: false, version: 1 };
export const ART: CategoryDto = { id: 'c0000000-0000-4000-8000-000000000012', type: 'expense', builtin_key: null, label: 'Art', color: null, archived: false, version: 1 };
export const COFFEE_TH: CategoryDto = { id: 'c0000000-0000-4000-8000-000000000013', type: 'expense', builtin_key: null, label: 'กาแฟ', color: null, archived: false, version: 1 };
export const OLD_HOBBY: CategoryDto = { id: 'c0000000-0000-4000-8000-000000000014', type: 'expense', builtin_key: null, label: 'Old hobby', color: null, archived: true, version: 2 };

export const BUILTINS: CategoryDto[] = [FOOD, TRAVEL, HOUSEHOLD, BILLS, SHOPPING, FUN, SALARY, BONUS, SIDE_JOB, GIFT];

export const lookups = (wallets: readonly { id: string; name: string }[] = WALLETS, categories: readonly CategoryDto[] = [...BUILTINS, PETS, ART, COFFEE_TH, OLD_HOBBY]): Lookups => ({
  wallets: new Map(wallets.map((wallet) => [wallet.id, wallet])),
  categories: new Map(categories.map((category) => [category.id, category])),
});

let counter = 0;
/** A distinct lower-case UUID per call. */
export function uuid(): string {
  counter += 1;
  return `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`;
}

type EntryOverrides = Partial<Omit<Extract<TransactionDto, { type: 'expense' | 'income' }>, 'type'>> & { type?: 'expense' | 'income' };

export function entry(overrides: EntryOverrides = {}): TransactionDto {
  return { id: uuid(), type: 'expense', amount_minor: '6500', occurred_on: '2026-10-18', wallet_id: CASH, category_id: FOOD.id, note: null, merchant: null, deleted_at: null, version: 1, ...overrides } as TransactionDto;
}

export function transfer(overrides: Partial<Omit<Extract<TransactionDto, { type: 'transfer' }>, 'type'>> = {}): TransactionDto {
  return { id: uuid(), type: 'transfer', amount_minor: '50000', occurred_on: '2026-10-18', source_wallet_id: CASH, destination_wallet_id: BANK, note: null, merchant: null, deleted_at: null, version: 1, ...overrides };
}

export function pending(overrides: Partial<PendingEntry> & { type?: PendingEntry['type'] } = {}): PendingEntry {
  if (overrides.type === 'transfer') {
    return { id: uuid(), amount_minor: '50000', occurred_on: '2026-10-18', source_wallet_id: CASH, destination_wallet_id: BANK, note: null, merchant: null, ...overrides } as PendingEntry;
  }
  return { id: uuid(), type: 'expense', amount_minor: '6500', occurred_on: '2026-10-18', wallet_id: CASH, category_id: FOOD.id, note: null, merchant: null, ...overrides } as PendingEntry;
}

export function command(payload: PendingEntry, state: OutboxState = 'unsent', overrides: Partial<OutboxCommand> = {}): OutboxCommand {
  return {
    commandId: uuid(), accountId: 'a0000000-0000-4000-8000-000000000001', schemaVersion: 1, kind: 'transaction.create', payload, state,
    firstTransmissionAt: state === 'unsent' ? null : '2026-10-18T03:00:00.000Z', createdAt: '2026-10-18T03:00:00.000Z', ackedRevision: state === 'acknowledged' ? '9' : null,
    ...overrides,
  };
}

export function summary(month: string, overrides: Partial<MonthSummary> = {}): MonthSummary {
  return { month, income_minor: '0', expense_minor: '0', balance_minor: '0', by_wallet: {}, categories: [], budget: null, as_of_revision: '1', ...overrides };
}

export function budget(month: string, limit: string, categoryLimits: { category_id: string; limit_minor: string }[] = []): BudgetDto {
  return { id: 'b0000000-0000-4000-8000-000000000001', month, overall_limit_minor: limit, category_limits: categoryLimits, version: 1 };
}

/** A summary whose expenses total `spent` (in one category unless given per category). */
export function spentSummary(month: string, spent: string, byCategory: Record<string, string> = { [FOOD.id]: spent }): MonthSummary {
  return summary(month, {
    expense_minor: spent,
    balance_minor: (-BigInt(spent)).toString(),
    categories: Object.entries(byCategory).map(([category_id, total_minor]) => ({ category_id, type: 'expense' as const, total_minor })),
  });
}
