import { isBudgetSnapshot, isCategorySnapshot, isExportRequestSnapshot, isImportReviewSnapshot, isImportSelectionSnapshot, isTransactionSnapshot, isWalletSnapshot } from '@gogospend/contracts'
import type { CommandOutcome } from '@gogospend/contracts'

import { ATTACHMENT_REMOVE_KIND, ATTACHMENT_REPLACE_KIND, ATTACHMENT_RETAIN_KIND } from '@api/attachments/attachments.service'
import { CommandRegistry } from '@api/commands/command-registry'
import { CONFIRM_KIND, FREEZE_KIND, PATCH_KIND, REVIEW_ENTITY, SELECTION_ENTITY } from '@api/imports/confirmation.service'

import { EXPORT_ENTITY, EXPORT_REQUEST_KIND } from '../files/exports'

const WALLET_COMMANDS: [string, CommandOutcome][] = [
  ['wallet.create', 'created'],
  ['wallet.update', 'updated'],
  ['wallet.archive', 'archived'],
  ['wallet.unarchive', 'unarchived'],
]

const CATEGORY_COMMANDS: [string, CommandOutcome][] = [
  ['category.seed_builtins', 'created'],
  ['category.create', 'created'],
  ['category.update', 'updated'],
  ['category.archive', 'archived'],
  ['category.unarchive', 'unarchived'],
]

const TRANSACTION_COMMANDS: [string, CommandOutcome][] = [
  ['transaction.create', 'created'],
  ['transaction.update', 'updated'],
  ['transaction.delete', 'deleted'],
  ['transaction.restore', 'restored'],
]

const BUDGET_COMMANDS: [string, CommandOutcome][] = [
  ['budget.create', 'created'],
  ['budget.replace', 'updated'],
]

/**
 * The entities and command kinds this vault serves, with the same kind, entity,
 * outcome, schema versions and policy as the API's services define them, in the
 * order buildContainer constructs them. Each later task of Phase 1A adds its own
 * block. The vault builds the registry once per instance (UserVault#built).
 */
export function buildVaultRegistry(): CommandRegistry {
  const registry = new CommandRegistry()
  registry.defineEntity({ entity: 'wallet', validate: isWalletSnapshot })
  for (const [kind, outcome] of WALLET_COMMANDS) registry.defineCommand({ kind, entity: 'wallet', outcome, schemaVersions: [1], policy: 'current' })
  registry.defineEntity({ entity: 'category', validate: isCategorySnapshot })
  for (const [kind, outcome] of CATEGORY_COMMANDS) registry.defineCommand({ kind, entity: 'category', outcome, schemaVersions: [1], policy: 'current' })
  registry.defineEntity({ entity: 'transaction', validate: isTransactionSnapshot })
  for (const [kind, outcome] of TRANSACTION_COMMANDS) registry.defineCommand({ kind, entity: 'transaction', outcome, schemaVersions: [1], policy: 'current' })
  registry.defineEntity({ entity: 'budget', validate: isBudgetSnapshot })
  for (const [kind, outcome] of BUDGET_COMMANDS) registry.defineCommand({ kind, entity: 'budget', outcome, schemaVersions: [1], policy: 'current' })
  // 1B-T6: an export request (ExportService), policy-exempt. buildContainer constructs ExportService after budgets and before attachments (1B-T9).
  registry.defineEntity({ entity: EXPORT_ENTITY, validate: isExportRequestSnapshot })
  registry.defineCommand({ kind: EXPORT_REQUEST_KIND, entity: EXPORT_ENTITY, outcome: 'accepted', schemaVersions: [1], policy: 'exempt' })
  // 1B-T9: the receipt commands (AttachmentService) move the record to its next version, after ExportService as buildContainer constructs them.
  for (const kind of [ATTACHMENT_RETAIN_KIND, ATTACHMENT_REPLACE_KIND, ATTACHMENT_REMOVE_KIND]) registry.defineCommand({ kind, entity: 'transaction', outcome: 'updated', schemaVersions: [1], policy: 'current' })
  // 1B-T10: import review and confirmation (ConfirmationService), after AttachmentService as buildContainer constructs them.
  registry.defineEntity({ entity: REVIEW_ENTITY, validate: isImportReviewSnapshot })
  registry.defineEntity({ entity: SELECTION_ENTITY, validate: isImportSelectionSnapshot })
  registry.defineCommand({ kind: PATCH_KIND, entity: REVIEW_ENTITY, outcome: 'updated', schemaVersions: [1], policy: 'current' })
  registry.defineCommand({ kind: FREEZE_KIND, entity: SELECTION_ENTITY, outcome: 'created', schemaVersions: [1], policy: 'current' })
  registry.defineCommand({ kind: CONFIRM_KIND, entity: SELECTION_ENTITY, outcome: 'updated', schemaVersions: [1], policy: 'current' })
  return registry
}
