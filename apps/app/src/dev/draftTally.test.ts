import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { StoreBackend } from '../wallet/store/walletStore.ts';
import { DRAFT_TALLY_KEY, addDraftOutcome, readDraftTally, resetDraftTally } from './draftTally.ts';

// P3-T22's export check looks for this exact key, so it is spelled out here.
const KEY = 'jotbun.dev.draft-tally';
const NONE = { kept: 0, edited: 0, dropped: 0 };
const ZEROS = { 'claude-haiku-5-5': NONE, 'claude-opus-5-5': NONE, rules: NONE };

function memory(seed: Record<string, string> = {}): StoreBackend & { rows: Map<string, string> } {
  const rows = new Map(Object.entries(seed));
  return {
    rows,
    getItem: async (key) => rows.get(key) ?? null,
    setItem: async (key, value) => { rows.set(key, value); },
    removeItem: async (key) => { rows.delete(key); },
    getAllKeys: async () => [...rows.keys()],
    multiRemove: async (keys) => { for (const key of keys) rows.delete(key); },
  };
}

test('the tally counts outcomes per model and holds nothing else', async () => {
  assert.equal(DRAFT_TALLY_KEY, KEY);
  const backend = memory();
  await addDraftOutcome('kept', 'claude-haiku-5-5', backend);
  await addDraftOutcome('kept', 'claude-haiku-5-5', backend);
  await addDraftOutcome('dropped', 'rules', backend);
  const expected = { 'claude-haiku-5-5': { kept: 2, edited: 0, dropped: 0 }, 'claude-opus-5-5': NONE, rules: { kept: 0, edited: 0, dropped: 1 } };
  assert.deepEqual(await readDraftTally(backend), expected);
  // One key, and its JSON holds only the three models, each with exactly those three counts.
  assert.deepEqual([...backend.rows.keys()], [KEY]);
  assert.deepEqual(JSON.parse(backend.rows.get(KEY) ?? 'null'), expected);
});

test('several outcomes added at once each count, and a read waits for the counts asked before it', async () => {
  const backend = memory();
  // As several drafts saved together (P3-T18) add them: none waits for the last.
  const adds = Array.from({ length: 5 }, () => addDraftOutcome('edited', 'claude-opus-5-5', backend));
  const read = readDraftTally(backend);
  assert.deepEqual((await read)['claude-opus-5-5'], { kept: 0, edited: 5, dropped: 0 });
  await Promise.all(adds);
  assert.deepEqual(JSON.parse(backend.rows.get(KEY) ?? 'null')['claude-opus-5-5'], { kept: 0, edited: 5, dropped: 0 });
});

test('a stored tally that is not the tally\'s shape reads as zeros, and the next count keeps counts only', async () => {
  for (const raw of ['{not json', 'null', '7', '"kept"', '[1,2]']) {
    assert.deepEqual(await readDraftTally(memory({ [KEY]: raw })), ZEROS, raw);
  }
  const backend = memory({
    [KEY]: JSON.stringify({
      'claude-haiku-5-5': { kept: 3, edited: -1, dropped: 1.5, note: 'ข้าวมันไก่ 50' },
      'claude-opus-5-5': null,
      rules: { kept: '2', edited: null },
      merchant: 'ร้านป้าแดง',
    }),
  });
  assert.deepEqual(await readDraftTally(backend), { 'claude-haiku-5-5': { kept: 3, edited: 0, dropped: 0 }, 'claude-opus-5-5': NONE, rules: NONE });
  await addDraftOutcome('kept', 'rules', backend);
  assert.deepEqual(JSON.parse(backend.rows.get(KEY) ?? 'null'), { 'claude-haiku-5-5': { kept: 3, edited: 0, dropped: 0 }, 'claude-opus-5-5': NONE, rules: { kept: 1, edited: 0, dropped: 0 } });
});

test('a count that cannot be stored rejects alone, and the next is counted', async () => {
  const backend = memory();
  let failures = 1;
  const flaky: StoreBackend = {
    ...backend,
    setItem: async (key, value) => {
      if (failures > 0) {
        failures -= 1;
        throw new Error('the disk is full');
      }
      await backend.setItem(key, value);
    },
  };
  await assert.rejects(addDraftOutcome('kept', 'rules', flaky), /the disk is full/);
  await assert.doesNotReject(addDraftOutcome('edited', 'rules', flaky));
  assert.deepEqual((await readDraftTally(flaky)).rules, { kept: 0, edited: 1, dropped: 0 });
});

test('reset removes the tally, and a later count starts again from zero', async () => {
  const backend = memory({ [KEY]: JSON.stringify({ 'claude-haiku-5-5': { kept: 4, edited: 1, dropped: 2 }, 'claude-opus-5-5': NONE, rules: NONE }) });
  await resetDraftTally(backend);
  assert.equal(backend.rows.has(KEY), false);
  assert.deepEqual(await readDraftTally(backend), ZEROS);
  await addDraftOutcome('dropped', 'claude-haiku-5-5', backend);
  assert.deepEqual(await readDraftTally(backend), { ...ZEROS, 'claude-haiku-5-5': { kept: 0, edited: 0, dropped: 1 } });
});
