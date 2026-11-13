import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { AiModelName, DraftOutcome } from '../../../analytics/events.ts';
import { recordAnalytics } from '../../../analytics/testing/recordAnalytics.ts';
import { fieldsEdited, reviewDraft, savedOutcome } from './draftReview.ts';
import type { DraftFields } from './draftReview.ts';

const CASH = '11111111-1111-4111-8111-111111111111';
const FOOD = '33333333-3333-4333-8333-333333333333';
const TRAVEL = '44444444-4444-4444-8444-444444444444';
const DRAFT: DraftFields = { type: 'expense', amountMinor: '5000', occurredOn: '2026-11-12', categoryId: FOOD, walletId: CASH, merchant: 'ข้าวมันไก่', note: null };

function changed(field: keyof DraftFields, value: string | null): DraftFields {
  return { ...DRAFT, [field]: value };
}

test('fieldsEdited counts changed fields only', () => {
  assert.equal(fieldsEdited(DRAFT, { ...DRAFT }), 0);
  assert.equal(fieldsEdited(DRAFT, { ...DRAFT, amountMinor: '5500', categoryId: TRAVEL }), 2);
  assert.equal(fieldsEdited({ ...DRAFT, merchant: null }, { ...DRAFT, merchant: '' }), 0);
  assert.equal(fieldsEdited({ ...DRAFT, note: '' }, { ...DRAFT, note: null }), 0);
  // Each of the seven fields counts once, and all seven count seven.
  const other: DraftFields = { type: 'income', amountMinor: '100', occurredOn: '2026-11-11', categoryId: null, walletId: null, merchant: 'ร้านป้าแดง', note: 'ค่าเช่า' };
  for (const field of Object.keys(DRAFT) as (keyof DraftFields)[]) {
    assert.equal(fieldsEdited(DRAFT, changed(field, other[field])), 1, field);
  }
  assert.equal(fieldsEdited(DRAFT, other), 7);
});

test('savedOutcome is kept without changes and edited with any', () => {
  assert.deepEqual(savedOutcome(DRAFT, { ...DRAFT }), { outcome: 'kept', fieldsEdited: 0 });
  assert.deepEqual(savedOutcome({ ...DRAFT, note: null }, { ...DRAFT, note: '' }), { outcome: 'kept', fieldsEdited: 0 });
  assert.deepEqual(savedOutcome(DRAFT, { ...DRAFT, amountMinor: '5500' }), { outcome: 'edited', fieldsEdited: 1 });
  assert.deepEqual(savedOutcome(DRAFT, { ...DRAFT, amountMinor: '5500', merchant: 'ข้าวมันไก่ไข่ดาว' }), { outcome: 'edited', fieldsEdited: 2 });
});

test('reviewDraft sends one ai_draft_reviewed, then tallies once with its model', async () => {
  const recorded = await recordAnalytics();
  try {
    const tallied: Array<[DraftOutcome, AiModelName, number]> = [];
    reviewDraft({ outcome: 'edited', fieldsEdited: 2, model: 'claude-opus-5-5', escalated: true }, (outcome, model) => {
      tallied.push([outcome, model, recorded.sent.length]);
    });
    assert.deepEqual(recorded.sent, [
      { kind: 'capture', name: 'ai_draft_reviewed', properties: { outcome: 'edited', fields_edited: 2, model: 'claude-opus-5-5', escalated: true, origin: 'app' } },
    ]);
    // One count, with the review's own outcome and model, made once the event had gone.
    assert.deepEqual(tallied, [['edited', 'claude-opus-5-5', 1]]);

    // With no tally (a release build) the review is sent all the same.
    reviewDraft({ outcome: 'dropped', fieldsEdited: 0, model: 'rules', escalated: false });
    assert.deepEqual(recorded.sent.map((event) => event.properties), [
      { outcome: 'edited', fields_edited: 2, model: 'claude-opus-5-5', escalated: true, origin: 'app' },
      { outcome: 'dropped', fields_edited: 0, model: 'rules', escalated: false, origin: 'app' },
    ]);
  } finally {
    recorded.restore();
  }
});

test('a tally that fails never fails the review, and leaves nothing unhandled', async () => {
  const unhandled: unknown[] = [];
  const keep = (reason: unknown) => { unhandled.push(reason); };
  process.on('unhandledRejection', keep);
  const recorded = await recordAnalytics();
  try {
    reviewDraft({ outcome: 'kept', fieldsEdited: 0, model: 'claude-haiku-5-5', escalated: false }, () => Promise.reject(new Error('the tally could not be stored')));
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.deepEqual(recorded.sent.map((event) => event.name), ['ai_draft_reviewed']);
    assert.deepEqual(unhandled, []);
  } finally {
    recorded.restore();
    process.off('unhandledRejection', keep);
  }
});

test('a tally that throws at once never fails the review', async () => {
  const recorded = await recordAnalytics();
  try {
    // P3-T5's review (m1): a count that throws before it hands back a promise is dropped as one that rejects is,
    // and the review it follows is sent all the same.
    assert.doesNotThrow(() => reviewDraft({ outcome: 'kept', fieldsEdited: 0, model: 'claude-haiku-5-5', escalated: false }, () => {
      throw new Error('the tally is not there');
    }));
    assert.deepEqual(recorded.sent.map((event) => [event.name, event.properties.outcome]), [['ai_draft_reviewed', 'kept']]);
  } finally {
    recorded.restore();
  }
});

test('useDraftReview.ts imports with __DEV__ undefined, and its review is sent with no tally', async () => {
  assert.equal(typeof (globalThis as { __DEV__?: unknown }).__DEV__, 'undefined');
  const loading = import('./useDraftReview.ts');
  await assert.doesNotReject(loading);
  const { useDraftReview } = await loading;
  const recorded = await recordAnalytics();
  try {
    const review = useDraftReview();
    // The same function every time, for a screen's dependency lists.
    assert.equal(useDraftReview(), review);
    review({ outcome: 'kept', fieldsEdited: 0, model: 'rules', escalated: false });
    assert.deepEqual(recorded.sent.map((event) => event.name), ['ai_draft_reviewed']);
  } finally {
    recorded.restore();
  }
});
