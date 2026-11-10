import { ContractValidationError, isUuid } from '@gogospend/contracts'
import type { CommandAck, CommandInput, EntityChange } from '@gogospend/contracts'

import type { CommandDefinition } from '@api/commands/command-registry'
import { commandHeaders } from '@api/commands/command-headers'
import { ProblemException } from '@api/common/api-problem.filter'

import type { VaultCall } from '../../v1/protocol'
import { assertPolicyAccepted } from '../policies'
import type { VaultContext } from '../context'
import { touch } from '../files/context'
import { assertSession } from '../session'
import { appendChanges } from './change-log'
import { findReceipt, insertReceipt } from './receipts'

export type AuditMetadata = Readonly<Record<string, string>>
export type VaultMutation = { entityId: string; version: number; changes: readonly EntityChange[]; audit?: AuditMetadata }
export type IfMatchRule = Parameters<typeof commandHeaders>[1]

const AUDIT_KEY = /^[a-z][a-z0-9_]{0,31}$/
const AUDIT_VALUE = /^[a-z0-9][a-z0-9_.-]{0,63}$/

/** Short codes only (a correction reason, never an amount, a note or a name). */
function auditMetadata(audit: AuditMetadata | undefined): Record<string, string> {
  const entries = Object.entries(audit ?? {})
  if (entries.length > 8 || !entries.every(([key, value]) => AUDIT_KEY.test(key) && typeof value === 'string' && AUDIT_VALUE.test(value))) {
    throw new Error('Audit metadata takes at most 8 short codes.')
  }
  return Object.fromEntries(entries)
}

/** The change in this command's own group that its acknowledgement describes. */
function primaryChange(command: CommandDefinition, result: VaultMutation): EntityChange {
  const change = result.changes.find((c) => c.entity === command.entity && c.id === result.entityId && c.version === result.version)
  if (!change) throw new Error(`${command.kind} acknowledged an entity version its change group does not contain.`)
  return change
}

/**
 * The one protocol for every business write, run inside the call's transaction
 * (UserVault#call opens it; runCommand never opens a nested block, R21). The steps are
 * CommandExecutor.run's (apps/api): the target and digest first, then
 *   1. the account and session again, and for a current-policy kind the policy;
 *   2. a committed command id replays its acknowledgement, and the same id with
 *      other content is 409 IDEMPOTENCY_MISMATCH (a receipt with no digest never matches);
 *   3. an unsupported command schema is 422, before anything is written;
 *   4. the mutation, then its change group under the next revision, the
 *      receipt and the audit row.
 * A throw rolls back the whole call, so a command id is never half-used. A
 * command that commits touches the context, so call() rearms the alarm after
 * its block (1B-T11); a replay writes nothing and touches nothing.
 */
export function runCommand<P>(c: VaultContext, input: CommandInput<P>, mutate: () => VaultMutation): CommandAck {
  const command = c.registry.command(input.kind)
  if (!isUuid(input.commandId)) throw new ContractValidationError('VALIDATION_FAILED', 'Idempotency-Key must be a UUID.', 'idempotency_key')
  // Every payload names its primary entity as `id`, so the digest binds the target.
  const targetId = (input.payload as { id?: unknown } | null)?.id
  if (!isUuid(targetId)) throw new Error(`${input.kind} payloads must name their target entity as a UUID "id".`)
  const digest = c.digester.digest(c.claims.accountId, input)

  assertSession(c)
  if (command.policy === 'current') assertPolicyAccepted(c)

  const existing = findReceipt(c, input.commandId)
  if (existing) {
    // A receipt whose digest retention dropped can no longer prove the same request.
    if (!existing.digest || !c.digester.matches(c.claims.accountId, input, existing.digest)) throw new ProblemException(409, 'IDEMPOTENCY_MISMATCH')
    return existing.ack
  }
  if (!digest || !command.schemaVersions.includes(input.schemaVersion)) throw new ProblemException(422, 'COMMAND_SCHEMA_UNSUPPORTED')

  const result = mutate()
  if (result.entityId !== targetId) throw new Error(`${input.kind} acknowledged an entity other than its target.`)
  const primary = primaryChange(command, result)
  const metadata = auditMetadata(result.audit)
  const revision = appendChanges(c, input.commandId, result.changes)
  const ack: CommandAck = {
    command_id: input.commandId,
    entity_id: result.entityId,
    version: result.version,
    committed_revision: revision,
    outcome: command.outcome,
    entity_state: primary.state,
  }
  insertReceipt(c, { ack, kind: input.kind, schemaVersion: input.schemaVersion, digest, entity: command.entity })
  c.sql
    .exec(
      'INSERT INTO audit_events (revision, command_id, kind, session_id, client_id, metadata, created_at) VALUES (CAST(? AS INTEGER), ?, ?, ?, ?, ?, ?)',
      revision,
      input.commandId,
      input.kind,
      c.claims.sessionId,
      c.claims.clientId,
      JSON.stringify(metadata),
      c.now.toISOString(),
    )
    .toArray()
  touch(c)
  return ack
}

/**
 * The command a call makes: its Idempotency-Key, command schema and (per the
 * route's rule) If-Match, read by the API's commandHeaders, with the kind and payload.
 */
export function commandInput(call: VaultCall, kind: string, payload: unknown, ifMatch: IfMatchRule): CommandInput<unknown> {
  return { ...commandHeaders(call.headers, ifMatch), kind, payload }
}
