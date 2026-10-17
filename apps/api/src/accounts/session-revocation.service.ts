import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import type { GlobalLogoutResult, SessionContext } from '@gogospend/contracts';

import { authorizePurpose } from '../auth/reauthentication.service';
import { ProblemException } from '../common/api-problem.filter';
import { DatabaseService } from '../database/database.service';
import { lockAccount } from '../database/owner-transaction';
import { assertActiveSession } from './active-session';

/**
 * Sign-out. `revokeCurrent` ends this device's binding. `revokeAll` ("sign
 * out of GoGoSpend everywhere") needs a fresh global_logout proof. Under the
 * common account lock it:
 * - increments the session generation and sets `reauth_after`;
 * - revokes every binding;
 * - holds new sign-ins for every alias;
 * - queues the Auth0 cleanup job.
 * Old sessions die immediately, even with an unexpired Auth0 JWT; new ones
 * wait for the hold to clear. This does not sign the user out of
 * Google/Apple.
 */
@Injectable()
export class SessionRevocationService {
  constructor(private readonly db: DatabaseService) {}

  revokeAll(ctx: SessionContext, proofId: string, commandId: string): Promise<GlobalLogoutResult> {
    return this.db.withOwnerTransaction(ctx, async (tx) => {
      const state = await lockAccount(tx, ctx.accountId);
      await assertActiveSession(tx, ctx, state);
      await authorizePurpose(tx, ctx, proofId, commandId, 'global_logout');
      const [row] = await tx.query<{ session_generation: number }>('SELECT session_generation FROM gogospend_global_logout($1)', [randomUUID()]);
      if (!row) throw new ProblemException(403, 'ACCOUNT_UNAVAILABLE');
      return { generation: row.session_generation, provider_cleanup: 'pending' as const };
    });
  }

  async revokeCurrent(ctx: SessionContext): Promise<void> {
    await this.db.withOwnerTransaction(ctx, async (tx) => {
      await lockAccount(tx, ctx.accountId);
      await tx.query('SELECT gogospend_revoke_session($1)', [ctx.bindingId]);
    });
  }
}
