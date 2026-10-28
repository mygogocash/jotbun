import { env } from 'cloudflare:workers'
import { getMigrations } from 'better-auth/db/migration'
import { expect, it } from 'vitest'

import { testAuth } from './support/auth-harness'

const BETTER_AUTH_TABLES = ['account', 'jwks', 'passkey', 'rateLimit', 'session', 'user', 'verification']
const rows = async (db: D1Database, sql: string, ...args: unknown[]) => (await db.prepare(sql).bind(...args).all()).results
const tables = async (db: D1Database) => (await rows(db, "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' AND name <> 'd1_migrations' ORDER BY name")).map((r) => r.name)
const columns = async (db: D1Database, table: string) => (await rows(db, `PRAGMA table_info("${table}")`)).map((c) => [c.name, String(c.type).toLowerCase(), c.notnull, c.pk]).sort()
const indexes = async (db: D1Database, table: string) => (await rows(db, "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND name NOT LIKE 'sqlite\\_autoindex%' ESCAPE '\\' ORDER BY name", table)).map((r) => r.name)
const foreignKeys = async (db: D1Database, table: string) => (await rows(db, `PRAGMA foreign_key_list("${table}")`)).map((k) => [k.table, k.from, k.to, k.on_delete]).sort()

it('Better Auth finds nothing to create or add on the migrated AUTH_DB', async () => {
  const { toBeCreated, toBeAdded } = await getMigrations(testAuth().auth.options)
  expect([toBeCreated, toBeAdded]).toEqual([[], []])
})

it('our Better Auth tables equal what its own migrator creates: columns, indexes and foreign keys', async () => {
  await (await getMigrations(testAuth({}, { AUTH_DB: env.AUTH_DB_REFERENCE }).auth.options)).runMigrations()
  expect(await tables(env.AUTH_DB_REFERENCE)).toEqual(BETTER_AUTH_TABLES)
  for (const table of BETTER_AUTH_TABLES) {
    expect(await columns(env.AUTH_DB, table)).toEqual(await columns(env.AUTH_DB_REFERENCE, table))
    expect(await indexes(env.AUTH_DB, table)).toEqual(await indexes(env.AUTH_DB_REFERENCE, table))
    expect(await foreignKeys(env.AUTH_DB, table)).toEqual(await foreignKeys(env.AUTH_DB_REFERENCE, table))
  }
})

it('AUTH_DB holds Better Auth and our account tables; the erasure registry is alone in ERASURE_DB', async () => {
  expect(await tables(env.AUTH_DB)).toEqual([...BETTER_AUTH_TABLES, 'account_status', 'email_code_sends'].sort())
  expect(await tables(env.ERASURE_DB)).toEqual(['erasure_registry'])
})

it('account_status accepts only active, deleting and deleted', async () => {
  await expect(env.AUTH_DB.prepare("INSERT INTO account_status (user_id, status, updated_at) VALUES (?, 'paused', 0)").bind(crypto.randomUUID()).run()).rejects.toThrow(/CHECK/)
})
