import { defineConfig, mergeConfig } from 'vitest/config'

import base from './vitest.db.config.ts'

// LOCAL TWIN, never committed (1B-T12 fix planner): the db config plus the setup file that replaces the
// PostgreSQL and NestJS side (test/twin-mocks.ts). Select the test file on the command line.
export default mergeConfig(
  base,
  defineConfig({
    test: { setupFiles: ['test/twin-mocks.ts'] },
  }),
)
