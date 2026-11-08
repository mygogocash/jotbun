import { applyD1Migrations } from 'cloudflare:test'
import { env } from 'cloudflare:workers'

// D1 rejects a comment-only file ("SQL code did not contain a statement").
// A migration with no statements is recorded and changes nothing.
function statements(migrations: { name: string; queries: string[] }[]) {
  return migrations.map((migration) => ({
    name: migration.name,
    queries: migration.queries.filter((query) => query.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').trim().length > 0),
  }))
}

// AUTH_DB_REFERENCE stays empty so a test can let Better Auth's own migrator fill it.
await applyD1Migrations(env.AUTH_DB, statements(env.TEST_AUTH_MIGRATIONS))
await applyD1Migrations(env.ERASURE_DB, statements(env.TEST_ERASURE_MIGRATIONS))
