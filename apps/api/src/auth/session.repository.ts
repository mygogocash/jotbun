import { Inject, Injectable } from '@nestjs/common';
import type { ApiIdentity, SessionContext } from '@gogospend/contracts';
import type { Pool } from 'pg';

import { PG_POOL } from '../database/database.service';
import type { SessionResolver } from './application-session.guard';
import { sha256 } from './oidc-proof-verifier';

/**
 * Resolves an opaque binding through `gogospend_resolve_session`, which
 * checks, in one statement:
 * - the binding belongs to this verified principal and client;
 * - it is neither revoked nor expired (7-day idle, 30-day absolute), and was
 *   used within 5 minutes of being issued;
 * - the account is active, its session generation is unchanged and the
 *   principal is not blocked.
 * Only the binding's SHA-256 digest is stored or sent to the database.
 */
@Injectable()
export class SqlSessionResolver implements SessionResolver {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async resolve(identity: ApiIdentity, binding: string): Promise<SessionContext | null> {
    const { rows } = await this.pool.query<{ session_id: string; account_id: string; session_generation: number }>(
      'SELECT session_id, account_id, session_generation FROM gogospend_resolve_session($1, $2, $3, $4)',
      [sha256(binding), identity.issuer, identity.subject, identity.clientId],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      accountId: row.account_id,
      subject: identity.subject,
      clientId: identity.clientId,
      bindingId: row.session_id,
      sessionGeneration: row.session_generation,
    };
  }
}
