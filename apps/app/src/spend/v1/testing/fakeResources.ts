// An in-memory SpendV1Resources for render tests: owned ids, versions,
// soft deletion, history pages and month totals, with scripted failures and a
// call log. It mirrors the server's rules only as far as the screens need.
// Test use only.
import type {
  CategoryDto,
  CommandAck,
  CommandOutcome,
  CreateWalletRequest,
  HistoryFilter,
  HistoryPage,
  MonthSummary,
  TransactionDto,
  WalletDto,
  WalletSnapshot,
} from '@gogospend/contracts';

import { V1Error } from '../../../api/client';
import type { V1Outcome } from '../../../api/client';
import type { CreateEntryInput, CreateTransferInput, SpendV1Resources } from '../resources';

export type FakeCall = { method: keyof SpendV1Resources; args: unknown[] };

let sequence = 0;
const uuid = () => {
  sequence += 1;
  return `00000000-0000-4000-8000-${sequence.toString(16).padStart(12, '0')}`;
};

export const BUILTINS: CategoryDto[] = [
  ['food', 'expense', '#F0A868'], ['travel', 'expense', '#6FB3F2'], ['bills', 'expense', '#F2857E'],
  ['salary', 'income', '#A8CC4A'], ['gift', 'income', '#F291C4'],
].map(([key, type, color], i) => ({ id: `0000000c-0000-4000-8000-00000000000${i + 1}`, type: type as 'expense' | 'income', builtin_key: key as CategoryDto['builtin_key'], label: null, color, archived: false, version: 1 }));

