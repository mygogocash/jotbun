import { applyD1Migrations } from 'cloudflare:test'
import { env } from 'cloudflare:workers'

// The catalog database (P4-T2), migrated before every workers test file as
// apply-auth-migrations.ts migrates AUTH_DB: every file in migrations/catalog, the
// draft seed included (vitest.workers.config.ts reads them in Node). D1 rejects a
// query with no statement, so a query of comments alone is dropped.
function statements(migrations: { name: string; queries: string[] }[]) {
  return migrations.map((migration) => ({
    name: migration.name,
    queries: migration.queries.filter((query) => query.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').trim().length > 0),
  }))
}

await applyD1Migrations(env.CATALOG_DB, statements(env.TEST_CATALOG_MIGRATIONS))
