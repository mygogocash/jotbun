import { cloudflareTest } from '@cloudflare/vitest-plugin'
import { defineConfig, mergeConfig } from 'vitest/config'

import { apiSeams, apiSeamsConfig } from './api-seams.ts'

// Workers-runtime tests: the vault's Durable Object and its SQLite storage run
// in workerd through Miniflare, as they run deployed. The bindings below are
// synthetic; no cloud resource is touched.
export default mergeConfig(
  apiSeamsConfig,
  defineConfig({
    plugins: [
      apiSeams(),
      cloudflareTest({
        wrangler: { configPath: './wrangler.vault.jsonc' },
        miniflare: {
          bindings: {
            JOTBUN_ENV: 'test',
            COMMAND_DIGEST_KEY: 'synthetic-command-digest-key-0123456789abcdef',
            MIN_CLIENT_VERSION_IOS: '1.0.0',
            MIN_CLIENT_VERSION_ANDROID: '1.0.0',
          },
        },
      }),
    ],
    test: {
      include: ['test/workers/**/*.test.ts'],
    },
  }),
)
