import { defineConfig, mergeConfig } from 'vitest/config'

import { apiSeams, apiSeamsConfig } from './api-seams.ts'

// Integration tests against the local PostgreSQL 17 container (npm run
// db:v1:up). Each suite gets a disposable database from the API's harness.
export default mergeConfig(
  apiSeamsConfig,
  defineConfig({
    plugins: [apiSeams()],
    test: {
      environment: 'node',
      include: ['test/**/*.db.test.ts'],
      testTimeout: 30_000,
      hookTimeout: 120_000,
      fileParallelism: false,
    },
  }),
)
