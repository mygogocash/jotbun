import { env } from 'cloudflare:workers'
import { evictAllDurableObjects, runInDurableObject } from 'cloudflare:test'
import { getTableConfig } from 'drizzle-orm/sqlite-core'
import { expect, it } from 'vitest'

import { VAULT_CORE_TABLES, vaultSchema } from '../../src/vault/schema'

const vault = (name = crypto.randomUUID()) => env.VAULT.get(env.VAULT.idFromName(name))
const sql = (stub: DurableObjectStub, query: string, ...args: unknown[]) =>
  runInDurableObject(stub, (_v, state) => state.storage.sql.exec(query, ...args).toArray())
const USER_TABLES = "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' AND name <> '__drizzle_migrations' ORDER BY name"

it('a new vault has every core table, migrated once', async () => {
  const stub = vault()
  expect((await sql(stub, USER_TABLES)).map((r) => r.name)).toEqual([...VAULT_CORE_TABLES])
  expect(VAULT_CORE_TABLES).toEqual(['account_state', 'audit_events', 'budget_category_limits', 'categories', 'command_receipts', 'consents', 'entity_changes', 'entity_heads', 'monthly_budgets', 'revoked_sessions', 'schedule', 'sync_state', 'transactions', 'wallets'])
  expect((await sql(stub, 'SELECT count(*) AS n FROM __drizzle_migrations'))[0].n).toBe(1)
})

it('a vault keeps its rows and does not migrate again after it sleeps', async () => {
  const name = crypto.randomUUID()
  await sql(vault(name), "INSERT INTO consents (kind, version, granted, updated_at) VALUES ('analytics', 0, 1, '2026-10-25T00:00:00.000Z')")
  await evictAllDurableObjects()
  expect(await sql(vault(name), 'SELECT kind, granted FROM consents')).toEqual([{ kind: 'analytics', granted: 1 }])
  expect((await sql(vault(name), 'SELECT count(*) AS n FROM __drizzle_migrations'))[0].n).toBe(1)
})

it('the Drizzle schema matches the migrated tables column for column', async () => {
  const stub = vault()
  for (const table of Object.values(vaultSchema)) {
    const config = getTableConfig(table)
    const pragma = await sql(stub, `PRAGMA table_info(${config.name})`)
    expect(config.columns.map((c) => [c.name, c.notNull]).sort()).toEqual(pragma.map((p) => [p.name, p.notnull === 1 || (p.pk > 0 && p.type === 'INTEGER')]).sort())
  }
})

it('foreign keys hold: a transaction naming an unknown wallet is refused', async () => {
  await expect(sql(vault(), "INSERT INTO transactions (id, type, amount_minor, occurred_on, wallet_id, category_id, version, created_at, updated_at) VALUES (?, 'expense', 100, '2026-10-20', ?, ?, 1, 'x', 'x')", crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID())).rejects.toThrow(/FOREIGN KEY/)
})

it('command log rows must use the current revision, and entity heads only move forward', async () => {
  const stub = vault()
  await sql(stub, 'INSERT INTO sync_state (id, revision, pruned_through) VALUES (1, 1, 0)')
  await expect(sql(stub, "INSERT INTO entity_changes (revision, ordinal, command_id, entity, entity_id, version, state, snapshot, committed_at) VALUES (2, 0, ?, 'wallet', ?, 1, 'active', '{}', 'x')", crypto.randomUUID(), crypto.randomUUID())).rejects.toThrow(/current revision/)
  const id = crypto.randomUUID()
  await sql(stub, "INSERT INTO entity_heads (entity, entity_id, version, state, revision) VALUES ('wallet', ?, 1, 'active', 1)", id)
  await expect(sql(stub, "UPDATE entity_heads SET version = 1 WHERE entity_id = ?", id)).rejects.toThrow(/move forward/)
})

it('a primary key cannot be NULL', async () => {
  await expect(sql(vault(), "INSERT INTO wallets (id, name, currency, opening_minor, tracking_start, archived, version, created_at, updated_at) VALUES (NULL, 'Cash', 'THB', 0, '2026-10-01', 0, 1, '2026-10-25T00:00:00.000Z', '2026-10-25T00:00:00.000Z')")).rejects.toThrow(/NOT NULL/)
})

it("a category's type and built-in key never change", async () => {
  const stub = vault()
  const id = crypto.randomUUID()
  await sql(stub, "INSERT INTO categories (id, type, builtin_key, label, color, archived, version, created_at, updated_at) VALUES (?, 'expense', NULL, 'Snacks', NULL, 0, 1, '2026-10-25T00:00:00.000Z', '2026-10-25T00:00:00.000Z')", id)
  await expect(sql(stub, "UPDATE categories SET type = 'income' WHERE id = ?", id)).rejects.toThrow(/immutable/)
  await expect(sql(stub, "UPDATE categories SET builtin_key = 'food' WHERE id = ?", id)).rejects.toThrow(/immutable/)
})

