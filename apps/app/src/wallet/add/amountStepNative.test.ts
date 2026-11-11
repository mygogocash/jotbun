// What react-native-web cannot show of the amount step, read from the source
// (R72's trap, as src/ui/dynamicType.test.ts does). iOS reads no live region,
// so the keypad's problem, shown under the amount, is also said once
// (useAnnouncement): the first review's m5 (M2) and the second review's n2.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'AmountStep.tsx'), 'utf8');

test("iOS says the keypad's problem once, since it reads no live region", () => {
  assert.match(source, /\n {2}useAnnouncement\(problem\);\n/);
});
