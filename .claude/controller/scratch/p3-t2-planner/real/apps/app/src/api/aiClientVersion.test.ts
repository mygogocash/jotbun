import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { AI_MIN_CLIENT_VERSION, compareVersions } from '@gogospend/contracts';

// P3's contract changes (a record's source first, P3-T2) reach only builds at or
// above AI_MIN_CLIENT_VERSION, so this build's own version is never below it (C5).
const appJson = JSON.parse(readFileSync(new URL('../../app.json', import.meta.url), 'utf8')) as { expo: { version: string } };

test('this build is at least the minimum client version', () => {
  assert.equal(AI_MIN_CLIENT_VERSION, '0.2.0');
  assert.ok(compareVersions(appJson.expo.version, AI_MIN_CLIENT_VERSION) >= 0, `app.json's expo.version ${appJson.expo.version} is below ${AI_MIN_CLIENT_VERSION}`);
});
