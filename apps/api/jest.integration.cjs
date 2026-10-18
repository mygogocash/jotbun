// Integration suite (`npm run test:db`): *.integration.spec.ts against a real
// loopback PostgreSQL through src/testing/postgres-harness.ts. Same SWC
// transform as the unit suite, which excludes these files.
const { jest: unit } = require('./package.json');

module.exports = {
  ...unit,
  testRegex: '.*\\.integration\\.spec\\.ts$',
  testPathIgnorePatterns: ['/node_modules/'],
  testTimeout: 30_000,
};
