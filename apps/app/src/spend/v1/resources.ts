// The app's typed port to the v1 API. Every response is checked against the
// exact shared DTO shape (no coercion of number money, no unknown fields),
// every write is an immutable command with a caller-held key, and nothing
// falls back to the legacy /spend API or infers a wallet by name.
import {
  COMMAND_OUTCOMES,
  ENTITY_STATES,
  SYNC_ENTITY_VALIDATORS,
  isBudgetSnapshot,
  isCategorySnapshot,
  isSnapshotChunk,
  isSnapshotChunkGrant,
  isSnapshotDto,
  isSyncChangesPage,
  isTransactionSnapshot,
  isUuid,
  isWalletSnapshot,
} from '@gogospend/contracts';
import type {
  BudgetDto,
  CategoryDto,
  CommandAck,
  CommandStatus,
  CreateCategoryRequest,
  CreateWalletRequest,
  HistoryFilter,
  HistoryPage,
  MonthSummary,
  SetMonthlyBudgetRequest,
  TransactionDto,
  UpdateCategoryRequest,
  UpdateTransactionRequest,
  UpdateWalletRequest,
  WalletDto,
} from '@gogospend/contracts';

import { V1Error } from '../../api/client.ts';
import type { V1Transport } from '../../api/client.ts';
import type { SyncRemote } from '../../sync/types.ts';

/** The command schema this build emits (`X-GoGoSpend-Command-Schema`). */
export const V1_COMMAND_SCHEMA = 1;

/** Sync pages and chunks may carry entity types a newer server added; this build skips them instead of failing the page. */
const SKIP_UNKNOWN_ENTITIES = { unknownEntities: 'skip' } as const;

export type CreateEntryInput = { id: string; type: 'expense' | 'income'; amount_minor: string; occurred_on: string; wallet_id: string; category_id: string; note?: string | null; merchant?: string | null };
export type CreateTransferInput = { id: string; amount_minor: string; occurred_on: string; source_wallet_id: string; destination_wallet_id: string; note?: string | null; merchant?: string | null };

/** The app's typed port to the v1 API: owned ids only, no name-based ownership, no legacy fallback. */
export type SpendV1Resources = {
  wallets(): Promise<WalletDto[]>;
  createWallet(input: CreateWalletRequest, commandId: string): Promise<CommandAck>;
  categories(): Promise<CategoryDto[]>;
  ensureBuiltinCategories(): Promise<CategoryDto[]>;
  createTransaction(input: CreateEntryInput, commandId: string): Promise<CommandAck>;
  createTransfer(input: CreateTransferInput, commandId: string): Promise<CommandAck>;
  transaction(id: string): Promise<TransactionDto>;
  updateTransaction(id: string, version: number, changes: UpdateTransactionRequest, commandId: string): Promise<CommandAck>;
  deleteTransaction(id: string, version: number, commandId: string): Promise<CommandAck>;
  restoreTransaction(id: string, version: number, commandId: string): Promise<CommandAck>;
  history(filter: HistoryFilter, cursor?: string, limit?: number): Promise<HistoryPage>;
  summary(month: string): Promise<MonthSummary>;
  budget(month: string): Promise<BudgetDto | null>;
  /**
   * Sets a month's whole budget (R4). Without `existing` it creates, and the
   * server derives the budget's id; with the version and id the screen read,
   * it replaces.
   */
  setBudget(month: string, input: SetMonthlyBudgetRequest, commandId: string, existing?: { version: number; id: string }): Promise<CommandAck>;
  updateWallet(id: string, version: number, changes: UpdateWalletRequest, commandId: string): Promise<CommandAck>;
  archiveWallet(id: string, version: number, commandId: string): Promise<CommandAck>;
  unarchiveWallet(id: string, version: number, commandId: string): Promise<CommandAck>;
  createCategory(input: CreateCategoryRequest, commandId: string): Promise<CommandAck>;
  updateCategory(id: string, version: number, changes: UpdateCategoryRequest, commandId: string): Promise<CommandAck>;
  archiveCategory(id: string, version: number, commandId: string): Promise<CommandAck>;
  unarchiveCategory(id: string, version: number, commandId: string): Promise<CommandAck>;
  commandStatus(ids: readonly string[]): Promise<CommandStatus[]>;
};

