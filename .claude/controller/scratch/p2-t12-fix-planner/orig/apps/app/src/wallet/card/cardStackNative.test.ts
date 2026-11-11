// What react-native-web drops from the card stack, read from the source (R72's
// trap, as src/ui/dynamicType.test.ts does): on a phone the view each card
// registers for its frame must stay a real native view, or React Native may
// flatten it away as a layout-only view, and there would be nothing to measure.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(new URL('./CardStack.tsx', import.meta.url), 'utf8');

test('the view each card registers is kept as a native view, so it can be measured', () => {
  assert.match(source, /<View ref=\{register\} collapsable=\{false\}>/);
});
