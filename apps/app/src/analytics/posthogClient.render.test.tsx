// The PostHog client (1D-T6's wrapper) with the SDK mocked: remote flags
// (P6B-T14) reach PostHog as pushed, and a flag is read back from it as
// asked, so PostHog's own read, the exposure, is the one recorded.
import { afterEach, expect, test, vi } from 'vitest';

const sdk = vi.hoisted(() => ({ calls: [] as unknown[][] }));
vi.mock('posthog-react-native', () => ({
  default: class {
    constructor(...args: unknown[]) { sdk.calls.push(['new', ...args]); }
    updateFlags(...args: unknown[]) { sdk.calls.push(['updateFlags', ...args]); }
    getFeatureFlag(...args: unknown[]) {
      sdk.calls.push(['getFeatureFlag', ...args]);
      return 'still';
    }
  },
}));

import { createPostHogClient } from './posthogClient';

afterEach(() => {
  sdk.calls.length = 0;
});

test('the client pushes flags into PostHog as given and reads each flag back from it', () => {
  const client = createPostHogClient('phc_test_key', { host: 'https://api.jotbun.test/ingest' });
  client.updateFlags({ 'exp-save-celebration': 'still', 'rollout-travel': true }, { 'rollout-travel': { since: 1 } });
  expect(client.getFeatureFlag('exp-save-celebration')).toBe('still');
  expect(sdk.calls).toEqual([
    ['new', 'phc_test_key', { host: 'https://api.jotbun.test/ingest' }],
    ['updateFlags', { 'exp-save-celebration': 'still', 'rollout-travel': true }, { 'rollout-travel': { since: 1 } }],
    ['getFeatureFlag', 'exp-save-celebration'],
  ]);
});
