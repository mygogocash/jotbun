import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { OutboxState } from '../../../../storage/types.ts';
import type { DiaryView } from '../../spendDiary.ts';
import type { SyncStatus } from '../../../../sync/types.ts';
import { command, pending } from '../testing/fixtures.ts';
import { APPEARANCES, BUN_CHOICES, LANGUAGES, LANGUAGE_NAMES, SETTINGS_HREFS, deviceOffline, diaryLinks, unsyncedEntries } from './settingsModel.ts';

const NONE = { planning: false, insights: false, imports: false };

function view(states: readonly OutboxState[], status: SyncStatus | null = null, phase: DiaryView['phase'] = 'ready'): DiaryView {
  const outbox = states.map((state) => command(pending({ amount_minor: '6500' }), state));
  return {
    phase, lockReason: null, progress: null, pending: [], outbox, pendingChoices: [], wallets: [], categories: [], appliedRevision: '0',
    outcome: status === null ? null : { status, progress: { sent: 0, total: 0 }, nextAttemptAt: null, uncertain: 0, needsReview: 0 },
  };
}

test('the choices: System, Light and Dark; System, TH and EN by their own names; Full, Quiet and Off', () => {
  assert.deepEqual(APPEARANCES, ['system', 'light', 'dark']);
  // Vietnamese waits for its translation, so it is not offered; a phone in Vietnamese keeps it under System.
  assert.deepEqual(LANGUAGES, ['system', 'th', 'en']);
  // A language is named in itself, so a person who can't read the current one still finds theirs.
  assert.deepEqual(LANGUAGE_NAMES, { th: 'ไทย', en: 'English' });
  assert.deepEqual(BUN_CHOICES, ['full', 'quiet', 'off']);
});

test('the diary links: planning brings Wallets, Categories and Budget; insights brings Reminders; import only with its flag', () => {
  assert.deepEqual(diaryLinks(NONE), []);
  assert.deepEqual(diaryLinks({ ...NONE, planning: true }), ['wallets', 'categories', 'budget']);
  assert.deepEqual(diaryLinks({ ...NONE, insights: true }), ['reminders']);
  assert.deepEqual(diaryLinks({ ...NONE, imports: true }), ['import']);
  assert.deepEqual(diaryLinks({ planning: true, insights: true, imports: true }), ['wallets', 'categories', 'budget', 'reminders', 'import']);
});

test('every link goes to its own route', () => {
  assert.deepEqual(SETTINGS_HREFS, {
    wallets: '/spend/wallets',
    categories: '/spend/categories',
    budget: '/spend/budget',
    reminders: '/spend/reminders',
    import: '/spend/import',
    privacy: '/settings/privacy',
  });
});

test('unsynced entries: every draft Jotbun has not confirmed, which an erase would lose', () => {
  assert.equal(unsyncedEntries(null), 0, 'no diary on this device (the web): nothing kept, nothing lost');
  assert.equal(unsyncedEntries(view([])), 0);
  assert.equal(unsyncedEntries(view(['unsent', 'sending', 'uncertain', 'needs_review', 'paused_upgrade', 'acknowledged'])), 5);
  assert.equal(unsyncedEntries(view(['acknowledged'])), 0, 'a committed entry is safe in the account');
});

test('offline: sync is backing off with entries waiting, as Home says it', () => {
  assert.equal(deviceOffline(null), false);
  assert.equal(deviceOffline(view(['unsent'], 'waiting')), true);
  assert.equal(deviceOffline(view(['uncertain'], 'paused')), true);
  assert.equal(deviceOffline(view([], 'waiting')), false, 'nothing waiting: nothing to say');
  assert.equal(deviceOffline(view(['needs_review'], 'waiting')), false, 'a refused draft is not waiting on the connection');
  assert.equal(deviceOffline(view(['unsent'], 'synced')), false);
  assert.equal(deviceOffline(view(['unsent'], 'waiting', 'locked')), false);
});
