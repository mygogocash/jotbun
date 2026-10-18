import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { isStale, verdictFor } from './outbox.ts';
import { START, bench } from './testing/harness.ts';
import type { Bench } from './testing/harness.ts';

let b: Bench | undefined;
afterEach(() => b?.dispose());

test('each send result has one verdict: committed-maybe is uncertain, refusals need review, pacing and auth restore the previous state', () => {
  const table = Object.fromEntries(
    (['network', 'unavailable', 'invalid_response', 'rate_limited', 'upgrade_required', 'schema_unsupported', 'invalid', 'conflict', 'not_found', 'deleted', 'purged', 'idempotency_mismatch', 'too_large', 'signed_out', 'policy_required', 'session_changed'] as const).map((outcome) => [outcome, verdictFor(outcome)]),
  );
  for (const outcome of ['network', 'unavailable', 'invalid_response'] as const) assert.deepEqual(table[outcome], { next: 'uncertain', flush: 'stop', failure: true });
  assert.deepEqual(table.rate_limited, { next: 'previous', flush: 'stop', failure: false });
  assert.deepEqual(table.upgrade_required, { next: 'previous', flush: 'stop', failure: false });
  for (const outcome of ['schema_unsupported', 'invalid', 'not_found', 'too_large'] as const) assert.deepEqual(table[outcome], { next: 'needs_review', flush: 'continue', failure: false });
  // On a create these mean the id is already used: it may have committed, so check before anything else.
  for (const outcome of ['conflict', 'deleted', 'purged', 'idempotency_mismatch'] as const) assert.deepEqual(table[outcome], { next: 'uncertain', flush: 'continue', failure: false });
  for (const outcome of ['signed_out', 'policy_required'] as const) assert.deepEqual(table[outcome], { next: 'previous', flush: 'stop', failure: false });
  assert.deepEqual(table.session_changed, { next: 'keep_sending', flush: 'stop', failure: false });
});

test('drafts older than 30 days need review', async () => {
  b = await bench();
  const fresh = await b.save();
  const old = await b.save({}, { createdAt: new Date(START - 31 * 86_400_000).toISOString() });
  assert.equal(isStale(fresh, START), false);
  assert.equal(isStale(old, START), true);
});

test('a transmission freezes the command; state changes are compare-and-set; resolving removes command and draft together', async () => {
  b = await bench();
  const command = await b.save();
  const other = await b.save();
  const at = new Date(START).toISOString();
  const frozen = await b.store.beginTransmission(command.commandId, at);
  assert.equal(frozen?.previous, 'unsent');
  assert.deepEqual(frozen?.command.payload, command.payload);
  const [sending] = await b.store.readOutbox();
  assert.deepEqual({ state: sending.state, first: sending.firstTransmissionAt, payload: sending.payload }, { state: 'sending', first: at, payload: command.payload });
  await assert.rejects(b.store.editPending(command.commandId, { ...command.payload, amount_minor: '1' }), TypeError);
  await assert.rejects(b.store.removePending(command.commandId), TypeError);
  assert.equal(await b.store.setCommandState(command.commandId, ['sending'], 'uncertain'), true);
  assert.equal(await b.store.setCommandState(command.commandId, ['sending'], 'uncertain'), false);
  // A later transmission keeps the first transmission time.
  assert.equal((await b.store.beginTransmission(command.commandId, new Date(START + 1000).toISOString()))?.previous, 'uncertain');
  assert.equal((await b.store.readOutbox())[0].firstTransmissionAt, at);
  await assert.rejects(b.store.setCommandState(command.commandId, ['sending'], 'acknowledged'), TypeError);
  assert.equal(await b.store.setCommandState(command.commandId, ['sending'], 'acknowledged', '7'), true);
  assert.equal((await b.store.readOutbox())[0].ackedRevision, '7');
  await assert.rejects(b.store.beginTransmission(command.commandId, at), TypeError);
  await b.store.resolveCommands([command.commandId]);
  assert.equal(await b.store.beginTransmission(command.commandId, at), null, 'a command that is gone is skipped');
  assert.deepEqual((await b.store.readOutbox()).map((c) => c.commandId), [other.commandId]);
  assert.deepEqual((await b.store.readState()).pending.map((e) => e.id), [other.payload.id]);
});

test('a never-sent draft can be edited (its command follows) or removed', async () => {
  b = await bench();
  const command = await b.save({ amount_minor: '100' });
  const edited = { ...command.payload, amount_minor: '250', note: 'dinner' };
  await b.store.editPending(command.commandId, edited);
  const [after] = await b.store.readOutbox();
  assert.deepEqual(after.payload, edited);
  assert.deepEqual((await b.store.readState()).pending, [edited]);
  await assert.rejects(b.store.editPending(command.commandId, { ...edited, id: crypto.randomUUID() }), TypeError);
  await assert.rejects(b.store.editPending(command.commandId, { ...edited, wallet_id: crypto.randomUUID() } as never), TypeError);
  await b.store.removePending(command.commandId);
  assert.deepEqual(await b.store.readOutbox(), []);
  assert.deepEqual((await b.store.readState()).pending, []);
});
