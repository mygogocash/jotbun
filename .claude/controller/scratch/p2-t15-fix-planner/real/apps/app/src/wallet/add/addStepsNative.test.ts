// What react-native-web and happy-dom cannot show of the transfer step and its
// catalogue sections, read from the source (R72's trap, as
// amountStepNative.test.ts does; P2-T15's fix round, R114):
// - iOS reads no live region, so the one-wallet problem is also said once
//   (useAnnouncement: the first review's m3, the second review's M14);
// - happy-dom paints nothing, so the swap button's place over the to card on
//   the seam is read here (the first review's n2);
// - the wallet's section list loads the steps lazily and never imports them
//   (the controller's rule for sections; the first review's n4), and while
//   they load the section reads the catalogue's running mark, so the
//   catalogue's suites wait for it.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const transfer = readFileSync(join(here, 'TransferStep.tsx'), 'utf8');
const sections = readFileSync(join(here, '..', '..', 'dev', 'catalogue', 'wallet', 'addSections.tsx'), 'utf8');

test('iOS says the one-wallet problem once, since it reads no live region', () => {
  assert.match(transfer, /\n {2}useAnnouncement\(problem\);\n/);
});

test("the swap button draws over the to card on the seam, so the card never takes the button's taps", () => {
  assert.match(transfer, /\{ height: SEAM, alignItems: 'center', justifyContent: 'center', zIndex: 1 \}/);
});

test("the wallet's section list loads the steps lazily, never imports them, and reads the catalogue's running mark while they load", () => {
  assert.match(sections, /\nconst StepsTray = lazy\(\(\) => import\('\.\/addStepsSection'\)\);\n/);
  assert.match(sections, /<Suspense fallback=\{<View testID="catalogue-screen-running" style=\{\{ flex: 1 \}\} \/>\}>\n {6}<StepsTray label=\{label\} start=\{start\} \/>/);
  assert.doesNotMatch(sections, /from '@mobile\/wallet\/add\/(TransferStep|ConfirmStep|PickSteps)'/);
  assert.doesNotMatch(sections, /^import (?!type )[^\n]*'\.\/addStepsSection';$/m);
});
