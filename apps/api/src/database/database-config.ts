import type { PoolConfig } from 'pg';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);
const DEFAULT_POOL_MAX = 10;
const POOL_MAX_LIMIT = 50;

export function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTS.has(host);
}

/**
 * Builds a pg config from a postgres:// URL. Query parameters (sslmode etc.)
 * are ignored on purpose: a non-loopback host always gets TLS with certificate
 * verification, so a URL can never downgrade it. Errors never echo the URL,
 * which contains the password.
 */
export function poolConfigFromUrl(databaseUrl: string | undefined, poolMax = DEFAULT_POOL_MAX): PoolConfig {
  if (!databaseUrl) throw new Error('Database URL is not configured.');
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error('Database URL is not a valid URL.');
  }
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new Error('Database URL must use the postgres:// scheme.');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!host || !database) throw new Error('Database URL needs a host and a database name.');
  return {
    host,
    port: url.port ? Number(url.port) : 5432,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
    ssl: isLoopbackHost(host) ? false : { rejectUnauthorized: true, servername: host },
    max: poolMax,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    application_name: 'gogospend-api',
  };
}

/** `DATABASE_POOL_MAX`, bounded to 1–50; anything else uses the default. */
export function poolMaxFromEnv(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= POOL_MAX_LIMIT ? parsed : DEFAULT_POOL_MAX;
}
