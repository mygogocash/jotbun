import { Inject, Injectable, Optional } from '@nestjs/common';
import { ContractValidationError, POLICY_KINDS } from '@gogospend/contracts';
import type { PolicyKind, PolicyVersionDto, PrivacyPreferences, SessionContext } from '@gogospend/contracts';
import type { Pool } from 'pg';

import { assertActiveSession } from '../accounts/active-session';
import type { PolicyGate, PolicyState } from '../auth/application-session.guard';
import { DatabaseService, PG_POOL } from '../database/database.service';
import { lockAccount } from '../database/owner-transaction';
import type { OwnerTx } from '../database/owner-transaction';

/**
 * Published, versioned policies and per-account consents. Policy text is
 * published by the founder (inserted by a reviewed migration/operation),
 * never invented here. Optional analytics is a separate consent, off by default.
 */
export const POLICY_CACHE_TTL_MS = Symbol('POLICY_CACHE_TTL_MS');

@Injectable()
export class PolicyService implements PolicyGate {
  private cache: { value: PolicyVersionDto[]; until: number } | null = null;

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly db: DatabaseService,
    // Public, unauthenticated reads are served from a short cache so they
    // cannot drive database load; 0 disables it (tests).
    @Optional() @Inject(POLICY_CACHE_TTL_MS) private readonly cacheTtlMs: number = 60_000,
  ) {}

  /** The latest published version of each policy kind (RLS hides unpublished ones). */
  async published(): Promise<PolicyVersionDto[]> {
    if (this.cache && Date.now() < this.cache.until) return this.cache.value;
    const { rows } = await this.pool.query<{ kind: PolicyKind; version: number; required: boolean; published_at: Date; text_th: string; text_en: string }>(
      `SELECT DISTINCT ON (kind) kind, version, required, published_at, text_th, text_en
         FROM policy_versions ORDER BY kind, version DESC`,
    );
    const value = rows.map((row) => ({
      kind: row.kind,
      version: row.version,
      required: row.required,
      published_at: row.published_at.toISOString(),
      text: { th: row.text_th, en: row.text_en },
    }));
    if (this.cacheTtlMs > 0) this.cache = { value, until: Date.now() + this.cacheTtlMs };
    return value;
  }

  /**
   * Kinds whose latest published *required* version this account has not
   * satisfied. Accepting that version or any later one satisfies it, so a
   * non-required revision never blocks. The version to present is the
   * latest published one, which is also the text `published()` serves.
   */
  async pending(tx: OwnerTx): Promise<{ kind: PolicyKind; version: number }[]> {
    return tx.query<{ kind: PolicyKind; version: number }>(
      `WITH latest AS (SELECT DISTINCT ON (kind) kind, version FROM policy_versions ORDER BY kind, version DESC),
            required AS (SELECT kind, max(version) AS version FROM policy_versions WHERE required GROUP BY kind)
       SELECT l.kind, l.version
         FROM required r JOIN latest l ON l.kind = r.kind
        WHERE NOT EXISTS (SELECT 1 FROM consents c
                           WHERE c.account_id = gogospend_current_account() AND c.kind = r.kind AND c.version >= r.version AND c.granted)
        ORDER BY l.kind`,
    );
  }

  /**
   * `unpublished` until a required terms version and a privacy policy are
   * both published: missing configuration is never implicit acceptance, so
   * writes stay closed. (Which kinds must be required is a founder decision;
   * today only terms.)
   */
  async currentPolicyState(session: SessionContext): Promise<PolicyState> {
    return this.db.withOwnerTransaction(session, (tx) => this.stateIn(tx));
  }

  /** The same check inside an existing owner transaction (the command executor, under the account lock). */
  async stateIn(tx: OwnerTx): Promise<PolicyState> {
    const [{ configured }] = await tx.query<{ configured: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM policy_versions WHERE kind = 'terms' AND required)
          AND EXISTS (SELECT 1 FROM policy_versions WHERE kind = 'privacy') AS configured`,
    );
    if (!configured) return 'unpublished';
    return (await this.pending(tx)).length === 0 ? 'accepted' : 'pending';
  }

  /** Records acceptance of a published version; repeating it changes nothing. */
  async accept(ctx: SessionContext, kind: unknown, version: unknown): Promise<void> {
    if (!POLICY_KINDS.includes(kind as PolicyKind)) throw new ContractValidationError('VALIDATION_FAILED', 'Unknown policy kind.', 'kind');
    if (!Number.isSafeInteger(version) || (version as number) < 1) throw new ContractValidationError('VALIDATION_FAILED', 'Invalid policy version.', 'version');
    await this.db.withOwnerTransaction(ctx, async (tx) => {
      await assertActiveSession(tx, ctx, await lockAccount(tx, ctx.accountId));
      const published = await tx.query('SELECT 1 FROM policy_versions WHERE kind = $1 AND version = $2', [kind, version]);
      if (published.length === 0) throw new ContractValidationError('VALIDATION_FAILED', 'That policy version is not published.', 'version');
      await tx.query(
        `INSERT INTO consents (account_id, kind, version, granted) VALUES ($1, $2, $3, true)
         ON CONFLICT (account_id, kind, version) DO NOTHING`,
        [ctx.accountId, kind, version],
      );
    });
  }

  async privacy(tx: OwnerTx): Promise<PrivacyPreferences> {
    const rows = await tx.query<{ granted: boolean }>(`SELECT granted FROM consents WHERE kind = 'analytics' AND version = 0`);
    return { analytics: rows[0]?.granted ?? false };
  }

  async setPrivacy(ctx: SessionContext, analytics: unknown): Promise<PrivacyPreferences> {
    if (typeof analytics !== 'boolean') throw new ContractValidationError('VALIDATION_FAILED', 'analytics must be true or false.', 'analytics');
    return this.db.withOwnerTransaction(ctx, async (tx) => {
      await assertActiveSession(tx, ctx, await lockAccount(tx, ctx.accountId));
      await tx.query(
        `INSERT INTO consents (account_id, kind, version, granted) VALUES ($1, 'analytics', 0, $2)
         ON CONFLICT (account_id, kind, version) DO UPDATE SET granted = EXCLUDED.granted, recorded_at = now()`,
        [ctx.accountId, analytics],
      );
      return { analytics };
    });
  }
}
