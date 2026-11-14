import assert from 'node:assert/strict';
import { test } from 'node:test';

import { gateOutgoing } from './gate.ts';
import type { GatePolicy, OutgoingEvent } from './gate.ts';

const MECHANISM = { handled: false, type: 'generic' };

function crash(): OutgoingEvent {
  return {
    event: '$exception',
    properties: {
      $lib: 'posthog-react-native',
      $exception_list: [
        {
          type: 'TypeError',
          value: 'Cannot read ฿1,234 from note สมชาย',
          mechanism: MECHANISM,
          stacktrace: {
            type: 'resolved',
            frames: [
              {
                function: 'save',
                filename: 'record.ts',
                lineno: 12,
                colno: 3,
                in_app: true,
                platform: 'javascript',
                context_line: 'note สมชาย',
                vars: { note: 'สมชาย' },
              },
            ],
          },
          module: 'app',
        },
        { value: 'Cannot read ฿1,234 from note สมชาย' },
      ],
      $exception_message: 'Cannot read ฿1,234 from note สมชาย',
      $exception_values: 'Cannot read ฿1,234 from note สมชาย',
      $exception_steps: ['สมชาย'],
      $exception_stack_trace_raw: 'สมชาย',
      $issue_description: 'สมชาย',
      $device_name: "Kan's iPhone",
      $set: { name: 'กานต์' },
    },
  };
}

const OFF: GatePolicy = { analytics: false, crashReportsWithoutConsent: true };

test('before yes, only scrubbed exceptions leave, without a person profile', () => {
  const out = gateOutgoing(crash(), OFF);
  assert.deepEqual(out, {
    event: '$exception',
    properties: {
      $lib: 'posthog-react-native',
      $exception_list: [
        {
          type: 'TypeError',
          value: 'TypeError',
          mechanism: MECHANISM,
          stacktrace: {
            type: 'resolved',
            frames: [{ function: 'save', filename: 'record.ts', lineno: 12, colno: 3, in_app: true, platform: 'javascript' }],
          },
        },
        { value: 'Error' },
      ],
      $process_person_profile: false,
    },
  });
  const json = JSON.stringify(out);
  assert.equal(json.includes('สมชาย'), false);
  assert.equal(json.includes('context_line'), false);
  assert.equal(json.includes('$exception_message'), false);
  assert.equal(json.includes('$exception_steps'), false);
  assert.equal(json.includes('$exception_stack_trace_raw'), false);
  assert.equal(json.includes('$device_name'), false);
  assert.equal(json.includes("Kan's iPhone"), false);
  assert.equal(gateOutgoing({ event: 'record_saved', properties: { kind: 'expense' } }, OFF), null);
  assert.equal(gateOutgoing({ event: '$screen', properties: { $screen_name: '/spend' } }, OFF), null);
  assert.equal(gateOutgoing({ event: '$snapshot', properties: {} }, OFF), null);
  assert.equal(gateOutgoing({ event: '$identify', properties: {} }, OFF), null);
});

test('with the switch off, exceptions also wait for yes', () => {
  assert.equal(gateOutgoing(crash(), { analytics: false, crashReportsWithoutConsent: false }), null);
});

test('after yes, allow-listed events, screens, identify and replay pass; anything else is dropped', () => {
  const yes: GatePolicy = { analytics: true, crashReportsWithoutConsent: false };
  assert.equal(gateOutgoing({ event: 'record_saved', properties: { kind: 'expense' } }, yes)?.event, 'record_saved');
  assert.equal(gateOutgoing({ event: '$screen', properties: { $screen_name: '/' } }, yes)?.event, '$screen');
  assert.equal(gateOutgoing({ event: '$identify' }, yes)?.event, '$identify');
  assert.equal(gateOutgoing({ event: '$snapshot' }, yes)?.event, '$snapshot');
  // P6B-T14: a flag exposure passes after yes (Analytics.flag reads flags only then).
  assert.equal(gateOutgoing({ event: '$feature_flag_called', properties: { $feature_flag: 'rollout-travel', $feature_flag_response: true } }, yes)?.event, '$feature_flag_called');
  const crashed = gateOutgoing(crash(), yes);
  assert.equal(crashed?.event, '$exception');
  assert.equal(crashed?.properties?.$process_person_profile, undefined);
  assert.equal(JSON.stringify(crashed).includes('context_line'), false);
  for (const event of ['Application Opened', '$autocapture', '$pageview', 'survey sent']) {
    assert.equal(gateOutgoing({ event, properties: { kind: 'expense' } }, yes), null, event);
  }
});

test('the device name, $set and $set_once never leave', () => {
  const event = {
    event: 'signed_in',
    $set: { email: 'kan@example.com' },
    $set_once: { name: 'กานต์' },
    properties: {
      method: 'apple',
      $device_name: "Kan's iPhone",
      $set: { email: 'kan@example.com' },
      $set_once: { name: 'กานต์' },
    },
  };
  const out = gateOutgoing(event, { analytics: true, crashReportsWithoutConsent: true });
  assert.deepEqual(out, { event: 'signed_in', properties: { method: 'apple' } });
  assert.equal(event.properties.$device_name, "Kan's iPhone");
  assert.equal(event.$set.email, 'kan@example.com');
});

test('$feature_flag_called passes only after yes, without payloads', () => {
  const exposure = {
    event: '$feature_flag_called',
    $set: { email: 'kan@example.com' },
    properties: {
      $feature_flag: 'exp-budget-question',
      $feature_flag_response: 'no_presets',
      $feature_flag_payload: { note: 'ค่าเช่าเดือนตุลา ฿4,500' },
      $feature_flag_bootstrapped_payload: { note: 'สมชาย' },
      $feature_flag_bootstrapped_response: 'control',
      $used_bootstrap_value: false,
      $device_name: "Kan's iPhone",
      $set: { name: 'กานต์' },
    },
  };
  // Before yes, with or without crash reports: nothing.
  assert.equal(gateOutgoing(exposure, OFF), null);
  assert.equal(gateOutgoing(exposure, { analytics: false, crashReportsWithoutConsent: false }), null);
  // After yes: the flag and its values, and nothing a payload, the phone or a person carries.
  assert.deepEqual(gateOutgoing(exposure, { analytics: true, crashReportsWithoutConsent: false }), {
    event: '$feature_flag_called',
    properties: {
      $feature_flag: 'exp-budget-question',
      $feature_flag_response: 'no_presets',
      $feature_flag_bootstrapped_response: 'control',
      $used_bootstrap_value: false,
    },
  });
});
