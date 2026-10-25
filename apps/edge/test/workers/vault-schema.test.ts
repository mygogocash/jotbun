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
    expect(config.columns.map((c) => [c.name, c.notNull]).sort()).toEqual(pragma.map((p) => [p.name, p.notnull === 1 || p.pk > 0]).sort())
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
