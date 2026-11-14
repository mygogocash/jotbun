import assert from 'node:assert/strict';
import { test } from 'node:test';

import { APP_EVENTS } from './catalog.ts';
import { createAnalytics } from './controller.ts';
import { gateOutgoing } from './gate.ts';
import type { OutgoingEvent } from './gate.ts';

const ACCOUNT = '00000000-0000-4000-8000-0000000000aa';
const NEEDLES = [
  '123456', '987654', '18000', 'ร้านป้าแดง', 'สมชาย', 'บัญชีออมทรัพย์', 'ค่าเช่า', 'ค่าขนมแมว',
  'kan@example.com', '0812345678', 'กานต์', 'เดือนนี้', '4,500', 'PromptPay', '0b3f2c1e',
];
const SENTINEL = NEEDLES.join(' ');

test('nothing a person typed leaves through an event, a screen or an exception', async () => {
  const policy = { analytics: true, crashReportsWithoutConsent: true };
  const left: OutgoingEvent[] = [];
  const accept = (event: OutgoingEvent) => {
    const gated = gateOutgoing(event, policy);
    if (gated) left.push(gated);
  };
  const analytics = createAnalytics({
    client: {
      capture(event, properties) { accept({ event, properties }); },
      screen(name, properties) { accept({ event: '$screen', properties: { ...properties, $screen_name: name } }); },
      identify(distinctId) { accept({ event: '$identify', properties: { distinct_id: distinctId } }); },
      reset() {},
      startSessionRecording() {},
      stopSessionRecording() {},
      updateFlags() {},
      getFeatureFlag: () => undefined,
    },
    replay: false,
    store: { read: async () => null, write: async () => {}, erase: async () => {} },
    server: {
      read: async () => ({ consent: 'yes', analyticsId: 'a'.repeat(64), weeksSinceSignup: 1 }),
      setConsent: async () => {},
    },
  });
  await analytics.setAccount(ACCOUNT);
  assert.equal(analytics.status(), 'yes');
  analytics.setCommon({ app_version: '1.2.3', platform: 'ios', language: 'th', home_currency: 'THB', ai_enabled: false });

  for (const name of Object.keys(APP_EVENTS)) {
    const properties: Record<string, unknown> = {
      amount_minor: '123456',
      balance_minor: '987654',
      budget_minor: '18000',
      merchant: 'ร้านป้าแดง',
      payee: 'สมชาย ใจดี',
      wallet_name: 'บัญชีออมทรัพย์กสิกร',
      note: 'ค่าเช่าเดือนตุลา',
      label: 'ค่าขนมแมว',
      email: 'kan@example.com',
      phone: '0812345678',
      name: 'กานต์',
      prompt: 'เดือนนี้ใช้ไปเท่าไหร่',
      answer: 'คุณใช้ไป ฿4,500',
      slip_text: 'PromptPay 0812345678',
    };
    for (const key of Object.keys(APP_EVENTS[name as keyof typeof APP_EVENTS])) properties[key] = SENTINEL;
    analytics.track(name, properties);
  }

  analytics.screen(['spend', 'record', '0b3f2c1e-6a4d-4f6e-9a51-2f3c4d5e6f70']);
  analytics.screen(['0b3f2c1e', 'สมชาย']);
  analytics.screen(['spend', 'settings']);

  accept({
    event: '$exception',
    properties: {
      $exception_message: SENTINEL,
      $exception_stack_trace_raw: SENTINEL,
      $exception_list: [
        {
          type: 'TypeError',
          value: SENTINEL,
          mechanism: { handled: true, type: 'generic' },
          stacktrace: {
            type: 'raw',
            frames: [{ function: 'save', filename: 'record.ts', lineno: 1, colno: 1, in_app: true, platform: 'javascript', context_line: SENTINEL }],
          },
        },
      ],
      $device_name: "Kan's iPhone",
    },
  });

  const names = left.filter((event) => event.event !== '$exception' && event.event !== '$screen' && event.event !== '$identify').map((event) => event.event);
  for (const name of Object.keys(APP_EVENTS)) assert.ok(names.includes(name), name);
  assert.ok(left.some((event) => event.event === '$exception'));
  assert.ok(left.some((event) => event.event === '$screen' && event.properties?.$screen_name === '/spend/settings'));
  const blob = JSON.stringify(left);
  for (const needle of NEEDLES) assert.equal(blob.includes(needle), false, needle);
});

test('a flag exposure leaves with no payload, no device name and nothing a person typed', async () => {
  const policy = { analytics: true, crashReportsWithoutConsent: true };
  const left: OutgoingEvent[] = [];
  const accept = (event: OutgoingEvent) => {
    const gated = gateOutgoing(event, policy);
    if (gated) left.push(gated);
  };
  // An owner's payload holding what a person might type, on the flag and as a bootstrap.
  const payload = { note: SENTINEL, email: 'kan@example.com' };
  let pushed: Record<string, boolean | string> = {};
  const analytics = createAnalytics({
    client: {
      capture(event, properties) { accept({ event, properties }); },
      screen() {},
      identify() {},
      reset() { pushed = {}; },
      startSessionRecording() {},
      stopSessionRecording() {},
      updateFlags(flags) { pushed = { ...flags }; },
      // As PostHog does, the read is captured as `$feature_flag_called`, here with every property it may carry.
      getFeatureFlag(key) {
        const value = pushed[key];
        accept({
          event: '$feature_flag_called',
          properties: {
            $feature_flag: key,
            $feature_flag_response: value,
            $feature_flag_payload: payload,
            $feature_flag_bootstrapped_payload: payload,
            $feature_flag_bootstrapped_response: value,
            $used_bootstrap_value: false,
            $device_name: "Kan's iPhone",
            $set: { email: 'kan@example.com', name: 'กานต์' },
            $set_once: { phone: '0812345678' },
          },
        });
        return value;
      },
    },
    replay: false,
    store: { read: async () => null, write: async () => {}, erase: async () => {} },
    server: {
      read: async () => ({ consent: 'yes', analyticsId: 'a'.repeat(64), weeksSinceSignup: 1 }),
      setConsent: async () => {},
    },
    flags: {
      load: async () => ({ flags: { 'rollout-bun-ai': true, 'exp-save-celebration': 'still' }, payloads: { 'rollout-bun-ai': payload } }),
      kept: () => ({ get: async () => null, set: async () => {}, remove: async () => {}, eraseAll: async () => {} }),
    },
  });
  await analytics.setAccount(ACCOUNT);
  await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
  assert.equal(analytics.flag('rollout-bun-ai'), true);
  assert.equal(analytics.flag('exp-save-celebration'), 'still');
  const exposures = left.filter((event) => event.event === '$feature_flag_called');
  assert.deepEqual(exposures.map((event) => event.properties?.$feature_flag), ['rollout-bun-ai', 'exp-save-celebration']);
  const blob = JSON.stringify(left);
  for (const needle of NEEDLES) assert.equal(blob.includes(needle), false, needle);
  assert.equal(blob.includes("Kan's iPhone"), false);
  assert.equal(blob.includes('_payload'), false);
});
