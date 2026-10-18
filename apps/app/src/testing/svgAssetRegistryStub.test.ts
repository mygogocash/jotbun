import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { getAssetByID } from './svgAssetRegistryStub.ts';

const appRoot = fileURLToPath(new URL('../../', import.meta.url));
const STUB = 'src/testing/svgAssetRegistryStub.ts';
const THIS_TEST = 'src/testing/svgAssetRegistryStub.test.ts';

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(name) ? [path] : [];
  });
}

test('the stub registers no assets', () => {
  assert.equal(getAssetByID(1), undefined);
});

test('only the render config reaches the stub: no app, harness or test file imports it', () => {
  const importsStub = /(?:from|import|require)\s*\(?\s*['"][^'"]*svgAssetRegistryStub(?:\.ts)?['"]/;
  const importers = [...sources(join(appRoot, 'src')), ...sources(join(appRoot, 'app'))]
    .map((path) => relative(appRoot, path))
    .filter((path) => path !== STUB && path !== THIS_TEST && importsStub.test(readFileSync(join(appRoot, path), 'utf8')));
  assert.deepEqual(importers, []);
  const config = readFileSync(join(appRoot, 'vitest.render.config.ts'), 'utf8');
  assert.match(config, /'@react-native\/assets-registry\/registry': fileURLToPath\(new URL\('\.\/src\/testing\/svgAssetRegistryStub\.ts'/);
});