type Json = Record<string, unknown>;
const SIGNED_MINOR = /^(?:0|-?[1-9][0-9]*)$/;
const REVISION = /^(?:0|[1-9][0-9]*)$/;
const MONTH = /^[0-9]{4}-(0[1-9]|1[0-2])$/;

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const hasExactly = (value: Json, keys: readonly string[]) => Object.keys(value).sort().join(',') === [...keys].sort().join(',');
const isMinor = (value: unknown): value is string => typeof value === 'string' && value.length <= 40 && SIGNED_MINOR.test(value);
const listOf = <T>(item: (value: unknown) => value is T) => (value: unknown): value is T[] => Array.isArray(value) && value.every(item);

export function isCommandAck(value: unknown): value is CommandAck {
  return isObject(value) && hasExactly(value, ['command_id', 'entity_id', 'version', 'committed_revision', 'outcome', 'entity_state']) &&
    isUuid(value.command_id) && isUuid(value.entity_id) && Number.isSafeInteger(value.version) && (value.version as number) >= 1 &&
    typeof value.committed_revision === 'string' && REVISION.test(value.committed_revision) &&
    (COMMAND_OUTCOMES as readonly unknown[]).includes(value.outcome) && (ENTITY_STATES as readonly unknown[]).includes(value.entity_state);
}

export function isWalletDto(value: unknown): value is WalletDto {
  if (!isObject(value) || !isMinor(value.balance_minor)) return false;
  const { balance_minor: _balance, ...snapshot } = value;
  return isWalletSnapshot(snapshot);
}

function isTotals(value: unknown, withCount: boolean): boolean {
  if (!isObject(value)) return false;
  const keys = ['income_minor', 'expense_minor', 'balance_minor', 'by_wallet', ...(withCount ? ['count'] : [])];
  return hasExactly(value, keys) && isMinor(value.income_minor) && isMinor(value.expense_minor) && isMinor(value.balance_minor) &&
    isObject(value.by_wallet) && Object.entries(value.by_wallet).every(([id, total]) => isUuid(id) && isMinor(total)) &&
    (!withCount || (Number.isSafeInteger(value.count) && (value.count as number) >= 0));
}

export function isHistoryPage(value: unknown): value is HistoryPage {
  return isObject(value) && hasExactly(value, ['items', 'next_cursor', 'as_of_revision', 'refresh_suggested', 'summary']) &&
    Array.isArray(value.items) && value.items.every(isTransactionSnapshot) &&
    (value.next_cursor === null || (typeof value.next_cursor === 'string' && /^[A-Za-z0-9_-]{1,512}$/.test(value.next_cursor))) &&
    typeof value.as_of_revision === 'string' && REVISION.test(value.as_of_revision) &&
    typeof value.refresh_suggested === 'boolean' && isTotals(value.summary, true);
}

export function isMonthSummary(value: unknown): value is MonthSummary {
  if (!isObject(value)) return false;
  const { month, categories, budget, as_of_revision: revision, ...totals } = value;
  const categoryOk = Array.isArray(categories) && categories.every((item) => isObject(item) && hasExactly(item, ['category_id', 'type', 'total_minor']) &&
    isUuid(item.category_id) && (item.type === 'expense' || item.type === 'income') && isMinor(item.total_minor));
  const budgetOk = budget === null || (isObject(budget) && hasExactly(budget, ['overall_limit_minor', 'spent_minor', 'remaining_minor', 'categories']) &&
    isMinor(budget.overall_limit_minor) && isMinor(budget.spent_minor) && isMinor(budget.remaining_minor) &&
    Array.isArray(budget.categories) && budget.categories.every((item) => isObject(item) && hasExactly(item, ['category_id', 'limit_minor', 'spent_minor', 'remaining_minor']) &&
      isUuid(item.category_id) && isMinor(item.limit_minor) && isMinor(item.spent_minor) && isMinor(item.remaining_minor)));
  return typeof month === 'string' && MONTH.test(month) && categoryOk && budgetOk && typeof revision === 'string' && REVISION.test(revision) && isTotals(totals, false);
}

