import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import * as contracts from '@gogospend/contracts';
import { AI_MIN_CLIENT_VERSION, CURRENCY_MIN_CLIENT_VERSION, compareVersions } from '@gogospend/contracts';

// Phase 5's contract changes (currencies, looks, icons and pack keys, P5-T2)
// reach only builds at or above CURRENCY_MIN_CLIENT_VERSION (C5, X20), so this
// build's own version is never below it, and no other minimum shares it.
const appJson = JSON.parse(readFileSync(new URL('../../app.json', import.meta.url), 'utf8')) as { expo: { version: string } };

test("this build is at least the minimum client version, which is above P3's and shared with no other", () => {
  assert.equal(CURRENCY_MIN_CLIENT_VERSION, '0.3.0');
  assert.ok(compareVersions(appJson.expo.version, CURRENCY_MIN_CLIENT_VERSION) >= 0, `app.json's expo.version ${appJson.expo.version} is below ${CURRENCY_MIN_CLIENT_VERSION}`);
  assert.equal(compareVersions(CURRENCY_MIN_CLIENT_VERSION, AI_MIN_CLIENT_VERSION), 1);
  const minimums = Object.entries(contracts).filter(([name]) => name.endsWith('_MIN_CLIENT_VERSION'));
  assert.ok(minimums.some(([name]) => name === 'AI_MIN_CLIENT_VERSION'), 'the other minimums are found');
  assert.deepEqual(minimums.filter(([name, value]) => name !== 'CURRENCY_MIN_CLIENT_VERSION' && value === CURRENCY_MIN_CLIENT_VERSION), []);
});