export function createFakeResources(seed: { wallets?: WalletSnapshot[]; records?: TransactionDto[] } = {}) {
  const wallets = new Map((seed.wallets ?? []).map((wallet) => [wallet.id, { ...wallet }]));
  const records = new Map((seed.records ?? []).map((record) => [record.id, { ...record }]));
  const categories = new Map<string, CategoryDto>();
  const calls: FakeCall[] = [];
  const failures = new Map<keyof SpendV1Resources, V1Error[]>();
  // Errors thrown after the write committed: the response was lost or garbled.
  const afterCommit = new Map<keyof SpendV1Resources, V1Error[]>();
  // Receipts by command key, as the server keeps them: a resent command replays.
  const receipts = new Map<string, CommandAck>();
  const pending = new Map<keyof SpendV1Resources, Promise<void>>();
  let revision = 10;

  const balance = (wallet: WalletSnapshot): string => {
    let total = BigInt(wallet.opening_minor);
    for (const record of records.values()) {
      if (record.deleted_at) continue;
      const amount = BigInt(record.amount_minor);
      if (record.type === 'transfer') {
        if (record.source_wallet_id === wallet.id) total -= amount;
        if (record.destination_wallet_id === wallet.id) total += amount;
      } else if (record.wallet_id === wallet.id) {
        total += record.type === 'income' ? amount : -amount;
      }
    }
    return total.toString();
  };
  const ack = (commandId: string, entityId: string, version: number, outcome: CommandOutcome, state: 'active' | 'deleted' = 'active'): CommandAck => {
    revision += 1;
    return { command_id: commandId, entity_id: entityId, version, committed_revision: String(revision), outcome, entity_state: state };
  };

  async function step(method: keyof SpendV1Resources, args: unknown[]): Promise<void> {
    calls.push({ method, args });
    await pending.get(method);
    const failure = failures.get(method)?.shift();
    if (failure) throw failure;
  }

  /** Runs a command once per key (replaying its receipt), then applies any after-commit failure. */
  async function command(method: keyof SpendV1Resources, key: string, write: () => CommandAck): Promise<CommandAck> {
    const result = receipts.get(key) ?? write();
    receipts.set(key, result);
    const lost = afterCommit.get(method)?.shift();
    if (lost) throw lost;
    return result;
  }

  // A wallet scope matches a transfer on either side, as the server's does.
  const inWallet = (record: TransactionDto, walletId: string) =>
    record.type === 'transfer' ? record.source_wallet_id === walletId || record.destination_wallet_id === walletId : record.wallet_id === walletId;
  const inMonth = (record: TransactionDto, filter: HistoryFilter) =>
    !record.deleted_at && record.occurred_on >= filter.from && record.occurred_on <= filter.through &&
    (!filter.type || record.type === filter.type) &&
    (!filter.wallet_id || inWallet(record, filter.wallet_id)) &&
    (!filter.category_id || (record.type !== 'transfer' && record.category_id === filter.category_id));

  const resources: SpendV1Resources = {
    async wallets() {
      await step('wallets', []);
      return [...wallets.values()].map((wallet): WalletDto => ({ ...wallet, balance_minor: balance(wallet) }));
    },
    async createWallet(input: CreateWalletRequest, commandId: string) {
      await step('createWallet', [input, commandId]);
      return command('createWallet', commandId, () => {
        const existing = wallets.get(input.id);
        if (existing) throw new V1Error('conflict', 409, 'VERSION_CONFLICT', { current: { ...existing, balance_minor: balance(existing) } });
        wallets.set(input.id, { ...input, currency: 'THB', archived: false, version: 1 });
        return ack(commandId, input.id, 1, 'created');
      });
    },
    async categories() {
      await step('categories', []);
      return [...categories.values()];
    },
    async ensureBuiltinCategories() {
      await step('ensureBuiltinCategories', []);
      for (const builtin of BUILTINS) if (!categories.has(builtin.id)) categories.set(builtin.id, builtin);
      return [...categories.values()];
    },
    async createTransaction(input: CreateEntryInput, commandId: string) {
      await step('createTransaction', [input, commandId]);
      return command('createTransaction', commandId, () => {
        const existing = records.get(input.id);
        if (existing) throw new V1Error('conflict', 409, 'VERSION_CONFLICT', { current: { ...existing } });
        records.set(input.id, { ...input, note: input.note ?? null, merchant: input.merchant ?? null, deleted_at: null, version: 1 });
        return ack(commandId, input.id, 1, 'created');
      });
    },
    async createTransfer(input: CreateTransferInput, commandId: string) {
      await step('createTransfer', [input, commandId]);
      return command('createTransfer', commandId, () => {
        const existing = records.get(input.id);
        if (existing) throw new V1Error('conflict', 409, 'VERSION_CONFLICT', { current: { ...existing } });
        records.set(input.id, { ...input, type: 'transfer', note: input.note ?? null, merchant: input.merchant ?? null, deleted_at: null, version: 1 });
        return ack(commandId, input.id, 1, 'created');
      });
    },
    async transaction(id: string) {
      await step('transaction', [id]);
      const record = records.get(id);
      if (!record) throw new V1Error('not_found', 404, 'NOT_FOUND');
      return { ...record };
    },
    async updateTransaction(id, version, changes, commandId) {
      await step('updateTransaction', [id, version, changes, commandId]);
      return command('updateTransaction', commandId, () => {
        const record = records.get(id);
        if (!record) throw new V1Error('not_found', 404, 'NOT_FOUND');
        if (record.deleted_at) throw new V1Error('deleted', 409, 'ENTITY_DELETED');
        if (record.version !== version) throw new V1Error('conflict', 409, 'VERSION_CONFLICT', { current: { ...record } });
        const next = { ...record, ...changes, version: record.version + 1 } as TransactionDto;
        records.set(id, next);
        return ack(commandId, id, next.version, 'updated');
      });
    },
    async deleteTransaction(id, version, commandId) {
      await step('deleteTransaction', [id, version, commandId]);
      return command('deleteTransaction', commandId, () => {
        const record = records.get(id);
        if (!record) throw new V1Error('not_found', 404, 'NOT_FOUND');
        if (record.deleted_at) throw new V1Error('deleted', 409, 'ENTITY_DELETED');
        if (record.version !== version) throw new V1Error('conflict', 409, 'VERSION_CONFLICT', { current: { ...record } });
        records.set(id, { ...record, deleted_at: '2026-09-29T00:00:00.000Z', version: version + 1 });
        return ack(commandId, id, version + 1, 'deleted', 'deleted');
      });
    },
    async restoreTransaction(id, version, commandId) {
      await step('restoreTransaction', [id, version, commandId]);
      return command('restoreTransaction', commandId, () => {
        const record = records.get(id);
        if (!record) throw new V1Error('not_found', 404, 'NOT_FOUND');
        if (record.version !== version) throw new V1Error('conflict', 409, 'VERSION_CONFLICT', { current: { ...record } });
        records.set(id, { ...record, deleted_at: null, version: version + 1 });
        return ack(commandId, id, version + 1, 'restored');
      });
    },
    async history(filter: HistoryFilter, cursor?: string, limit = 50) {
      await step('history', [filter, cursor, limit]);
      const all = [...records.values()].filter((record) => inMonth(record, filter))
        .sort((a, b) => (a.occurred_on === b.occurred_on ? b.id.localeCompare(a.id) : b.occurred_on.localeCompare(a.occurred_on)));
      const start = cursor ? Number(cursor.slice(1)) : 0;
      const items = all.slice(start, start + limit);
      const sum = (type: string) => all.filter((r) => r.type === type).reduce((s, r) => s + BigInt(r.amount_minor), 0n);
      const page: HistoryPage = {
        items,
        next_cursor: start + limit < all.length ? `c${start + limit}` : null,
        as_of_revision: String(revision),
        refresh_suggested: false,
        summary: { income_minor: sum('income').toString(), expense_minor: sum('expense').toString(), balance_minor: (sum('income') - sum('expense')).toString(), by_wallet: {}, count: all.length },
      };
      return page;
    },
    async summary(month: string) {
      await step('summary', [month]);
      const scoped = [...records.values()].filter((record) => !record.deleted_at && record.occurred_on.startsWith(month));
      const sum = (type: string) => scoped.filter((r) => r.type === type).reduce((s, r) => s + BigInt(r.amount_minor), 0n);
      const summary: MonthSummary = {
        month, income_minor: sum('income').toString(), expense_minor: sum('expense').toString(), balance_minor: (sum('income') - sum('expense')).toString(),
        by_wallet: {}, categories: [], budget: null, as_of_revision: String(revision),
      };
      return summary;
    },
    async budget(month: string) {
      await step('budget', [month]);
      return null;
    },
    async commandStatus(ids) {
      await step('commandStatus', [ids]);
      return ids.map((id) => ({ command_id: id, state: 'unknown' as const }));
    },
  };

  return {
    resources,
    calls,
    callsOf: (method: keyof SpendV1Resources) => calls.filter((call) => call.method === method),
    /** The next call(s) of `method` fail with these outcomes. */
    fail(method: keyof SpendV1Resources, outcome: V1Outcome, extra: { status?: number; code?: string; fields?: Record<string, string>; current?: unknown } = {}) {
      const list = failures.get(method) ?? [];
      list.push(new V1Error(outcome, extra.status ?? 0, extra.code ?? outcome.toUpperCase(), extra));
      failures.set(method, list);
    },
    /** The next call of `method` commits, then its response is lost (or arrives unreadable). */
    loseResponse(method: keyof SpendV1Resources, outcome: V1Outcome = 'network') {
      const list = afterCommit.get(method) ?? [];
      list.push(new V1Error(outcome, 0, outcome === 'network' ? 'NETWORK_ERROR' : 'INVALID_RESPONSE'));
      afterCommit.set(method, list);
    },
    /** Holds `method` until the returned release is called. */
    hold(method: keyof SpendV1Resources): () => void {
      let release!: () => void;
      pending.set(method, new Promise<void>((resolve) => { release = resolve; }));
      return () => { pending.delete(method); release(); };
    },
    records,
    wallets,
    newId: uuid,
  };
}

