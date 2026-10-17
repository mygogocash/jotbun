import { timingSafeEqual } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ContractValidationError, isUuid } from '@gogospend/contracts';
import type { CommandAck, CommandInput, EntityChange, SessionContext } from '@gogospend/contracts';

import { assertActiveSession } from '../accounts/active-session';
import { assertPolicyAccepted } from '../auth/application-session.guard';
import { ProblemException } from '../common/api-problem.filter';
import { DatabaseService } from '../database/database.service';
import { lockAccount } from '../database/owner-transaction';
import type { OwnerTx } from '../database/owner-transaction';
import { PolicyService } from '../policies/policy.service';
import { ChangeWriter } from '../sync/change-writer';
import { commandDigest } from './command-digest';
import { CommandReceiptRepository } from './command-receipts.repository';
import { CommandRegistry } from './command-registry';
import type { CommandDefinition } from './command-registry';

/** Short codes only (e.g. a correction reason); never amounts, notes or names. */
export type AuditMetadata = Readonly<Record<string, string>>;

export type MutationResult = { entityId: string; version: number; changes: readonly EntityChange[]; audit?: AuditMetadata };

const AUDIT_KEY = /^[a-z][a-z0-9_]{0,31}$/;
const AUDIT_VALUE = /^[a-z0-9][a-z0-9_.-]{0,63}$/;

function auditMetadata(audit: AuditMetadata | undefined): Record<string, string> {
  const entries = Object.entries(audit ?? {});
  if (entries.length > 8 || !entries.every(([key, value]) => AUDIT_KEY.test(key) && typeof value === 'string' && AUDIT_VALUE.test(value))) {
    throw new Error('Audit metadata takes at most 8 short codes.');
  }
  return Object.fromEntries(entries);
}

/** The change in this command's own group that its acknowledgement describes. */
function primaryChange(command: CommandDefinition, result: MutationResult): EntityChange {
  const change = result.changes.find((c) => c.entity === command.entity && c.id === result.entityId && c.version === result.version);
  if (!change) throw new Error(`${command.kind} acknowledged an entity version its change group does not contain.`);
  return change;
}

/**
 * The one transaction protocol for every business write:
 *   1. take the account lock and re-check, under it, that the account is
 *      active and this session is still valid (a request that waited behind a
 *      logout or deletion writes nothing);
 *   2. re-check the current required policies (unless the kind is exempt);
 *   3. replay: a committed command id returns its original acknowledgement;
 *      the same id with different content is 409 IDEMPOTENCY_MISMATCH;
 *   4. refuse an unsupported command schema (422) before reserving anything;
 *   5. run the mutation, then commit its change group under the next account
 *      revision, the receipt and the audit row in the same transaction.
 * Any failure rolls back everything, so a command id is never half-used.
 * Mutations must not publish anything outside this database transaction.
 */
@Injectable()
export class CommandExecutor {
  constructor(
    private readonly db: DatabaseService,
    private readonly registry: CommandRegistry,
    private readonly policies: PolicyService,
    private readonly changes: ChangeWriter,
    private readonly receipts: CommandReceiptRepository,
  ) {}

  run<P>(ctx: SessionContext, input: CommandInput<P>, mutate: (tx: OwnerTx) => Promise<MutationResult>): Promise<CommandAck> {
    const command = this.registry.command(input.kind);
    if (!isUuid(input.commandId)) throw new ContractValidationError('VALIDATION_FAILED', 'Idempotency-Key must be a UUID.', 'idempotency_key');
    const digest = commandDigest(ctx.accountId, input);
    return this.db.withOwnerTransaction(ctx, async (tx) => {
      const state = await lockAccount(tx, ctx.accountId);
      await assertActiveSession(tx, ctx, state);
      if (command.policy === 'current') assertPolicyAccepted(await this.policies.stateIn(tx));

      const existing = await this.receipts.find(tx, input.commandId);
      if (existing) {
        if (!digest || !timingSafeEqual(existing.digest, digest)) throw new ProblemException(409, 'IDEMPOTENCY_MISMATCH');
        return existing.ack;
      }
      if (!digest || !command.schemaVersions.includes(input.schemaVersion)) throw new ProblemException(422, 'COMMAND_SCHEMA_UNSUPPORTED');

      const result = await mutate(tx);
      const primary = primaryChange(command, result);
      const metadata = auditMetadata(result.audit);
      const revision = await this.changes.append(tx, input.commandId, result.changes);
      const ack: CommandAck = {
        command_id: input.commandId,
        entity_id: result.entityId,
        version: result.version,
        committed_revision: revision,
        outcome: command.outcome,
        entity_state: primary.state,
      };
      await this.receipts.insert(tx, { ack, kind: input.kind, schemaVersion: input.schemaVersion, digest, entity: command.entity });
      await tx.query(
        `INSERT INTO audit_events (account_id, revision, command_id, kind, session_id, client_id, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [tx.accountId, revision, input.commandId, input.kind, ctx.bindingId, ctx.clientId, JSON.stringify(metadata)],
      );
      return ack;
    });
  }
}
