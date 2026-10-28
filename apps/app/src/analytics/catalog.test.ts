import assert from 'node:assert/strict';
import { test } from 'node:test';

import { THAI_EVERYDAY_PACK } from '../spend/v1/redesign/planning/thaiPack.ts';
import { APP_EVENTS, COMMON_RULES, PACK_KEYS, cleanEvent, screenPattern } from './catalog.ts';
import type { PropRule } from './catalog.ts';

const NAMES = [
  'signed_up', 'signed_in', 'signed_out', 'passkey_created', 'account_deleted',
  'onboarding_step_viewed', 'budget_set', 'wallet_added', 'setup_completed',
  'record_started', 'record_saved', 'record_edited', 'record_deleted', 'record_restored', 'undo_used',
  'ai_consent_changed', 'tell_bun_sent', 'ai_draft_reviewed', 'ask_bun_asked', 'ask_bun_rated',
  'albums_connected', 'slip_scan_finished', 'slip_review_confirmed', 'albums_disconnected',
  'insights_viewed', 'recap_opened', 'recap_shared', 'private_mode_toggled', 'reminder_set', 'widget_added',
  'home_currency_set', 'trip_started', 'rate_overridden', 'cash_exchanged', 'cashback_card_tapped',
  'sync_failed', 'conflict_shown', 'permission_denied', 'ai_unavailable', 'resync_required',
];

const RULE_KINDS = new Set(['enum', 'bool', 'count', 'code', 'currency', 'version', 'screen']);
const ENUM_VALUE = /^[a-z0-9_.-]+$/;
const BANNED = new Set([
  'amount_minor', 'balance_minor', 'budget_minor', 'amount', 'merchant', 'payee', 'note', 'label',
  'wallet_name', 'category_name', 'email', 'phone', 'name', 'prompt', 'answer', 'slip_text',
]);

function assertRules(rules: Readonly<Record<string, PropRule>>): void {
  for (const [key, rule] of Object.entries(rules)) {
    assert.equal(BANNED.has(key), false, key);
    assert.ok(RULE_KINDS.has(rule.kind), `${key} ${rule.kind}`);
    if (rule.kind === 'enum') {
      for (const value of rule.values) assert.match(value, ENUM_VALUE, `${key} ${value}`);
    }
  }
}

test('the allow-list holds exactly the 40 events of the spec\'s table', () => {
  assert.equal(NAMES.length, 40);
  assert.deepEqual(Object.keys(APP_EVENTS).sort(), [...NAMES].sort());
});

test('no rule can carry free text', () => {
  for (const rules of Object.values(APP_EVENTS)) assertRules(rules);
  assertRules(COMMON_RULES);
});

test('cleanEvent drops unknown events, unknown properties and values outside their rule', () => {
  assert.deepEqual(cleanEvent('record_saved', { kind: 'expense', category_key: 'food', has_photo: false, seconds_to_save: 12, amount_minor: '4500', note: 'ข้าวมันไก่' }),
    { name: 'record_saved', properties: { kind: 'expense', category_key: 'food', has_photo: false, seconds_to_save: 12 } });
  assert.deepEqual(cleanEvent('record_saved', { kind: 'gift', seconds_to_save: 3601 })?.properties, {});
  assert.equal(cleanEvent('spend_tx_added', { source: 'manual' }), null);
  assert.deepEqual(cleanEvent('sync_failed', { reason_code: 'VERSION_CONFLICT', retry_count: 2.5, network_type: 'wifi' })?.properties, { reason_code: 'VERSION_CONFLICT', network_type: 'wifi' });
  assert.deepEqual(cleanEvent('sync_failed', { reason_code: 'version conflict' })?.properties, {});
});

test('a category is a built-in key, a pack key or custom', () => {
  assert.deepEqual([...PACK_KEYS], THAI_EVERYDAY_PACK.map((item) => item.key));
  assert.deepEqual(cleanEvent('record_saved', { category_key: 'food' })?.properties, { category_key: 'food' });
  assert.deepEqual(cleanEvent('record_saved', { category_key: 'merit' })?.properties, { category_key: 'merit' });
  assert.deepEqual(cleanEvent('record_saved', { category_key: 'custom' })?.properties, { category_key: 'custom' });
  assert.deepEqual(cleanEvent('record_saved', { category_key: 'ค่าขนมแมว' })?.properties, {});
  assert.deepEqual(cleanEvent('record_saved', { category_key: 'Art' })?.properties, {});
});

test('phase 2\'s wallet types, materials and faces are accepted', () => {
  assert.deepEqual(cleanEvent('wallet_added', { wallet_type: 'transit', material: 'sky', bun_face: 'wow' })?.properties, { wallet_type: 'transit', material: 'sky', bun_face: 'wow' });
  assert.deepEqual(cleanEvent('wallet_added', { wallet_type: 'boat' })?.properties, {});
  // R81: ewallet is not a wallet kind.
  assert.deepEqual(cleanEvent('wallet_added', { wallet_type: 'ewallet' })?.properties, {});
});

test('screen names are route patterns, never values', () => {
  assert.equal(screenPattern(['spend', 'record', '[id]']), '/spend/record/[id]');
  assert.equal(screenPattern([]), '/');
  assert.equal(screenPattern(['(tabs)', 'settings']), '/settings');
  assert.equal(screenPattern(['spend', 'record', '0b3f2c1e-6a4d-4f6e-9a51-2f3c4d5e6f70']), null);
  assert.equal(screenPattern(['spend', 'recap', '2026-10']), null);
  assert.equal(screenPattern(['ค่าเช่า']), null);
});
