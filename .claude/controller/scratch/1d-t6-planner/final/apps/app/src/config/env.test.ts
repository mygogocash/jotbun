import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { getMobileEnv } from './env.ts';

const KEYS = ['EXPO_PUBLIC_V1_API_URL', 'EXPO_PUBLIC_POSTHOG_KEY', 'EXPO_PUBLIC_POSTHOG_HOST', 'EXPO_PUBLIC_CRASH_REPORTS_WITHOUT_CONSENT'] as const;
const saved = new Map(KEYS.map((key) => [key, process.env[key]]));
afterEach(() => {
  for (const key of KEYS) {
    const value = saved.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test('PostHog stays off until its project key is set, and goes through the Worker proxy unless told otherwise', () => {
  for (const key of KEYS) delete process.env[key];
  const env = getMobileEnv();
  assert.equal(env.posthogKey, '');
  assert.equal(env.posthogHost, 'http://localhost:8091/ingest');
  process.env.EXPO_PUBLIC_V1_API_URL = 'https://api.jotbun.test/';
  process.env.EXPO_PUBLIC_POSTHOG_KEY = ' phc_project ';
  assert.equal(getMobileEnv().posthogKey, 'phc_project');
  assert.equal(getMobileEnv().posthogHost, 'https://api.jotbun.test/ingest');
  process.env.EXPO_PUBLIC_POSTHOG_HOST = 'https://eu.i.posthog.com';
  assert.equal(getMobileEnv().posthogHost, 'https://eu.i.posthog.com');
});

test('scrubbed crash reports are sent without consent unless the switch says 0', () => {
  delete process.env.EXPO_PUBLIC_CRASH_REPORTS_WITHOUT_CONSENT;
  assert.equal(getMobileEnv().crashReportsWithoutConsent, true);
  process.env.EXPO_PUBLIC_CRASH_REPORTS_WITHOUT_CONSENT = '0';
  assert.equal(getMobileEnv().crashReportsWithoutConsent, false);
  process.env.EXPO_PUBLIC_CRASH_REPORTS_WITHOUT_CONSENT = '1';
  assert.equal(getMobileEnv().crashReportsWithoutConsent, true);
});
