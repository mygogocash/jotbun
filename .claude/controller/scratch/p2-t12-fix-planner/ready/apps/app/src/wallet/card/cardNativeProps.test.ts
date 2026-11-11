// Review ready case (P2-T11, data lens; R72's trap): react-native-web drops `accessible`,
// so a card with no onPress being one accessibility element on a phone is read from the source.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'WalletCard.tsx'), 'utf8');

test('a card with no onPress is one accessibility element on a phone, labelled with its words', () => {
  assert.match(source, /<View accessible accessibilityLabel=\{words\.spoken\}/);
});
