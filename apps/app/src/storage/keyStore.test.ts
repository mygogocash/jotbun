import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createSecureKeyStore } from './keyStore.ts';
import type { SecureStorePort } from './keyStore.ts';

const THIS_DEVICE_ONLY = 7;

function fakeSecureStore() {
  const items = new Map<string, string>();
  const calls: { op: string; key: string; accessible: number }[] = [];
  const port: SecureStorePort = {
    async getItemAsync(key, options) {
      calls.push({ op: 'get', key, accessible: options.keychainAccessible });
      return items.get(key) ?? null;
    },
    async setItemAsync(key, value, options) {
      calls.push({ op: 'set', key, accessible: options.keychainAccessible });
      items.set(key, value);
    },
    async deleteItemAsync(key, options) {
      calls.push({ op: 'delete', key, accessible: options.keychainAccessible });
      items.delete(key);
    },
  };
  return { port, items, calls };
}

test('creates a random 256-bit key per account, kept on this device only', async () => {
  const secure = fakeSecureStore();
  let n = 0;
  const keys = createSecureKeyStore(secure.port, (bytes) => Uint8Array.from({ length: bytes }, () => (n += 37) % 256), THIS_DEVICE_ONLY);
  const a = await keys.create('0a000000-0000-4000-8000-00000000000a');
  const b = await keys.create('0b000000-0000-4000-8000-00000000000b');
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.notEqual(a, b);
  assert.equal(await keys.get('0a000000-0000-4000-8000-00000000000a'), a);
  assert.ok(secure.calls.every((call) => call.accessible === THIS_DEVICE_ONLY));
  assert.ok([...secure.items.keys()].every((key) => /^gogospend\.diary\.v1\.[0-9a-f-]{36}$/.test(key)));
  await keys.delete('0a000000-0000-4000-8000-00000000000a');
  assert.equal(await keys.get('0a000000-0000-4000-8000-00000000000a'), null);
});

test('refuses a malformed stored key or account id instead of using it', async () => {
  const secure = fakeSecureStore();
  const keys = createSecureKeyStore(secure.port, (bytes) => new Uint8Array(bytes).fill(9), THIS_DEVICE_ONLY);
  secure.items.set('gogospend.diary.v1.0a000000-0000-4000-8000-00000000000a', 'not-a-key');
  await assert.rejects(keys.get('0a000000-0000-4000-8000-00000000000a'));
  await assert.rejects(keys.create('../other'));
});