function isCommandStatus(value: unknown): value is CommandStatus {
  if (!isObject(value) || !isUuid(value.command_id)) return false;
  if (value.state === 'unknown') return hasExactly(value, ['command_id', 'state']);
  return value.state === 'known' && hasExactly(value, ['command_id', 'state', 'ack']) && isCommandAck(value.ack);
}

async function fetchCommandStatus(transport: V1Transport, ids: readonly string[]): Promise<CommandStatus[]> {
  const response = await transport.request('POST', '/v1/commands/status', {
    body: { command_ids: ids },
    validate: (value): value is { statuses: CommandStatus[] } => isObject(value) && hasExactly(value, ['statuses']) && listOf(isCommandStatus)(value.statuses),
  });
  return response.statuses;
}

const command = (id: string, ifMatch?: number) => ({ id, schemaVersion: V1_COMMAND_SCHEMA, ...(ifMatch === undefined ? {} : { ifMatch }) });
/** An acknowledgement must be for this command and this entity. */
const ackFor = (commandId: string, entityId: string) => (value: unknown): value is CommandAck =>
  isCommandAck(value) && value.command_id === commandId && value.entity_id === entityId;
/** An acknowledgement must be for this command (the server derives the entity, as for a new budget). */
const ackForCommand = (commandId: string) => (value: unknown): value is CommandAck => isCommandAck(value) && value.command_id === commandId;
const monthSegment = (month: string) => {
  if (!MONTH.test(month)) throw new V1Error('invalid', 0, 'INVALID_MONTH');
  return month;
};
const segment = (id: string) => {
  if (!isUuid(id)) throw new V1Error('invalid', 0, 'INVALID_ID');
  return id;
};

export function createSpendV1Resources(transport: V1Transport): SpendV1Resources {
  return {
    wallets: () => transport.request('GET', '/v1/wallets', { validate: listOf(isWalletDto) }),
    createWallet: (input, commandId) => transport.request('POST', '/v1/wallets', { body: input, command: command(commandId), validate: ackFor(commandId, input.id) }),
    categories: () => transport.request('GET', '/v1/categories', { validate: listOf(isCategorySnapshot) }),
    // Server-derived command: no key or schema from the app.
    ensureBuiltinCategories: () => transport.request('POST', '/v1/categories/builtins', { validate: listOf(isCategorySnapshot) }),
    createTransaction: (input, commandId) => transport.request('POST', '/v1/transactions', { body: input, command: command(commandId), validate: ackFor(commandId, input.id) }),
    createTransfer: (input, commandId) => transport.request('POST', '/v1/transactions', { body: { ...input, type: 'transfer' }, command: command(commandId), validate: ackFor(commandId, input.id) }),
    transaction: (id) => transport.request('GET', `/v1/transactions/${segment(id)}`, { validate: isTransactionSnapshot }),
    updateTransaction: (id, version, changes, commandId) =>
      transport.request('PATCH', `/v1/transactions/${segment(id)}`, { body: changes, command: command(commandId, version), validate: ackFor(commandId, id) }),
    deleteTransaction: (id, version, commandId) => transport.request('DELETE', `/v1/transactions/${segment(id)}`, { command: command(commandId, version), validate: ackFor(commandId, id) }),
    restoreTransaction: (id, version, commandId) =>
      transport.request('POST', `/v1/transactions/${segment(id)}/restore`, { body: {}, command: command(commandId, version), validate: ackFor(commandId, id) }),
    history: (filter, cursor, limit) => {
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(filter)) if (value !== undefined) query.set(key, String(value));
      if (cursor !== undefined) query.set('cursor', cursor);
      if (limit !== undefined) query.set('limit', String(limit));
      return transport.request('GET', `/v1/history?${query.toString()}`, { validate: isHistoryPage });
    },
    summary: (month) => transport.request('GET', `/v1/summary?month=${encodeURIComponent(month)}`, { validate: isMonthSummary }),
    budget: async (month) => {
      try {
        return await transport.request('GET', `/v1/budgets/${encodeURIComponent(month)}`, { validate: isBudgetSnapshot });
      } catch (error) {
        if (error instanceof V1Error && error.outcome === 'not_found') return null;
        throw error;
      }
    },
    // Async, so a malformed month or id is a rejection like any other refusal.
    setBudget: async (month, input, commandId, existing) =>
      transport.request('PUT', `/v1/budgets/${monthSegment(month)}`, {
        body: input,
        command: command(commandId, existing?.version),
        validate: existing ? ackFor(commandId, existing.id) : ackForCommand(commandId),
      }),
    updateWallet: async (id, version, changes, commandId) =>
      transport.request('PATCH', `/v1/wallets/${segment(id)}`, { body: changes, command: command(commandId, version), validate: ackFor(commandId, id) }),
    archiveWallet: async (id, version, commandId) =>
      transport.request('POST', `/v1/wallets/${segment(id)}/archive`, { body: {}, command: command(commandId, version), validate: ackFor(commandId, id) }),
    unarchiveWallet: async (id, version, commandId) =>
      transport.request('POST', `/v1/wallets/${segment(id)}/unarchive`, { body: {}, command: command(commandId, version), validate: ackFor(commandId, id) }),
    createCategory: async (input, commandId) => transport.request('POST', '/v1/categories', { body: input, command: command(commandId), validate: ackFor(commandId, input.id) }),
    updateCategory: async (id, version, changes, commandId) =>
      transport.request('PATCH', `/v1/categories/${segment(id)}`, { body: changes, command: command(commandId, version), validate: ackFor(commandId, id) }),
    archiveCategory: async (id, version, commandId) =>
      transport.request('POST', `/v1/categories/${segment(id)}/archive`, { body: {}, command: command(commandId, version), validate: ackFor(commandId, id) }),
    unarchiveCategory: async (id, version, commandId) =>
      transport.request('POST', `/v1/categories/${segment(id)}/unarchive`, { body: {}, command: command(commandId, version), validate: ackFor(commandId, id) }),
    commandStatus: (ids) => fetchCommandStatus(transport, ids),
  };
}

