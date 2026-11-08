import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ACCOUNT_PREFIX, DEVICE_PREFIX, accountStore, deviceStore } from './walletStore.ts';
import type { StoreBackend } from './walletStore.ts';

function memory(seed: Record<string, string> = {}): StoreBackend & { getItem(key: string): Promise<string | null> } {
  const rows = new Map(Object.entries(seed));
  return {
    getItem: async (key) => rows.get(key) ?? null,
    setItem: async (key, value) => void rows.set(key, value),
    removeItem: async (key) => void rows.delete(key),
    getAllKeys: async () => [...rows.keys()],
    multiRemove: async (keys) => {
      for (const key of keys) rows.delete(key);
    },
  };
}

test('the device erase removes every jotbun.wallet. key and nothing else', async () => {
  const backend = memory({
    'jotbun.wallet.private-mode': 'on',
    'jotbun.account.a1.looks': 'warm',
    'gogospend.bun.intensity': 'full',
  });
  await deviceStore(backend).eraseAll();
  assert.equal(await backend.getItem('jotbun.wallet.private-mode'), null);
  assert.equal(await backend.getItem('jotbun.account.a1.looks'), 'warm');
  assert.equal(await backend.getItem('gogospend.bun.intensity'), 'full');
});

test("an account erase removes only that account's keys", async () => {
  const backend = memory({
    'jotbun.account.a1.looks': 'warm',
    'jotbun.account.a1.order': '1',
    'jotbun.account.a10.looks': 'kept',
    'jotbun.account.a2.looks': 'cool',
    'jotbun.wallet.private-mode': 'on',
  });
  await accountStore(backend, 'a1').eraseAll();
  assert.equal(await backend.getItem('jotbun.account.a1.looks'), null);
  assert.equal(await backend.getItem('jotbun.account.a1.order'), null);
  assert.equal(await backend.getItem('jotbun.account.a10.looks'), 'kept');
  assert.equal(await backend.getItem('jotbun.account.a2.looks'), 'cool');
  assert.equal(await backend.getItem('jotbun.wallet.private-mode'), 'on');
});

test('names are prefixed by their scope', async () => {
  assert.equal(DEVICE_PREFIX, 'jotbun.wallet.');
  assert.equal(ACCOUNT_PREFIX, 'jotbun.account.');
  const backend = memory();
  const device = deviceStore(backend);
  await device.set('private-mode', 'on');
  assert.equal(await backend.getItem('jotbun.wallet.private-mode'), 'on');
  assert.equal(await backend.getItem('private-mode'), null);
  assert.equal(await device.get('private-mode'), 'on');
  await device.remove('private-mode');
  assert.equal(await backend.getItem('jotbun.wallet.private-mode'), null);

  const account = accountStore(backend, 'a1');
  await account.set('looks', 'warm');
  assert.equal(await backend.getItem('jotbun.account.a1.looks'), 'warm');
  assert.equal(await backend.getItem('looks'), null);
  assert.equal(await account.get('looks'), 'warm');
  await account.remove('looks');
  assert.equal(await backend.getItem('jotbun.account.a1.looks'), null);
});
