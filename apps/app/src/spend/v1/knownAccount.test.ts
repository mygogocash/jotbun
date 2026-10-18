import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';

import { ACCOUNT_A, ACCOUNT_B } from '../../storage/testing/diaryFixtures.ts';
import { createKnownAccount } from './knownAccount.ts';
import type { SecretSlot } from './knownAccount.ts';

function memorySlot() {
  let value: string | null = null;
  const slot: SecretSlot = { get: async () => value, set: async (next) => void (value = next), remove: async () => void (value = null) };
  return { slot, raw: () => value, put: (next: string | null) => void (value = next) };
}
const sha256Hex = async (text: string) => createHash('sha256').update(text).digest('hex');

test('the verified account is recalled only for the binding it was verified for', async () => {
  const memory = memorySlot();
  const known = createKnownAccount(memory.slot, sha256Hex);
  await known.remember('binding-one', ACCOUNT_A);
  assert.equal(await known.recall('binding-one'), ACCOUNT_A);
  // A new identity (a new binding, even for the same email) inherits nothing.
  assert.equal(await known.recall('binding-two'), null);
  assert.ok(!(memory.raw() ?? '').includes('binding-one'), 'the binding itself is never stored');
  await known.remember('binding-two', ACCOUNT_B);
  assert.equal(await known.recall('binding-one'), null);
  assert.equal(await known.recall('binding-two'), ACCOUNT_B);
  await known.forget();
  assert.equal(await known.recall('binding-two'), null);
});

test('a malformed or foreign stored value recalls nothing', async () => {
  const memory = memorySlot();
  const known = createKnownAccount(memory.slot, sha256Hex);
  for (const raw of ['not json', '{}', JSON.stringify({ v: 1, binding: await sha256Hex('b'), accountId: 'not-a-uuid' }), JSON.stringify({ v: 2, binding: await sha256Hex('b'), accountId: ACCOUNT_A })]) {
    memory.put(raw);
    assert.equal(await known.recall('b'), null, raw);
  }
  memory.put(JSON.stringify({ v: 1, binding: await sha256Hex('b'), accountId: ACCOUNT_A }));
  assert.equal(await known.recall('b'), ACCOUNT_A);
});
