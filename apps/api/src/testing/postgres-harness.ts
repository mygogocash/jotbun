// Disposable PostgreSQL databases for *.integration.spec.ts. Each suite gets a
// fresh database plus throwaway login roles, all dropped afterwards. Only a
// loopback server is accepted, so these tests can never reach a hosted or
// production database. An unreachable server fails the suite.
import { randomBytes } from 'node:crypto';

import { Client, Pool } from 'pg';

import { isLoopbackHost, poolConfigFromUrl } from '../database/database-config';
import { runMigrations } from '../database/migrations';

export const GROUP_ROLES = ['gogospend_app', 'gogospend_bootstrap', 'gogospend_jobs', 'gogospend_security', 'gogospend_leased_read', 'gogospend_erasure_registry'] as const;
export type GroupRole = (typeof GROUP_ROLES)[number];

const DEFAULT_ADMIN_URL = 'postgres://gogospend_local_admin:gogospend-local-only@127.0.0.1:55432/postgres';

export type TestDatabase = {
  name: string;
  /** Superuser URL for this database: migrations and fixture seeding only. */
  adminUrl: string;
  /** URL for a fresh login that is a member of exactly `roles`. */
  loginUrl(roles: readonly GroupRole[]): Promise<string>;
  /** Pool for a fresh login that is a member of exactly `roles`. */
  loginPool(roles: readonly GroupRole[], poolMax?: number): Promise<Pool>;
  /** Runs SQL as the superuser (fixtures; bypasses RLS). */
  admin<T>(fn: (client: Client) => Promise<T>): Promise<T>;
  drop(): Promise<void>;
};

function adminServerUrl(): URL {
  const url = new URL(process.env.GOGOSPEND_TEST_ADMIN_URL ?? DEFAULT_ADMIN_URL);
  if (!isLoopbackHost(url.hostname.replace(/^\[|\]$/g, ''))) {
    throw new Error('Refusing a non-loopback test database server.');
  }
  return url;
}

function urlFor(base: URL, database: string, user?: string, password?: string): string {
  const url = new URL(base.href);
  url.pathname = `/${database}`;
  if (user !== undefined) url.username = encodeURIComponent(user);
  if (password !== undefined) url.password = encodeURIComponent(password);
  return url.href;
}

async function withClient<T>(url: string, fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client(poolConfigFromUrl(url, 1));
  // A server-side disconnect emits 'error'. Without a listener Node treats it
  // as an unhandled exception and fails whichever test is running.
  client.on('error', () => undefined);
  try {
    await client.connect();
  } catch {
    throw new Error('Test PostgreSQL is unreachable on 127.0.0.1:55432. Start it with `npm run db:v1:up`.');
  }
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

export async function createTestDatabase(): Promise<TestDatabase> {
  const server = adminServerUrl();
  const name = `gogospend_test_${process.pid}_${randomBytes(4).toString('hex')}`;
  const serverAdminUrl = urlFor(server, server.pathname.replace(/^\//, '') || 'postgres');
  await withClient(serverAdminUrl, (client) => client.query(`CREATE DATABASE ${name}`));
  const adminUrl = urlFor(server, name);
  await runMigrations(adminUrl);

  const logins: string[] = [];
  const pools: Pool[] = [];

  async function loginUrl(roles: readonly GroupRole[]): Promise<string> {
    const login = `gogospend_test_login_${randomBytes(6).toString('hex')}`;
    const password = randomBytes(18).toString('base64url');
    await withClient(adminUrl, async (client) => {
      const create = await client.query<{ statement: string }>(
        `SELECT format('CREATE ROLE %I LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD %L', $1::text, $2::text) AS statement`,
        [login, password],
      );
      await client.query(create.rows[0].statement);
      logins.push(login);
      for (const role of roles) await client.query(`GRANT ${role} TO ${login}`);
      await client.query(`GRANT CONNECT ON DATABASE ${name} TO ${login}`);
    });
    return urlFor(server, name, login, password);
  }

  return {
    name,
    adminUrl,
    loginUrl,
    async loginPool(roles, poolMax = 4) {
      const pool = new Pool(poolConfigFromUrl(await loginUrl(roles), poolMax));
      pool.on('error', () => undefined);
      // A checked-out client is not covered by the pool listener. A disconnect
      // (DROP … FORCE, pg_terminate_backend) must not surface as an unhandled
      // 'error' event; the query promise still rejects.
      const connect = pool.connect.bind(pool) as typeof pool.connect;
      const guarded = new WeakSet<object>();
      pool.connect = ((callback?: Parameters<Pool['connect']>[0]) => {
        if (typeof callback === 'function') return connect(callback);
        return Promise.resolve(connect()).then((client) => {
          if (!guarded.has(client)) {
            guarded.add(client);
            client.on('error', () => undefined);
          }
          return client;
        });
      }) as typeof pool.connect;
      pools.push(pool);
      return pool;
    },
    admin: (fn) => withClient(adminUrl, fn),
    async drop() {
      await Promise.all(pools.map((pool) => pool.end()));
      await withClient(serverAdminUrl, async (client) => {
        await client.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
        for (const login of logins) await client.query(`DROP ROLE IF EXISTS ${login}`);
      });
    },
  };
}
