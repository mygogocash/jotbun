import type { Pool } from 'pg';
import { ConfigurationError } from '../common/configuration-error';

export const GROUP_ROLES = ['gogospend_app', 'gogospend_bootstrap', 'gogospend_jobs', 'gogospend_security', 'gogospend_leased_read', 'gogospend_erasure_registry'] as const;
export type GroupRole = (typeof GROUP_ROLES)[number];

/**
 * Startup check for a connection: the login's role memberships - direct or
 * through other roles, inheriting or not (a non-inheriting member can still
 * SET ROLE) - are exactly `roles`, and it is not a superuser, BYPASSRLS or
 * CREATEROLE role or (a member of) a table owner. `setting` names the
 * variable to fix; `message` replaces the default error text.
 */
export async function assertLoginRoles(pool: Pool, roles: readonly GroupRole[], setting: string, message?: string): Promise<void> {
  const { rows } = await pool.query<{ ok: boolean }>(
    `WITH RECURSIVE member_of(oid) AS (
       SELECT m.roleid FROM pg_auth_members m WHERE m.member = (SELECT oid FROM pg_roles WHERE rolname = current_user)
       UNION
       SELECT m.roleid FROM pg_auth_members m JOIN member_of ON m.member = member_of.oid
     )
     SELECT NOT r.rolsuper AND NOT r.rolbypassrls AND NOT r.rolcreaterole
            AND NOT EXISTS (SELECT 1 FROM pg_tables t WHERE t.schemaname = 'public' AND pg_has_role(current_user, t.tableowner, 'MEMBER'))
            AND (SELECT coalesce(array_agg(g.rolname::text ORDER BY g.rolname), '{}') FROM pg_roles g WHERE g.oid IN (SELECT oid FROM member_of))
                = (SELECT array_agg(x ORDER BY x) FROM unnest($1::text[]) AS x) AS ok
       FROM pg_roles r WHERE r.rolname = current_user`,
    [roles],
  );
  if (!rows[0]?.ok) throw new ConfigurationError(message ?? `${setting} must use a login that is a member of ${roles.join(' and ')} only.`);
}
