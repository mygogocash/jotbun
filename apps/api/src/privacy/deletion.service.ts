import { Inject, Injectable } from '@nestjs/common';
import { isUuid } from '@gogospend/contracts';
import type { ApiIdentity, DeletionAccepted, DeletionReceipt, DeletionReceiptStatus, SessionContext } from '@gogospend/contracts';
import type { Pool } from 'pg';

import { assertActiveSession } from '../accounts/active-session';
import { sha256 } from '../auth/oidc-proof-verifier';
import { authorizePurpose } from '../auth/reauthentication.service';
import { derivedUuid } from '../commands/derived-id';
import { ProblemException } from '../common/api-problem.filter';
import { DatabaseService, PG_POOL } from '../database/database.service';
import { lockAccount } from '../database/owner-transaction';

/**
 * P5 account deletion, API side. `request` is a lifecycle transition, not an
 * M1 command (nothing is synced for an account that is going away): under
 * the common account lock it re-checks this session, consumes a fresh
 * `deletion` proof bound to the command id, and in the same transaction
 * (gogospend_request_deletion) marks the account deleting, moves both
 * generations, revokes every binding, holds every alias, cancels every
 * publisher and records the request and its account_deletion job. A request
 * that waited behind it on the lock writes nothing. Everything destructive
 * happens later in the deletion worker, which needs no further login.
 *
 * A retry after a lost acceptance finds its binding dead (401
 * SESSION_REQUIRED); only the initiating device can then learn the outcome
 * through `receipt` (its old binding, principal, client and the command id).
 */
@Injectable()
export class DeletionService {
  constructor(
    private readonly db: DatabaseService,
    @Inject(PG_POOL) private readonly pool: Pool,
  ) {}

  request(ctx: SessionContext, proofId: string, commandId: string): Promise<DeletionAccepted> {
    return this.db.withOwnerTransaction(ctx, async (tx) => {
      const state = await lockAccount(tx, ctx.accountId);
      await assertActiveSession(tx, ctx, state);
      await authorizePurpose(tx, ctx, proofId, commandId, 'deletion');
      // Derived from the account and command, so no other account's request or job id.
      const requestId = derivedUuid(ctx.accountId, 'deletion-request', commandId);
      const [row] = await tx.query<{ outcome: string }>('SELECT gogospend_request_deletion($1, $2, $3) AS outcome', [requestId, commandId, ctx.bindingId]);
      if (row?.outcome !== 'accepted') throw new ProblemException(403, 'ACCOUNT_UNAVAILABLE');
      return { request_id: requestId, status: 'accepted' as const };
    });
  }

  /** The initiating device's request with this command id, or null (any other caller, binding or command). */
  async receipt(identity: ApiIdentity, binding: string, commandId: string): Promise<DeletionReceipt | null> {
    if (!isUuid(commandId)) return null;
    const { rows } = await this.pool.query<{ request_id: string; status: DeletionReceiptStatus }>(
      'SELECT request_id, status FROM gogospend_deletion_receipt($1, $2, $3, $4, $5)',
      [sha256(binding), identity.issuer, identity.subject, identity.clientId, commandId],
    );
    const row = rows[0];
    return row ? { request_id: row.request_id, status: row.status } : null;
  }
}
