// What react-native-web drops from the card stack, read from the source (R72's
// trap, as src/ui/dynamicType.test.ts does): on a phone the view each card
// registers for its frame must stay a real native view, or React Native may
// flatten it away as a layout-only view, and there would be nothing to measure;
// and no view of the stack may be `accessible`, or VoiceOver would meet the
// whole stack as one element instead of each card's button (P2-T12's review, n3).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(new URL('./CardStack.tsx', import.meta.url), 'utf8');

test('the view each card registers is kept as a native view, so it can be measured', () => {
  assert.match(source, /<View ref=\{register\} collapsable=\{false\}>/);
});

test("no view of the stack groups its cards into one accessibility element, so VoiceOver meets each card's button", () => {
  const code = source.replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(code, /\baccessible\b/);
});
