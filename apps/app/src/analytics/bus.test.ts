// The bus (1D-T7): an emitter never throws into the rule that calls it, and
// what is tracked while no controller is installed is kept, cleaned and
// bounded, for the app's install to take (1D-T6's review, m3).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getAnalytics, setAnalytics, takeEarlyEvents, trackClientEvent } from './bus.ts';
import { HELD_LIMIT } from './controller.ts';
import type { Analytics } from './controller.ts';
import { trackOnboardingStepViewed, trackRecordSaved, trackUndoUsed } from './events.ts';

/** Only track is called on an installed controller here. */
const installedWith = (track: (name: string) => void) => ({ track }) as unknown as Analytics;

test('what is tracked while no controller is installed is kept cleaned, at most 50 with the oldest out first, and taken once', () => {
  const previous = getAnalytics();
  setAnalytics(null);
  try {
    takeEarlyEvents();
    trackOnboardingStepViewed({ step: 'coffee' });
    trackClientEvent('spend_tx_added', { source: 'manual' });
    trackClientEvent('record_started', { source: 'typed', note: 'ข้าวมันไก่', amount_minor: '4500' });
    assert.deepEqual(takeEarlyEvents(), [
      { name: 'onboarding_step_viewed', properties: { step: 'coffee' } },
      { name: 'record_started', properties: { source: 'typed' } },
    ]);
    assert.deepEqual(takeEarlyEvents(), []);
    for (let second = 0; second < HELD_LIMIT + 5; second += 1) {
      trackRecordSaved({ kind: 'expense', source: 'typed', categoryKey: null, offline: false, secondsToSave: second });
    }
    const kept = takeEarlyEvents();
    assert.equal(kept.length, HELD_LIMIT);
    assert.equal(kept[0]?.properties.seconds_to_save, 5);
    assert.equal(kept.at(-1)?.properties.seconds_to_save, HELD_LIMIT + 4);
  } finally {
    setAnalytics(previous);
  }
});

test('with a controller installed, every event goes to it and none is kept for later', () => {
  const previous = getAnalytics();
  const tracked: string[] = [];
  setAnalytics(installedWith((name) => { tracked.push(name); }));
  try {
    takeEarlyEvents();
    trackUndoUsed({ kind: 'expense' });
    assert.deepEqual(tracked, ['undo_used']);
    assert.deepEqual(takeEarlyEvents(), []);
  } finally {
    setAnalytics(previous);
  }
});

test('an emitter never throws into the rule that calls it, even when the client does', () => {
  const previous = getAnalytics();
  setAnalytics(installedWith(() => { throw new Error('the PostHog client failed'); }));
  try {
    assert.doesNotThrow(() => trackRecordSaved({ kind: 'expense', source: 'typed', categoryKey: 'food', offline: false, secondsToSave: 3 }));
    assert.doesNotThrow(() => trackUndoUsed({ kind: 'income' }));
  } finally {
    setAnalytics(previous);
  }
});
