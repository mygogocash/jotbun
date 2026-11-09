import { defineConfig, mergeConfig } from 'vitest/config'

import { apiSeams, apiSeamsConfig } from './api-seams.ts'

// Unit tests: pure modules and the dispatcher with fakes, in Node. The same
// Nest seams as the Worker build, so tests run the code that ships.
export default mergeConfig(
  apiSeamsConfig,
  defineConfig({
    plugins: [apiSeams()],
    test: {
      environment: 'node',
      include: ['test/**/*.test.ts'],
      exclude: ['test/**/*.db.test.ts', 'test/workers/**'],
    },
  }),
)
