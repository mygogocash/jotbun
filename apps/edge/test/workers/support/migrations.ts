import { drizzle } from 'drizzle-orm/durable-sqlite'
import { migrate } from 'drizzle-orm/durable-sqlite/migrator'

import { VAULT_MIGRATIONS } from '../../../src/vault/migrations'

/**
 * Puts a vault back in the shape it had before one migration: deletes all of its
 * storage, then applies the journal entries before the one whose tag ends with
 * `suffix`. Seed rows with SQL, then `migrate(drizzle(state.storage),
 * VAULT_MIGRATIONS)` applies that migration and every later one, as a wake does.
 * The suffix, not the number, names the migration, so the integrator's number
 * does not matter.
 */
export async function migrateBefore(state: DurableObjectState, suffix: string): Promise<void> {
  const entries = VAULT_MIGRATIONS.journal.entries
  const at = entries.findIndex((entry) => entry.tag.endsWith(suffix))
  if (at < 1) throw new Error(`no migration after the first has a tag ending in ${suffix}`)
  await state.storage.deleteAll()
  await migrate(drizzle(state.storage), { journal: { entries: entries.slice(0, at) }, migrations: VAULT_MIGRATIONS.migrations })
}
