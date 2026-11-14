// The rollout layer (P6B-T14, B25): a rollout reads its default without flags,
// on for true or any variant but 'control', off for false or 'control'; an
// experiment reads a listed variant of its own, else 'control', and reading it
// from the installed controller is one read, PostHog's exposure.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getAnalytics, setAnalytics } from '../analytics/bus.ts';
import { recordAnalytics } from '../analytics/testing/recordAnalytics.ts';
import { EXPERIMENTS, readExperiment, variantOf } from './experiments.ts';
import { ROLLOUT_DEFAULTS, ROLLOUT_FLAGS, rolloutOn } from './rollout.ts';
import type { RolloutKey } from './rollout.ts';

const KEYS: readonly RolloutKey[] = ['bun_ai', 'slip_import', 'travel'];

test('undefined reads the default; true or a variant reads on; false or control reads off', () => {
  assert.deepEqual(ROLLOUT_FLAGS, { bun_ai: 'rollout-bun-ai', slip_import: 'rollout-slip-import', travel: 'rollout-travel' });
  // Every default is off until the owner decides Q10.
  assert.deepEqual(ROLLOUT_DEFAULTS, { bun_ai: false, slip_import: false, travel: false });
  for (const key of KEYS) {
    assert.equal(rolloutOn(key, undefined), ROLLOUT_DEFAULTS[key], key);
    assert.equal(rolloutOn(key, true), true, key);
    assert.equal(rolloutOn(key, 'test'), true, key);
    assert.equal(rolloutOn(key, 'everyone'), true, key);
    assert.equal(rolloutOn(key, false), false, key);
    assert.equal(rolloutOn(key, 'control'), false, key);
  }
});

test('an unknown experiment variant reads control', async () => {
  assert.deepEqual(EXPERIMENTS, {
    budget_question: { flag: 'exp-budget-question', variants: ['control', 'no_presets'] },
    save_celebration: { flag: 'exp-save-celebration', variants: ['control', 'still'] },
    reminder_time: { flag: 'exp-reminder-time', variants: ['control', 'later'] },
  });
  assert.equal(variantOf('budget_question', 'no_presets'), 'no_presets');
  assert.equal(variantOf('save_celebration', 'still'), 'still');
  assert.equal(variantOf('reminder_time', 'later'), 'later');
  // Unknown, another experiment's, a boolean or nothing: control.
  for (const value of [undefined, true, false, 'control', 'test', 'still', 'later']) {
    assert.equal(variantOf('budget_question', value), 'control', String(value));
  }
  const previous = getAnalytics();
  setAnalytics(null);
  try {
    // No controller installed: control, and nothing is read.
    assert.equal(readExperiment('budget_question'), 'control');
    const recorded = await recordAnalytics({ flags: { 'exp-budget-question': 'no_presets', 'exp-reminder-time': 'sooner' } });
    try {
      assert.equal(readExperiment('budget_question'), 'no_presets');
      assert.equal(readExperiment('reminder_time'), 'control');
      // One read each: the exposure.
      assert.deepEqual(recorded.flagReads, ['exp-budget-question', 'exp-reminder-time']);
    } finally {
      recorded.restore();
    }
  } finally {
    setAnalytics(previous);
  }
});
