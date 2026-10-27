import { MAX_COMMAND_STATUS_IDS, ContractValidationError, assertKnownFields, isUuid } from '@gogospend/contracts'

import type { VaultCall, VaultReply, VaultRouteId } from '../v1/protocol'
import { lookupStatuses } from './commands/receipts'
import type { VaultContext } from './context'
import { getBudget, putBudget } from './domain/budgets'
import { archiveCategory, createCategory, listCategories, seedBuiltins, unarchiveCategory, updateCategory } from './domain/categories'
import { createTransaction, deleteTransaction, getTransaction, restoreTransaction, updateTransaction } from './domain/transactions'
import { createWallet, archiveWallet, getWallet, listWallets, unarchiveWallet, updateWallet } from './domain/wallets'
import { syncChanges } from './reads/sync'
import { acceptPolicy, describeMe, setPrivacy } from './policies'
import { okReply } from './replies'
import { revokeSession } from './session'

export type VaultHandler = (c: VaultContext, call: VaultCall) => VaultReply

/** The command ids of a status request: 1 to 100 UUIDs, as the API checks them. */
function commandIdsOf(body: unknown): string[] {
  const { command_ids: ids } = assertKnownFields(body, ['command_ids'])
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_COMMAND_STATUS_IDS || !ids.every(isUuid)) {
    throw new ContractValidationError('VALIDATION_FAILED', `command_ids must be 1-${MAX_COMMAND_STATUS_IDS} UUIDs.`, 'command_ids')
  }
  return ids
}

/**
 * The handlers the vault serves, one per ported route. Each runs after the
 * vault's own checks (user-vault.ts) and does only its route's work. The
 * status comes from the route table (okReply).
 */
export const VAULT_HANDLERS: Partial<Record<VaultRouteId, VaultHandler>> = {
  'me.get': (c, call) => okReply(call.route, describeMe(c)),
  'me.logout': (c, call) => {
    revokeSession(c)
    return okReply(call.route)
  },
  'me.privacy': (c, call) => okReply(call.route, setPrivacy(c, assertKnownFields(call.body, ['analytics']).analytics)),
  'policies.accept': (c, call) => {
    const input = assertKnownFields(call.body, ['kind', 'version'])
    acceptPolicy(c, input.kind, input.version)
    return okReply(call.route)
  },
  'wallets.list': (c, call) => okReply(call.route, listWallets(c)),
  'wallets.get': (c, call) => okReply(call.route, getWallet(c, call.params.id)),
  'wallets.create': (c, call) => okReply(call.route, createWallet(c, call)),
  'wallets.update': (c, call) => okReply(call.route, updateWallet(c, call)),
  'wallets.archive': (c, call) => okReply(call.route, archiveWallet(c, call)),
  'wallets.unarchive': (c, call) => okReply(call.route, unarchiveWallet(c, call)),
  'categories.list': (c, call) => okReply(call.route, listCategories(c)),
  'categories.builtins': (c, call) => okReply(call.route, seedBuiltins(c)),
  'categories.create': (c, call) => okReply(call.route, createCategory(c, call)),
  'categories.update': (c, call) => okReply(call.route, updateCategory(c, call)),
  'categories.archive': (c, call) => okReply(call.route, archiveCategory(c, call)),
  'categories.unarchive': (c, call) => okReply(call.route, unarchiveCategory(c, call)),
  'transactions.get': (c, call) => okReply(call.route, getTransaction(c, call.params.id)),
  'transactions.create': (c, call) => okReply(call.route, createTransaction(c, call)),
  'transactions.update': (c, call) => okReply(call.route, updateTransaction(c, call)),
  'transactions.delete': (c, call) => okReply(call.route, deleteTransaction(c, call)),
  'transactions.restore': (c, call) => okReply(call.route, restoreTransaction(c, call)),
  'budgets.get': (c, call) => okReply(call.route, getBudget(c, call.params.month)),
  'budgets.put': (c, call) => okReply(call.route, putBudget(c, call)),
  'commands.status': (c, call) => okReply(call.route, { statuses: lookupStatuses(c, commandIdsOf(call.body)) }),
  'sync.changes': (c, call) => okReply(call.route, syncChanges(c, call.query)),
}
