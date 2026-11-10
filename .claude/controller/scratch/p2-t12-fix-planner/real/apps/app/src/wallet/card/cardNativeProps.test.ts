// What react-native-web drops from the wallet card, read from the source (R72's
// trap, as src/ui/dynamicType.test.ts does). The first case is P2-T11's review's
// ready case (n3): a card with no onPress is one accessibility element on a
// phone. The second is P2-T12's review's M1: VoiceOver's double tap runs the
// card's own press. Without onAccessibilityTap, React Native's iOS view answers
// NO to accessibilityActivate, and VoiceOver taps the middle of the card, which
// in the stack lies under the card in front, so that card would open instead.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'WalletCard.tsx'), 'utf8');

test('a card with no onPress is one accessibility element on a phone, labelled with its words', () => {
  assert.match(source, /<View accessible accessibilityLabel=\{words\.spoken\}/);
});

test("VoiceOver's double tap runs the card's own press, never a tap at the card's middle", () => {
  assert.match(source, /<Pressable accessibilityRole="button" accessibilityLabel=\{words\.spoken\} onPress=\{onPress\} onAccessibilityTap=\{onPress\}/);
});