/** The golden diary: Cash 403200 and Daily 146800 opening, then the four September records. */
export function goldenSeed(): { wallets: WalletSnapshot[]; records: TransactionDto[] } {
  const cash: WalletSnapshot = { id: '0000000a-0000-4000-8000-000000000001', name: 'Cash', currency: 'THB', opening_minor: '403200', tracking_start: '2026-09-01', archived: false, version: 1 };
  const daily: WalletSnapshot = { id: '0000000a-0000-4000-8000-000000000002', name: 'Daily account', currency: 'THB', opening_minor: '146800', tracking_start: '2026-09-01', archived: false, version: 1 };
  const [food, , bills, salary] = BUILTINS;
  const common = { note: null, merchant: null, deleted_at: null, version: 1 };
  return {
    wallets: [cash, daily],
    records: [
      { ...common, id: '0000000b-0000-4000-8000-000000000001', type: 'income', amount_minor: '2800000', occurred_on: '2026-09-25', wallet_id: daily.id, category_id: salary.id, note: 'September salary' },
      { ...common, id: '0000000b-0000-4000-8000-000000000002', type: 'expense', amount_minor: '18200', occurred_on: '2026-09-26', wallet_id: cash.id, category_id: food.id },
      { ...common, id: '0000000b-0000-4000-8000-000000000003', type: 'expense', amount_minor: '1226800', occurred_on: '2026-09-27', wallet_id: daily.id, category_id: bills.id, note: 'Rent' },
      { ...common, id: '0000000b-0000-4000-8000-000000000004', type: 'transfer', amount_minor: '150000', occurred_on: '2026-09-28', source_wallet_id: cash.id, destination_wallet_id: daily.id },
    ],
  };
}