/**
 * The sync side of the v1 API (S1 deltas and snapshots, M1 command status)
 * for the outbox engine. A command is sent only as itself: its own id as
 * Idempotency-Key, its own schema version and its exact stored body. Every
 * response is checked against the shared contract; a snapshot chunk must also
 * match its grant's size and SHA-256 before it is parsed.
 */
export function createSyncResources(transport: V1Transport, options: { sha256Hex: (text: string) => Promise<string> }): SyncRemote {
  const invalid = () => new V1Error('invalid_response', 200, 'INVALID_RESPONSE');
  return {
    sendCreate: (command) =>
      transport.request('POST', '/v1/transactions', {
        body: command.payload,
        command: { id: command.commandId, schemaVersion: command.schemaVersion },
        resendLost: false,
        validate: ackFor(command.commandId, command.payload.id),
      }),
    commandStatus: (ids) => fetchCommandStatus(transport, ids),
    changes: (cursor, limit) => {
      const query = new URLSearchParams();
      if (cursor !== null) query.set('cursor', cursor);
      if (limit !== undefined) query.set('limit', String(limit));
      const search = query.toString();
      return transport.request('GET', `/v1/sync/changes${search ? `?${search}` : ''}`, { validate: (value) => isSyncChangesPage(value, SYNC_ENTITY_VALIDATORS, SKIP_UNKNOWN_ENTITIES) });
    },
    requestSnapshot: (key) =>
      transport.request('POST', '/v1/sync/snapshots', { body: {}, command: { id: segment(key), schemaVersion: V1_COMMAND_SCHEMA }, validate: isSnapshotDto }),
    snapshotStatus: (id) => transport.request('GET', `/v1/sync/snapshots/${segment(id)}`, { validate: isSnapshotDto }),
    async snapshotChunk(grant) {
      if (!isSnapshotChunkGrant(grant)) throw new V1Error('invalid', 0, 'INVALID_GRANT');
      const text = await transport.request('GET', `/v1/sync/snapshot-chunks/${grant.grant}`, { text: true, validate: (value): value is string => typeof value === 'string' });
      if (new TextEncoder().encode(text).length !== grant.bytes || (await options.sha256Hex(text)) !== grant.sha256) throw invalid();
      let chunk: unknown;
      try {
        chunk = JSON.parse(text);
      } catch {
        throw invalid();
      }
      if (!isSnapshotChunk(chunk, SYNC_ENTITY_VALIDATORS, SKIP_UNKNOWN_ENTITIES) || chunk.index !== grant.index) throw invalid();
      return chunk;
    },
  };
}
