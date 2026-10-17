import type { SessionContext } from '@gogospend/contracts';

import { ProblemException } from '../common/api-problem.filter';
import type { AccountState, OwnerTx } from '../database/owner-transaction';

/**
 * Re-checks, under the account lock, what the access guard saw before it:
 * the account is still active, its session generation is unchanged (no
 * global logout since) and this binding is still unrevoked and unexpired.
 * A request that waited behind a logout or deletion therefore writes nothing.
 */
export async function assertActiveSession(tx: OwnerTx, ctx: SessionContext, state: AccountState): Promise<void> {
  if (state.status !== 'active') throw new ProblemException(403, 'ACCOUNT_UNAVAILABLE');
  if (state.sessionGeneration !== ctx.sessionGeneration) throw new ProblemException(401, 'SESSION_REQUIRED');
  const [row] = await tx.query<{ active: boolean }>('SELECT gogospend_session_is_active($1) AS active', [ctx.bindingId]);
  if (!row?.active) throw new ProblemException(401, 'SESSION_REQUIRED');
}
