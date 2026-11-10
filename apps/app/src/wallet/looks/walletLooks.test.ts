// Wallet looks (P2-T11, W7, R64): a wallet with no kept look gets a material
// and a face derived from its id, the same every time, and no kind; kept text
// is read leniently, a damaged entry dropped and never thrown.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { WALLET_MATERIALS } from '../../theme/walletPalette.ts';
import { BUN_FACES, derivedLook, keptEntries, parseLooks, parseOrder, WALLET_KINDS } from './walletLooks.ts';

test('a derived look is stable and always valid', () => {
  const materials = new Set<string>();
  const faces = new Set<string>();
  for (let index = 0; index < 1000; index += 1) {
    const id = randomUUID();
    const look = derivedLook(id);
    assert.deepEqual(derivedLook(id), look, id);
    assert.equal(look.kind, null, id);
    assert.ok(WALLET_MATERIALS.includes(look.material), id);
    assert.ok(BUN_FACES.includes(look.face), id);
    materials.add(look.material);
    faces.add(look.face);
  }
  // A thousand wallets meet every material and every face.
  assert.deepEqual([...materials].sort(), [...WALLET_MATERIALS].sort());
  assert.deepEqual([...faces].sort(), [...BUN_FACES].sort());
});

test("a derived look is the plan's: FNV-1a over the id's UTF-16 code units, the material from the hash, the face from the hash shifted by 8", () => {
  // FNV-1a's own test vectors: '' hashes to 0x811c9dc5, 'a' to 0xe40c292c and 'foobar' to 0xbf9cf968.
  assert.deepEqual(derivedLook(''), { kind: null, material: 'paper', face: 'wow' });
  assert.deepEqual(derivedLook('a'), { kind: null, material: 'silk', face: 'wink' });
  assert.deepEqual(derivedLook('foobar'), { kind: null, material: 'silk', face: 'wink' });
  // Code units, not UTF-8 bytes, which would give titanium and smile.
  assert.deepEqual(derivedLook('กระเป๋า'), { kind: null, material: 'silk', face: 'calm' });
  assert.deepEqual(['1', '2', '3'].map((n) => derivedLook(`00000000-0000-4000-8000-00000000000${n}`)), [
    { kind: null, material: 'titanium', face: 'smile' },
    { kind: null, material: 'sky', face: 'happy' },
    { kind: null, material: 'peach', face: 'smile' },
  ]);
});

test('damaged kept looks are dropped, not thrown', () => {
  assert.deepEqual(
    parseLooks('{"a":{"kind":"boat","material":"silk","face":"smile"},"b":{"kind":null,"material":"paper","face":"wow"}}'),
    { b: { kind: null, material: 'paper', face: 'wow' } },
  );
  assert.deepEqual(parseLooks('nope'), {});
  const kept = {
    card: { kind: 'credit_card', material: 'titanium', face: 'calm' },
    noKind: { material: 'silk', face: 'smile' },
    gold: { kind: 'bank', material: 'gold', face: 'smile' },
    grin: { kind: 'cash', material: 'silk', face: 'grin' },
    plain: 'silk',
    empty: null,
  };
  assert.deepEqual(parseLooks(JSON.stringify(kept)), { card: { kind: 'credit_card', material: 'titanium', face: 'calm' } });
  // Only a JSON object holds looks.
  for (const raw of [null, '', 'null', '5', '"silk"', '[{"kind":null,"material":"silk","face":"smile"}]']) assert.deepEqual(parseLooks(raw), {}, String(raw));
  assert.deepEqual(keptEntries('{"w1":1,"w2":"x"}'), [['w1', 1], ['w2', 'x']]);
});

test('the kept order is wallet ids in order, each once; anything else reads as no order', () => {
  assert.deepEqual(parseOrder('["w2","w1","w2",5,null,"w3"]'), ['w2', 'w1', 'w3']);
  for (const raw of [null, 'nope', '{"0":"w1"}', '"w1"', 'null']) assert.deepEqual(parseOrder(raw), [], String(raw));
});

test("the kinds are §5.2's four and the faces wc-wallet-edit's five, in the boards' order", () => {
  assert.deepEqual(WALLET_KINDS, ['cash', 'bank', 'credit_card', 'transit']);
  assert.deepEqual(BUN_FACES, ['smile', 'wink', 'calm', 'happy', 'wow']);
});
