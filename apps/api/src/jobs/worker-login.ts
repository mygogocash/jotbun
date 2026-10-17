import type { Pool } from 'pg';

export const GROUP_ROLES = ['gogospend_app', 'gogospend_bootstrap', 'gogospend_jobs', 'gogospend_security', 'gogospend_leased_read'] as const;
export type GroupRole = (typeof GROUP_ROLES)[number];

/**
 * Startup check for a worker connection: the login is a member of exactly
 * `roles` among the GoGoSpend group roles, and is not a superuser, a BYPASSRLS
 * role or (a member of) a table owner. `setting` names the variable to fix.
 */
export async function assertLoginRoles(pool: Pool, roles: readonly GroupRole[], setting: string): Promise<void> {
  const { rows } = await pool.query<{ ok: boolean }>(
    `SELECT NOT r.rolsuper AND NOT r.rolbypassrls
            AND NOT EXISTS (SELECT 1 FROM pg_tables t WHERE t.schemaname = 'public' AND pg_has_role(current_user, t.tableowner, 'USAGE'))
            AND (SELECT bool_and(pg_has_role(current_user, g, 'USAGE') = (g = ANY($2::text[]))) FROM unnest($1::text[]) AS g) AS ok
       FROM pg_roles r WHERE r.rolname = current_user`,
    [GROUP_ROLES, roles],
  );
  if (!rows[0]?.ok) throw new Error(`${setting} must use a login that is a member of ${roles.join(' and ')} only.`);
}
