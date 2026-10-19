// The lockfile carries the Linux native bindings (owner decision §7.2, 19
// October 2026). The API workspace's nested native packages - @swc/core (the
// build), unrs-resolver (Jest 30's resolver) and sharp (P2b's image child) -
// each need a prebuilt binding for the platform. The lockfile once recorded
// only the darwin-arm64 ones, so `npm ci` on Linux installed none and the
// Docker build and CI fetched them with a helper script. Now `npm ci` installs
// them on Linux glibc, x64 and arm64, verified against the integrity recorded
// here. npm keeps these entries when the lockfile is rewritten on macOS; this
// test fails if they are ever lost.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const lock = JSON.parse(readFileSync(`${ROOT}package-lock.json`, 'utf8'));
const NEST = 'apps/api/node_modules/';

/** parent package -> the Linux glibc bindings it names, as `name` and the binding's version taken from the parent's optionalDependencies. */
const PARENTS = {
  '@swc/core': ['@swc/core-linux-x64-gnu', '@swc/core-linux-arm64-gnu'],
  'unrs-resolver': ['@unrs/resolver-binding-linux-x64-gnu', '@unrs/resolver-binding-linux-arm64-gnu'],
  sharp: ['@img/sharp-linux-x64', '@img/sharp-linux-arm64'],
  '@img/sharp-linux-x64': ['@img/sharp-libvips-linux-x64'],
  '@img/sharp-linux-arm64': ['@img/sharp-libvips-linux-arm64'],
};

test('every nested native package has its Linux glibc bindings, x64 and arm64, pinned with integrity', () => {
  const missing = [];
  for (const [parent, bindings] of Object.entries(PARENTS)) {
    const owner = lock.packages[`${NEST}${parent}`];
    assert.ok(owner, `${parent} is in the API workspace's node_modules`);
    for (const name of bindings) {
      const entry = lock.packages[`${NEST}${name}`];
      if (!entry) {
        missing.push(name);
        continue;
      }
      assert.equal(entry.version, owner.optionalDependencies?.[name], `${name} is the version ${parent} names`);
      assert.deepEqual(entry.os, ['linux'], name);
      assert.deepEqual(entry.libc, ['glibc'], name);
      assert.equal(entry.optional, true, name);
      assert.match(entry.resolved ?? '', /^https:\/\/registry\.npmjs\.org\//, name);
      assert.match(entry.integrity ?? '', /^sha512-[A-Za-z0-9+/]{86}==$/, name);
    }
  }
  assert.deepEqual(missing, []);
});

test('the Docker build and CI install them with npm ci alone: no helper fetches bindings any more', () => {
  const dockerfile = readFileSync(`${ROOT}apps/api/Dockerfile`, 'utf8');
  const workflow = readFileSync(`${ROOT}.github/workflows/backend.yml`, 'utf8');
  for (const text of [dockerfile, workflow]) assert.doesNotMatch(text, /linux-native-bindings/);
});
