import assert from 'node:assert/strict';
import { test } from 'node:test';

import { WALLET_TYPE, amountMaxScale } from './walletType.ts';

test('AX5 sizes follow ax-large-home: body 53, title 58, footnote 44', () => {
  const grown = (role: 'body' | 'h1' | 'caption') => Math.round(WALLET_TYPE[role].size * WALLET_TYPE[role].maxScale);
  assert.equal(grown('body'), 53);
  assert.equal(grown('h1'), 58);
  assert.equal(grown('caption'), 44);
});

test('an amount never passes 64 pt nor grows more than body text', () => {
  for (const size of [58, 44, 36, 34, 28, 22, 17, 16, 13]) {
    const scale = amountMaxScale(size);
    assert.ok(scale <= WALLET_TYPE.body.maxScale, `${size} grows past body text`);
    assert.ok(size * scale <= 64, `${size} passes 64 pt`);
  }
});
