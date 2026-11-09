// Fakes for the catalogue's screen sections (redesign R2c+, development only).
// The route loads the catalogue behind `__DEV__`, so neither this module nor
// the test fakes it builds on (spend/v1/testing) reach a release bundle.
//
// Everything sits on the render tests' golden diary: Cash and Daily account,
// the September salary, the ฿182.00 lunch, the ฿12,268.00 rent and the
// ฿1,500.00 move, with "today" pinned to 29 September 2026 (10:00 in
// Bangkok), the day after the last golden record. The helpers here mirror the
// screens' render-test harnesses (HistoryTestHarness and the Home and Quick
// add tests), which import testing libraries and so cannot be used in the app.
import type { BudgetDto, CategoryDto, TransactionDto, WalletSnapshot } from '@gogospend/contracts';

import { V1Error } from '@mobile/api/client';
import type { V1Outcome } from '@mobile/api/client';
import type { SpendV1Resources } from '@mobile/spend/v1/resources';
import type { DiaryView } from '@mobile/spend/v1/spendDiary';
import { createFakeDiary } from '@mobile/spend/v1/testing/fakeDiary';
import { BUILTINS, createFakeResources, goldenSeed } from '@mobile/spend/v1/testing/fakeResources';
import type { OutboxCommand, OutboxState, PendingEntry } from '@mobile/storage/types';

/** 29 September 2026, 10:00 in Bangkok: the golden month is the current month. */
export const CATALOGUE_NOW = new Date('2026-09-29T03:00:00Z');
/** CATALOGUE_NOW's Bangkok date. */
export const CATALOGUE_TODAY = '2026-09-29';

export type FakeResources = ReturnType<typeof createFakeResources>;
export type FakeDiary = ReturnType<typeof createFakeDiary>;

const golden = goldenSeed();
const [CASH, DAILY] = golden.wallets as [WalletSnapshot, WalletSnapshot];
const [FOOD, TRAVEL, BILLS, SALARY, GIFT] = BUILTINS as [CategoryDto, CategoryDto, CategoryDto, CategoryDto, CategoryDto];

/** The golden ids and references the sections name. */
export const GOLDEN = {
  cash: CASH,
  daily: DAILY,
  categories: { food: FOOD, travel: TRAVEL, bills: BILLS, salary: SALARY, gift: GIFT },
  salaryId: '0000000b-0000-4000-8000-000000000001',
  lunchId: '0000000b-0000-4000-8000-000000000002',
  rentId: '0000000b-0000-4000-8000-000000000003',
  moveId: '0000000b-0000-4000-8000-000000000004',
} as const;

/** The golden diary, plus any extra records. */
export function goldenFake(extra: readonly TransactionDto[] = []): FakeResources {
  const seed = goldenSeed();
  return createFakeResources({ ...seed, records: [...seed.records, ...extra] });
}

/** This month's budget (the fake itself has none). */
export function withBudget(resources: SpendV1Resources, limitMinor: string): SpendV1Resources {
  const budget = async (month: string): Promise<BudgetDto> => ({ id: '0000000d-0000-4000-8000-000000000001', month, overall_limit_minor: limitMinor, category_limits: [], version: 1 });
  return { ...resources, budget };
}

/**
 * `method` always fails with `outcome`. The fake's own `fail` fails the next
 * call only, so a second load (a remount, a refocus) would quietly succeed;
 * a state shown for review stays put.
 */
export function alwaysFails(resources: SpendV1Resources, method: keyof SpendV1Resources, outcome: V1Outcome): SpendV1Resources {
  const fail = async (): Promise<never> => { throw new V1Error(outcome, 0, outcome.toUpperCase()); };
  return { ...resources, [method]: fail };
}

/** A device diary that is open and has the golden wallets and categories synced, as on a phone. */
export function deviceDiary(view: Partial<DiaryView> = {}): FakeDiary {
  return createFakeDiary({ wallets: golden.wallets, categories: BUILTINS, ...view });
}

let counter = 0;
const nextId = (prefix: string) => {
  counter += 1;
  return `${prefix}-0000-4000-8000-${counter.toString(16).padStart(12, '0')}`;
};

/** An expense draft saved on this device: ฿65.00 of Food from Cash, today, unless told otherwise. */
export function draftEntry(overrides: Partial<Extract<PendingEntry, { type: 'expense' | 'income' }>> = {}): PendingEntry {
  return {
    id: nextId('0000000e'), type: 'expense', amount_minor: '6500', occurred_on: CATALOGUE_TODAY,
    wallet_id: CASH.id, category_id: FOOD.id, note: null, merchant: null, ...overrides,
  } as PendingEntry;
}

/** The draft in the device's outbox, in `state`. */
export function queued(payload: PendingEntry, state: OutboxState): OutboxCommand {
  return {
    commandId: nextId('0000000f'), accountId: 'a0000000-0000-4000-8000-000000000001', schemaVersion: 1, kind: 'transaction.create', payload, state,
    firstTransmissionAt: state === 'unsent' ? null : '2026-09-29T02:00:00.000Z', createdAt: '2026-09-29T02:00:00.000Z',
    ackedRevision: state === 'acknowledged' ? '9' : null,
  };
}

/** A September expense of `amountMinor`, for months that need more records. */
export function expense(index: number, day: string, amountMinor: string, overrides: Partial<TransactionDto> = {}): TransactionDto {
  return {
    id: `0000000d-0000-4000-8000-${String(index).padStart(12, '0')}`, type: 'expense', amount_minor: amountMinor, occurred_on: day,
    wallet_id: CASH.id, category_id: FOOD.id, note: null, merchant: null, deleted_at: null, version: 1, ...overrides,
  } as TransactionDto;
}

/** Sixty more Food expenses on 10 September, so the month needs a second page. */
export function extraRecords(count = 60): TransactionDto[] {
  return Array.from({ length: count }, (_, index) => expense(index, '2026-09-10', String(100 + index)));
}
