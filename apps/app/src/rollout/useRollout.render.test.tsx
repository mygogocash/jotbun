// useRollout (P6B-T14, B25): a rollout follows the remote flags once they
// load after a yes, and falls back to its build default after a no. The flags
// come through recordAnalytics' controller and fake client, inside the
// wallet's providers.
import { act, cleanup, screen } from '@testing-library/react';
import { Text } from 'react-native';
import { afterEach, expect, test, vi } from 'vitest';

// The real safe-area package loads React Native itself, which vitest cannot run.
vi.mock('react-native-safe-area-context', () => import('../dev/catalogue/safeAreaTestStub'));

import { recordAnalytics } from '@mobile/analytics/testing/recordAnalytics';
import { mountWallet } from '@mobile/wallet/testing/walletHarness';
import { ROLLOUT_DEFAULTS } from './rollout';
import { useRollout } from './useRollout';

let restore = () => {};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  restore();
  restore = () => {};
});

function Probe() {
  const travel = useRollout('travel');
  const bunAi = useRollout('bun_ai');
  return <Text testID="rollouts">{`travel=${travel} bun_ai=${bunAi}`}</Text>;
}

const shown = () => screen.getByTestId('rollouts').textContent;

/** Lets the flags load and their push land, inside act. */
const settle = () => act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0); }); });

test('useRollout follows the flags once they load after yes, and the default after a no', async () => {
  const recorded = await recordAnalytics({ consent: 'unasked', flags: { 'rollout-travel': true, 'rollout-bun-ai': 'control' } });
  restore = recorded.restore;
  mountWallet(<Probe />);
  await settle();
  const defaults = `travel=${ROLLOUT_DEFAULTS.travel} bun_ai=${ROLLOUT_DEFAULTS.bun_ai}`;
  // Never asked: no flags, so each rollout is its default, and no flag is read.
  expect(shown()).toBe(defaults);
  expect(recorded.flagReads).toEqual([]);
  await act(async () => { await recorded.analytics.answer('yes'); });
  await settle();
  expect(recorded.pushed).toEqual([{ flags: { 'rollout-travel': true, 'rollout-bun-ai': 'control' }, payloads: {} }]);
  expect(shown()).toBe('travel=true bun_ai=false');
  await act(async () => { await recorded.analytics.answer('no'); });
  expect(shown()).toBe(defaults);
});
