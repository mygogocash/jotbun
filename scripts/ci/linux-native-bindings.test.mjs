// P6b: the Linux binding pins must match the lockfile (a dependency bump
// that forgets them fails here, on any OS), and nothing installs off Linux.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { BINDINGS, checkPins, main } from './linux-native-bindings.mjs';

const lock = JSON.parse(readFileSync(fileURLToPath(new URL('../../package-lock.json', import.meta.url)), 'utf8'));

test('every pinned binding matches the version its lockfile parent names', () => {
  assert.deepEqual(checkPins(lock), []);
  for (const { packages } of Object.values(BINDINGS)) {
    assert.deepEqual(packages.map((pkg) => pkg.cpu).sort(), packages.length === 4 ? ['arm64', 'arm64', 'x64', 'x64'] : ['arm64', 'x64']);
  }
});

test('a bumped parent without updated pins is reported', () => {
  const bumped = structuredClone(lock);
  bumped.packages['apps/api/node_modules/@swc/core'].optionalDependencies['@swc/core-linux-x64-gnu'] = '9.9.9';
  assert.deepEqual(checkPins(bumped), ['swc: @swc/core-linux-x64-gnu pinned 1.16.18, lockfile parent wants 9.9.9']);
});

test('unknown groups are refused', () => {
  assert.equal(main(['everything']), 2);
});
