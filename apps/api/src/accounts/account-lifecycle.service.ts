import { Injectable } from '@nestjs/common';
import type { MeDto, SessionContext } from '@gogospend/contracts';

import { DatabaseService } from '../database/database.service';
import { PolicyService } from '../policies/policy.service';

/** The signed-in account's own summary for `GET /v1/me`; no tokens or bindings. */
@Injectable()
export class AccountLifecycleService {
  constructor(
    private readonly db: DatabaseService,
    private readonly policies: PolicyService,
  ) {}

  describe(ctx: SessionContext): Promise<MeDto> {
    return this.db.withOwnerTransaction(ctx, async (tx) => {
      const [account] = await tx.query<{ id: string; status: MeDto['status'] }>('SELECT id, status FROM accounts WHERE id = $1', [ctx.accountId]);
      return {
        account_id: account.id,
        status: account.status,
        pending_policies: await this.policies.pending(tx),
        privacy: await this.policies.privacy(tx),
      };
    });
  }
}
