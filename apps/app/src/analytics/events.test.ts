import assert from 'node:assert/strict';
import { test } from 'node:test';

import { setConsentedTelemetrySink } from './bus.ts';
import type { CleanProps } from './catalog.ts';
import {
  trackBudgetSet, trackConflictShown, trackInsightsViewed, trackOnboardingStepViewed, trackPermissionDenied,
  trackPrivateModeToggled, trackRecapOpened, trackRecapShared, trackRecordDeleted, trackRecordEdited,
  trackRecordRestored, trackRecordSaved, trackRecordStarted, trackReminderSet, trackResyncRequired,
  trackSetupCompleted, trackSignedIn, trackSignedOut, trackSignedUp, trackSyncFailed, trackUndoUsed,
  trackWalletAdded,
} from './events.ts';

test('the typed emitters send §7\'s names and nothing else', () => {
  const seen: Array<[string, CleanProps]> = [];
  setConsentedTelemetrySink((name, properties) => { seen.push([name, properties]); });
  try {
    trackRecordSaved({ kind: 'expense', source: 'typed', categoryKey: 'merit', offline: false, secondsToSave: 4000 });
    assert.deepEqual(seen.at(-1), ['record_saved', { kind: 'expense', source: 'typed', category_key: 'merit', has_photo: false, offline: false, seconds_to_save: 3600 }]);

    trackRecordSaved({ kind: 'income', source: 'tell_bun', categoryKey: null, offline: true, secondsToSave: 12.6 });
    assert.deepEqual(seen.at(-1), ['record_saved', { kind: 'income', source: 'tell_bun', has_photo: false, offline: true, seconds_to_save: 13 }]);

    trackRecordSaved({ kind: 'transfer', source: 'typed', categoryKey: null, offline: false, secondsToSave: -4 });
    assert.equal(seen.at(-1)?.[1].seconds_to_save, 0);

    trackBudgetSet({ set: false });
    assert.deepEqual(seen.at(-1), ['budget_set', { budget: 'skipped' }]);
    trackBudgetSet({ set: true });
    assert.deepEqual(seen.at(-1), ['budget_set', { budget: 'set' }]);

    trackConflictShown({ screen: '/spend/record/[id]' });
    assert.deepEqual(seen.at(-1), ['conflict_shown', { reason_code: 'VERSION_CONFLICT', screen: '/spend/record/[id]' }]);

    trackWalletAdded({ walletType: 'transit', material: 'sky', bunFace: 'wow' });
    assert.deepEqual(seen.at(-1), ['wallet_added', { wallet_type: 'transit', material: 'sky', bun_face: 'wow' }]);
    trackWalletAdded({});
    assert.deepEqual(seen.at(-1), ['wallet_added', {}]);

    trackInsightsViewed({ tab: 'calendar' });
    assert.deepEqual(seen.at(-1), ['insights_viewed', { tab: 'calendar', period: 'month' }]);
    trackPrivateModeToggled();
    assert.deepEqual(seen.at(-1), ['private_mode_toggled', {}]);

    trackPermissionDenied({ permission: 'camera' });
    assert.deepEqual(seen.at(-1), ['permission_denied', { reason_code: 'CAMERA_DENIED' }]);
    trackPermissionDenied({ permission: 'photos' });
    assert.deepEqual(seen.at(-1), ['permission_denied', { reason_code: 'PHOTOS_DENIED' }]);

    trackRecordStarted({ source: 'tell_bun' });
    assert.deepEqual(seen.at(-1), ['record_started', { source: 'tell_bun' }]);
    trackRecordStarted({ kind: 'expense', source: 'typed' });
    assert.deepEqual(seen.at(-1), ['record_started', { kind: 'expense', source: 'typed' }]);

    trackRecordEdited({ kind: 'expense', categoryKey: 'food' });
    assert.deepEqual(seen.at(-1), ['record_edited', { kind: 'expense', category_key: 'food' }]);
    trackRecordDeleted({ kind: 'income', categoryKey: null });
    assert.deepEqual(seen.at(-1), ['record_deleted', { kind: 'income' }]);
    trackRecordRestored({ kind: 'transfer' });
    assert.deepEqual(seen.at(-1), ['record_restored', { kind: 'transfer' }]);
    trackUndoUsed({ kind: 'expense' });
    assert.deepEqual(seen.at(-1), ['undo_used', { kind: 'expense' }]);

    trackOnboardingStepViewed({ step: 'analytics_consent' });
    assert.deepEqual(seen.at(-1), ['onboarding_step_viewed', { step: 'analytics_consent' }]);
    trackSetupCompleted();
    assert.deepEqual(seen.at(-1), ['setup_completed', {}]);
    trackRecapOpened();
    assert.deepEqual(seen.at(-1), ['recap_opened', { period: 'month' }]);
    trackRecapShared();
    assert.deepEqual(seen.at(-1), ['recap_shared', { period: 'month' }]);
    trackReminderSet({ hour: 21 });
    assert.deepEqual(seen.at(-1), ['reminder_set', { reminder_hour: 21 }]);
    trackSyncFailed({ reasonCode: 'INTERNAL_ERROR' });
    assert.deepEqual(seen.at(-1), ['sync_failed', { reason_code: 'INTERNAL_ERROR' }]);
    trackResyncRequired();
    assert.deepEqual(seen.at(-1), ['resync_required', { reason_code: 'RESYNC_REQUIRED' }]);
    trackSignedUp({ method: 'apple' });
    assert.deepEqual(seen.at(-1), ['signed_up', { method: 'apple' }]);
    trackSignedIn({ method: 'passkey' });
    assert.deepEqual(seen.at(-1), ['signed_in', { method: 'passkey' }]);
    trackSignedOut({ method: 'google' });
    assert.deepEqual(seen.at(-1), ['signed_out', { method: 'google' }]);
    trackSignedOut({});
    assert.deepEqual(seen.at(-1), ['signed_out', {}]);
  } finally {
    setConsentedTelemetrySink(null);
  }
});
