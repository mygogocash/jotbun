import assert from 'node:assert/strict';
import { test } from 'node:test';

import { motion } from '../theme/motion.ts';
import {
  DEFAULT_HAPTIC_PREFERENCE,
  HAPTIC_PREFERENCES,
  currentHapticPreference,
  hapticVerbFor,
  parseHapticPreference,
  setCurrentHapticPreference,
} from './hapticPreference.ts';
import type { HapticMoment } from './hapticPreference.ts';

const MOMENTS = Object.keys(motion.haptic) as HapticMoment[];

test('haptics are on until the person chooses otherwise; only the three words parse', () => {
  assert.equal(DEFAULT_HAPTIC_PREFERENCE, 'on');
  assert.deepEqual([...HAPTIC_PREFERENCES], ['on', 'subtle', 'off']);
  for (const junk of ['On', ' off', 'loud', '', null, undefined, 1, {}]) assert.equal(parseHapticPreference(junk), null);
  for (const word of HAPTIC_PREFERENCES) assert.equal(parseHapticPreference(word), word);
});

test('On plays every moment as the table says, silence included', () => {
  for (const moment of MOMENTS) assert.equal(hapticVerbFor(moment, 'on'), motion.haptic[moment]);
  for (const moment of ['scroll', 'navigate', 'listPage'] as const) assert.equal(hapticVerbFor(moment, 'on'), 'none');
});

test('Subtle keeps only outcomes; a celebration plays as one success', () => {
  assert.equal(hapticVerbFor('saveLanded', 'subtle'), 'success');
  assert.equal(hapticVerbFor('saveFailed', 'subtle'), 'error');
  assert.equal(hapticVerbFor('thresholdCrossed', 'subtle'), 'warning');
  assert.equal(hapticVerbFor('celebration', 'subtle'), 'success');
  for (const moment of ['keyTap', 'chipPick', 'tabChange', 'saveQueued', 'deleteDone', 'sheetOpen', 'primaryPress', 'aiAccepted'] as const) {
    assert.equal(hapticVerbFor(moment, 'subtle'), 'none', moment);
  }
});

test('Off is silence for every moment', () => {
  for (const moment of MOMENTS) assert.equal(hapticVerbFor(moment, 'off'), 'none');
});

test('saved offline never feels like saved: queued is light, landed is success', () => {
  assert.equal(motion.haptic.saveQueued, 'light');
  assert.equal(motion.haptic.saveLanded, 'success');
});

test('the current preference is shared module state', () => {
  const before = currentHapticPreference();
  setCurrentHapticPreference('off');
  assert.equal(currentHapticPreference(), 'off');
  setCurrentHapticPreference(before);
});
