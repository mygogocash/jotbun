// Diary fixtures: valid v1 snapshots, change groups and outbox commands. Test use only.
import { randomUUID } from 'node:crypto';

import type { CategoryDto, CommittedChangeGroup, EntityChange, TransactionDto, WalletSnapshot } from '@gogospend/contracts';

import type { OutboxCommand, PendingEntry } from '../types.ts';

export const ACCOUNT_A = '0a000000-0000-4000-8000-00000000000a';
export const ACCOUNT_B = '0b000000-0000-4000-8000-00000000000b';
export const WALLET = '1a000000-0000-4000-8000-000000000001';
export const SAVINGS = '1a000000-0000-4000-8000-000000000002';
export const FOOD = '2c000000-0000-4000-8000-000000000001';

export function wallet(overrides: Partial<WalletSnapshot> = {}): WalletSnapshot {
  return { id: WALLET, name: 'Cash', currency: 'THB', opening_minor: '100000', tracking_start: '2026-01-01', archived: false, version: 1, ...overrides };
}

export function category(overrides: Partial<CategoryDto> = {}): CategoryDto {
  return { id: FOOD, type: 'expense', builtin_key: 'food', label: null, color: null, archived: false, version: 1, ...overrides };
}

export function expense(overrides: Partial<TransactionDto> = {}): TransactionDto {
  return { id: randomUUID(), type: 'expense', amount_minor: '6500', occurred_on: '2026-03-01', wallet_id: WALLET, category_id: FOOD, note: null, merchant: null, deleted_at: null, version: 1, ...overrides } as TransactionDto;
}

export function change(entity: 'wallet' | 'category' | 'transaction', snapshot: { id: string; version: number; [field: string]: unknown }, state: EntityChange['state'] = 'active'): EntityChange {
  return { entity, id: snapshot.id, version: snapshot.version, state, snapshot: state === 'purged' ? null : snapshot };
}

export function group(revision: number, ...changes: EntityChange[]): CommittedChangeGroup {
  return { revision: String(revision), command_id: randomUUID(), changes };
}

/** The synced wallets and category a draft may reference (revision 1). */
export function references(): CommittedChangeGroup {
  return group(1, change('wallet', wallet()), change('wallet', wallet({ id: SAVINGS, name: 'Savings', opening_minor: '0' })), change('category', category()));
}

export function draft(overrides: Partial<PendingEntry> = {}): PendingEntry {
  return { id: randomUUID(), type: 'expense', amount_minor: '9900', occurred_on: '2026-03-02', wallet_id: WALLET, category_id: FOOD, note: 'lunch', ...overrides } as PendingEntry;
}

export function outbox(entry: PendingEntry, accountId = ACCOUNT_A, overrides: Partial<OutboxCommand> = {}): OutboxCommand {
  return { commandId: randomUUID(), accountId, schemaVersion: 1, kind: 'transaction.create', payload: entry, state: 'unsent', firstTransmissionAt: null, createdAt: '2026-03-02T05:00:00.000Z', ackedRevision: null, ...overrides };
}
