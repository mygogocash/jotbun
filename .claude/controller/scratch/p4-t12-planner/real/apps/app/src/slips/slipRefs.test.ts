// P4-T12: the slip salt and the salted hash on the phone (§6.8 step 4, B12,
// S16). The salt is fetched once per account, kept in SecureStore on this
// device only while it is unlocked (in the given access group), held in
// memory, and asked for again after a failure; the phone's hash of P3's slip
// QR is the contract's vector; a reference that cannot be normalized gives no
// hash and asks for no salt. SecureStore and expo-crypto come in through
// loadModule, so Node runs these.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';

import { SLIP_REF_HASH_LABEL } from '@gogospend/contracts';
import type { SlipSaltDto } from '@gogospend/contracts';

import { V1Error } from '../api/client.ts';
import { parseSlipQr } from './slipQr.ts';
import { SALT_KEY_PREFIX, createSlipHasher, expoSha256, secureSaltStore } from './slipRefs.ts';
import type { Sha256 } from './slipRefs.ts';

const A = 'a0000000-0000-4000-8000-000000000001';
const B = 'b0000000-0000-4000-8000-000000000002';
const SALT_BYTES = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
const SALT: SlipSaltDto = { salt: Buffer.from(SALT_BYTES).toString('base64url') };
const OTHER_SALT: SlipSaltDto = { salt: Buffer.from(Uint8Array.from({ length: 32 }, (_, index) => 255 - index)).toString('base64url') };
// P3-T1's 004 slip (bank 004, reference 016298105512345678) and its 002 slip.
const SLIP_004 = parseSlipQr(' 00390006000001010300402180162981055123456785102TH91043BF7 ')!;
const SLIP_002 = parseSlipQr('004000060000010103002021900021231231212000115102TH91049C30')!;
const VECTOR = 'c4f3b6c8f15a0e588cfdb0a59d02f281e28eae69f0a3f8b22d6bda69f7ec1493';

const nodeSha256: Sha256 = async (data) => new Uint8Array(createHash('sha256').update(data).digest());
/** The contract's hash, as P4-T1's vector test computes it. */
const vector = (salt: Uint8Array, normalized: string) =>
  createHash('sha256').update(salt).update(SLIP_REF_HASH_LABEL).update(Buffer.from([0])).update(normalized).digest('hex');

type KeychainCall = { op: 'get' | 'set' | 'delete'; key: string; value?: string; options: unknown };
/** expo-secure-store as loadModule hands it over: items in memory, every call recorded; a locked one refuses reads. */
function fakeKeychain() {
  const items = new Map<string, string>();
  const calls: KeychainCall[] = [];
  const state = { locked: false };
  const keychain = {
    WHEN_UNLOCKED: 0,
    AFTER_FIRST_UNLOCK: 1,
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 6,
    async getItemAsync(key: string, options?: unknown) {
      calls.push({ op: 'get', key, options });
      if (state.locked) throw new Error('User interaction is not allowed.');
      return items.get(key) ?? null;
    },
    async setItemAsync(key: string, value: string, options?: unknown) {
      calls.push({ op: 'set', key, value, options });
      items.set(key, value);
    },
    async deleteItemAsync(key: string, options?: unknown) {
      calls.push({ op: 'delete', key, options });
      items.delete(key);
    },
  };
  return { items, calls, state, loadModule: async () => keychain as unknown as typeof import('expo-secure-store') };
}

/** The vault's salt route: each account's own salt, every fetch counted. */
function vault(salts: Record<string, SlipSaltDto>) {
  const fetched: string[] = [];
  return {
    fetched,
    resourcesFor: (accountId: string) => ({
      salt: async () => {
        fetched.push(accountId);
        return salts[accountId];
      },
    }),
  };
}

test('the salt is fetched once per account and kept with WHEN_UNLOCKED_THIS_DEVICE_ONLY, and in the given accessGroup', async () => {
  assert.equal(SALT_KEY_PREFIX, 'jotbun.slip-salt.');
  const keychain = fakeKeychain();
  const store = secureSaltStore({ accessGroup: 'group.app.jotbun', loadModule: keychain.loadModule });
  const server = vault({ [A]: SALT, [B]: OTHER_SALT });
  const hashA = createSlipHasher({ accountId: A, store, resources: server.resourcesFor(A), sha256: nodeSha256 });
  // Two slips at once, then one more: one fetch, one keychain read, one write.
  const [first, second] = await Promise.all([hashA(SLIP_004), hashA(SLIP_002)]);
  assert.equal(await hashA(SLIP_004), first);
  assert.deepEqual([first, second], [VECTOR, vector(SALT_BYTES, '002:0002123123121200011')]);
  assert.deepEqual(server.fetched, [A]);
  const secret = { keychainAccessible: 6, accessGroup: 'group.app.jotbun' };
  assert.deepEqual(keychain.calls, [
    { op: 'get', key: `jotbun.slip-salt.${A}`, options: secret },
    { op: 'set', key: `jotbun.slip-salt.${A}`, value: Buffer.from(SALT_BYTES).toString('hex'), options: secret },
  ]);
  // The next launch hashes with the kept salt and fetches nothing.
  const again = createSlipHasher({ accountId: A, store, resources: server.resourcesFor(A), sha256: nodeSha256 });
  assert.equal(await again(SLIP_004), VECTOR);
  assert.deepEqual(server.fetched, [A]);
  // Another account fetches and keeps its own.
  const hashB = createSlipHasher({ accountId: B, store, resources: server.resourcesFor(B), sha256: nodeSha256 });
  assert.notEqual(await hashB(SLIP_004), VECTOR);
  assert.deepEqual(server.fetched, [A, B]);
  assert.deepEqual([...keychain.items.keys()], [`jotbun.slip-salt.${A}`, `jotbun.slip-salt.${B}`]);
  // Without an access group the options name only how the salt is kept.
  const plain = fakeKeychain();
  await secureSaltStore({ loadModule: plain.loadModule }).read(A);
  assert.deepEqual(plain.calls, [{ op: 'get', key: `jotbun.slip-salt.${A}`, options: { keychainAccessible: 6 } }]);
});

