import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CELEBRATE_BEAT_MS, haptics } from './haptics.ts';
import type { ExpoHapticsModule } from './haptics.ts';

function fakeModule() {
  const calls: string[] = [];
  const mod: ExpoHapticsModule = {
    notificationAsync: async (type) => void calls.push(`notification:${String(type)}`),
    impactAsync: async (style) => void calls.push(`impact:${String(style)}`),
    selectionAsync: async () => void calls.push('selection'),
    NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
    ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Rigid: 'rigid' },
  };
  return { mod, calls, options: { platformOS: 'ios', loadModule: async () => mod, wait: async () => undefined } };
}

test('each verb plays its own native feedback', async () => {
  const cases: [keyof typeof haptics, string[]][] = [
    ['success', ['notification:success']],
    ['warning', ['notification:warning']],
    ['error', ['notification:error']],
    ['impact', ['impact:medium']],
    ['light', ['impact:light']],
    ['rigid', ['impact:rigid']],
    ['selection', ['selection']],
  ];
  for (const [verb, expected] of cases) {
    const { calls, options } = fakeModule();
    await haptics[verb](options);
    assert.deepEqual(calls, expected, verb);
  }
});

test('a celebration is three beats with a pause between them', async () => {
  const { calls, mod } = fakeModule();
  const waits: number[] = [];
  await haptics.celebrate({ platformOS: 'android', loadModule: async () => mod, wait: async (ms) => void waits.push(ms) });
  assert.deepEqual(calls, ['notification:success', 'impact:light', 'impact:light']);
  assert.deepEqual(waits, [CELEBRATE_BEAT_MS, CELEBRATE_BEAT_MS]);
});

test('the web plays nothing and loads no native module', async () => {
  let loaded = false;
  await haptics.celebrate({ platformOS: 'web', loadModule: async () => { loaded = true; return fakeModule().mod; } });
  assert.equal(loaded, false);
});

test('a failing native module never throws to the caller', async () => {
  await haptics.rigid({ platformOS: 'ios', loadModule: async () => { throw new Error('not linked'); } });
  const { mod } = fakeModule();
  mod.notificationAsync = async () => { throw new Error('busy'); };
  await haptics.celebrate({ platformOS: 'ios', loadModule: async () => mod, wait: async () => undefined });
});