const CATEGORY_COLUMNS = 'id, type, builtin_key, label, color, archived, version, created_at, updated_at'
const CATEGORY_TIME = "'2026-10-25T00:00:00.000Z', '2026-10-25T00:00:00.000Z'"
/** Inserts a custom expense category (or the given type) with the given SQL verb and suffix. */
const insertCategory = (stub: DurableObjectStub, id: string, type = 'expense', verb = 'INSERT', suffix = '') =>
  sql(stub, `${verb} INTO categories (${CATEGORY_COLUMNS}) VALUES (?, ?, NULL, 'Snacks', NULL, 0, 1, ${CATEGORY_TIME})${suffix}`, id, type)

it('a category id never changes', async () => {
  const stub = vault()
  const id = crypto.randomUUID()
  await insertCategory(stub, id)
  await expect(sql(stub, 'UPDATE categories SET id = ? WHERE id = ?', crypto.randomUUID(), id)).rejects.toThrow(/id is immutable/)
  expect(await sql(stub, 'SELECT count(*) AS n FROM categories WHERE id = ?', id)).toEqual([{ n: 1 }])
})

it("a replace that reuses another category's built-in key is refused, and the other category survives", async () => {
  const stub = vault()
  const food = crypto.randomUUID()
  const replacement = crypto.randomUUID()
  await sql(stub, `INSERT INTO categories (${CATEGORY_COLUMNS}) VALUES (?, 'expense', 'food', NULL, NULL, 0, 1, ${CATEGORY_TIME})`, food)
  await expect(sql(stub, `INSERT OR REPLACE INTO categories (${CATEGORY_COLUMNS}) VALUES (?, 'expense', 'food', NULL, NULL, 0, 1, ${CATEGORY_TIME})`, replacement)).rejects.toThrow(/cannot be replaced/)
  expect(await sql(stub, 'SELECT id FROM categories')).toEqual([{ id: food }])
})

it('INSERT OR REPLACE cannot flip a category in use, but an identical ON CONFLICT DO NOTHING insert is allowed', async () => {
  const stub = vault()
  const id = crypto.randomUUID()
  await insertCategory(stub, id, 'expense')
  await expect(insertCategory(stub, id, 'income', 'INSERT OR REPLACE')).rejects.toThrow(/cannot be replaced/)
  await insertCategory(stub, id, 'expense', 'INSERT', ' ON CONFLICT DO NOTHING')
  expect(await sql(stub, 'SELECT type FROM categories WHERE id = ?', id)).toEqual([{ type: 'expense' }])
})

it('a category is never deleted', async () => {
  const stub = vault()
  const id = crypto.randomUUID()
  await insertCategory(stub, id)
  await expect(sql(stub, 'DELETE FROM categories WHERE id = ?', id)).rejects.toThrow(/never deleted/)
  expect(await sql(stub, 'SELECT count(*) AS n FROM categories WHERE id = ?', id)).toEqual([{ n: 1 }])
})

it('a category has a label or a built-in key', async () => {
  await expect(sql(vault(), "INSERT INTO categories (id, type, builtin_key, label, color, archived, version, created_at, updated_at) VALUES (?, 'expense', NULL, NULL, NULL, 0, 1, '2026-10-25T00:00:00.000Z', '2026-10-25T00:00:00.000Z')", crypto.randomUUID())).rejects.toThrow(/CHECK/)
})

it('a receipt can drop its digest pair, but never just one half', async () => {
  const receipt = (stub: DurableObjectStub, digest: string, keyId: string) =>
    sql(stub, `INSERT INTO command_receipts (command_id, kind, schema_version, request_digest, digest_key_id, entity, entity_id, entity_version, outcome, entity_state, revision, committed_at) VALUES (?, 'wallet.create', 1, ${digest}, ${keyId}, 'wallet', ?, 1, 'created', 'active', 1, '2026-10-25T00:00:00.000Z')`, crypto.randomUUID(), crypto.randomUUID())
  const dropped = vault()
  await sql(dropped, 'INSERT INTO sync_state (id, revision, pruned_through) VALUES (1, 1, 0)')
  await receipt(dropped, 'NULL', 'NULL')
  expect(await sql(dropped, 'SELECT count(*) AS n FROM command_receipts')).toEqual([{ n: 1 }])
  const half = vault()
  await sql(half, 'INSERT INTO sync_state (id, revision, pruned_through) VALUES (1, 1, 0)')
  await expect(receipt(half, 'zeroblob(32)', 'NULL')).rejects.toThrow(/digest_pair/)
  await expect(receipt(half, 'NULL', "'k1'")).rejects.toThrow(/digest_pair/)
})