test("forgetting deletes only that account's salt, and a kept value that is not a salt is fetched again", async () => {
  const keychain = fakeKeychain();
  const store = secureSaltStore({ loadModule: keychain.loadModule });
  await store.write(A, SALT_BYTES);
  await store.write(B, SALT_BYTES);
  assert.deepEqual(await store.read(A), SALT_BYTES);
  await store.forget(A);
  assert.equal(await store.read(A), null);
  assert.deepEqual(await store.read(B), SALT_BYTES);
  assert.deepEqual(keychain.calls.filter((call) => call.op === 'delete'), [{ op: 'delete', key: `jotbun.slip-salt.${A}`, options: { keychainAccessible: 6 } }]);
  for (const damaged of ['0102', 'AB'.repeat(32), `${'0'.repeat(63)}g`]) {
    keychain.items.set(`jotbun.slip-salt.${A}`, damaged);
    assert.equal(await store.read(A), null, damaged);
  }
  const server = vault({ [A]: SALT });
  const hash = createSlipHasher({ accountId: A, store, resources: server.resourcesFor(A), sha256: nodeSha256 });
  assert.equal(await hash(SLIP_004), VECTOR);
  assert.deepEqual(server.fetched, [A]);
  assert.equal(keychain.items.get(`jotbun.slip-salt.${A}`), Buffer.from(SALT_BYTES).toString('hex'));
});

test("the phone's hash of P3's slip QR is the contract's vector", async () => {
  assert.deepEqual(SLIP_004, { bankCode: '004', reference: '016298105512345678' });
  assert.equal(vector(SALT_BYTES, '004:016298105512345678'), VECTOR);
  const hash = createSlipHasher({ accountId: A, store: secureSaltStore({ loadModule: fakeKeychain().loadModule }), resources: vault({ [A]: SALT }).resourcesFor(A), sha256: nodeSha256 });
  assert.equal(await hash(SLIP_004), VECTOR);
  // The same bank code unpadded, and the same reference with spaces in it, is the same slip.
  assert.equal(await hash({ bankCode: '4', reference: ' 0162981055 1234567 8 ' }), VECTOR);
});

test("the app's SHA-256 is expo-crypto's digest, and gives the same vector", async () => {
  const asked: string[] = [];
  const expoCrypto = {
    CryptoDigestAlgorithm: { SHA1: 'SHA-1', SHA256: 'SHA-256', SHA512: 'SHA-512' },
    async digest(algorithm: string, data: Uint8Array) {
      asked.push(algorithm);
      const digest = createHash(algorithm.replace('-', '').toLowerCase()).update(data).digest();
      return digest.buffer.slice(digest.byteOffset, digest.byteOffset + digest.byteLength);
    },
  };
  const sha256 = expoSha256(async () => expoCrypto as unknown as typeof import('expo-crypto'));
  const hash = createSlipHasher({ accountId: A, store: secureSaltStore({ loadModule: fakeKeychain().loadModule }), resources: vault({ [A]: SALT }).resourcesFor(A), sha256 });
  assert.equal(await hash(SLIP_004), VECTOR);
  assert.deepEqual(asked, ['SHA-256']);
});

test('a reference that cannot be normalized gives no hash, and asks for no salt', async () => {
  const keychain = fakeKeychain();
  const server = vault({ [A]: SALT });
  const hash = createSlipHasher({ accountId: A, store: secureSaltStore({ loadModule: keychain.loadModule }), resources: server.resourcesFor(A), sha256: nodeSha256 });
  for (const slip of [{ bankCode: '0041', reference: 'A1' }, { bankCode: 'kb', reference: 'A1' }, { bankCode: '004', reference: '' }, { bankCode: '004', reference: 'ก1' }, { bankCode: '004', reference: 'A'.repeat(65) }]) {
    assert.equal(await hash(slip), null, JSON.stringify(slip));
  }
  assert.deepEqual(server.fetched, []);
  assert.deepEqual(keychain.calls, []);
});

test('a salt that could not be fetched is asked for again, and a locked keychain fetches none', async () => {
  const keychain = fakeKeychain();
  let failures = 1;
  let fetched = 0;
  const resources = {
    salt: async () => {
      fetched += 1;
      if (failures-- > 0) throw new V1Error('network', 0, 'NETWORK_ERROR');
      return SALT;
    },
  };
  const hash = createSlipHasher({ accountId: A, store: secureSaltStore({ loadModule: keychain.loadModule }), resources, sha256: nodeSha256 });
  await assert.rejects(hash(SLIP_004), (error: unknown) => error instanceof V1Error && error.code === 'NETWORK_ERROR');
  assert.equal(keychain.items.size, 0);
  assert.equal(await hash(SLIP_004), VECTOR);
  assert.equal(fetched, 2);
  // While the phone is locked the kept salt cannot be read: the hash fails, and no salt is fetched past it (P4-T15).
  keychain.state.locked = true;
  const locked = createSlipHasher({ accountId: A, store: secureSaltStore({ loadModule: keychain.loadModule }), resources, sha256: nodeSha256 });
  await assert.rejects(locked(SLIP_004), /User interaction is not allowed/);
  assert.equal(fetched, 2);
  keychain.state.locked = false;
  assert.equal(await locked(SLIP_004), VECTOR);
  assert.equal(fetched, 2);
});
