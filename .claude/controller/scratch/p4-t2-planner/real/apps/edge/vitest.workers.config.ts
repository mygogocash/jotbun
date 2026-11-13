import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin'
import { defineConfig, mergeConfig } from 'vitest/config'

import { apiSeams, apiSeamsConfig } from './api-seams.ts'

// Workers-runtime tests: the vault's Durable Object and its SQLite storage run
// in workerd through Miniflare, as they run deployed. The bindings are the one
// Worker's (wrangler.jsonc), with the vault's module as `main` so the tests
// never load TanStack Start's entry (B15). The bindings below are synthetic;
// no cloud resource is touched.
export default mergeConfig(
  apiSeamsConfig,
  defineConfig({
    plugins: [
      apiSeams(),
      cloudflareTest(async () => {
        // readD1Migrations is a Node helper (the same package's main export).
        // The paths are relative to apps/edge, which is the workers test cwd.
        const authMigrations = await readD1Migrations('./migrations/auth')
        const erasureMigrations = await readD1Migrations('./migrations/erasure')
        const catalogMigrations = await readD1Migrations('./migrations/catalog')
        return {
          main: './src/vault-worker.ts',
          wrangler: { configPath: './wrangler.jsonc' },
          miniflare: {
            // AUTH_DB, ERASURE_DB and CATALOG_DB come from wrangler.jsonc; the reference database is the tests' own.
            d1Databases: ['AUTH_DB_REFERENCE'],
            bindings: {
              JOTBUN_ENV: 'test',
              COMMAND_DIGEST_KEY: 'synthetic-command-digest-key-0123456789abcdef',
              MIN_CLIENT_VERSION_IOS: '1.0.0',
              MIN_CLIENT_VERSION_ANDROID: '1.0.0',
              AUTH_BASE_URL: 'http://auth.test',
              AUTH_ISSUER: 'http://auth.test',
              AUTH_AUDIENCE: 'jotbun-v1',
              AUTH_TRUSTED_ORIGINS: 'gogospend://',
              BETTER_AUTH_SECRET: 'synthetic-better-auth-secret-0123456789abcdef',
              ERASURE_KEY: 'synthetic-erasure-key-0123456789abcdef0123',
              TEST_AUTH_MIGRATIONS: authMigrations,
              TEST_ERASURE_MIGRATIONS: erasureMigrations,
              TEST_CATALOG_MIGRATIONS: catalogMigrations,
            },
          },
        }
      }),
    ],
    test: {
      include: ['test/workers/**/*.test.ts'],
      setupFiles: ['test/workers/auth/support/apply-auth-migrations.ts', 'test/workers/support/apply-catalog-migrations.ts'],
    },
  }),
)
