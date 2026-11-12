// The outside lines (P6A-T2): P2-T3's checks over OUTSIDE_DRAFT, which
// draftText.test.ts does not reach (it reads only the files named copy.ts).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { DraftLine, DraftTable } from '../copy/draftText.ts';
import { OUTSIDE_DRAFT } from './outsideCopy.draft.ts';

/** Lines with no Thai letters of their own: a sign and a placeholder. */
const LATIN_LINES = new Set<string>(['outside.about', 'outside.percent']);

/** Every line P6A-T2 adds (the plan's copy list). Later P6A tasks add more. */
const TASK_LINES = [
  'outside.spentToday', 'outside.count', 'outside.today', 'outside.leftToday', 'outside.about', 'outside.overBy', 'outside.budgetMonth',
  'outside.percent', 'outside.spokenToday', 'outside.spokenLeft', 'outside.spokenOver', 'outside.spokenGauge', 'outside.spokenGaugeHidden',
  'outside.spokenHidden', 'outside.noBudget', 'outside.record', 'outside.scan', 'outside.log', 'outside.stale', 'outside.signedOut', 'outside.widgetName',
];

const THAI = /[\u0E00-\u0E7F]/;
const EMOJI = /\p{Extended_Pictographic}/u;
const PUNCTUATION_DASH = /[\u2013\u2014]/;
const OUTSIDE_KEY = /^outside\.[A-Za-z0-9_.]+$/;

function placeholders(text: string): string[] {
  return [...text.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((match) => match[1]).sort();
}

test('every outside line has Thai and English with the same placeholders, no emoji and no dash punctuation, under an outside. key', () => {
  const lines: [string, DraftLine][] = Object.entries(OUTSIDE_DRAFT as DraftTable);
  assert.deepEqual(TASK_LINES.filter((key) => !lines.some(([found]) => found === key)), []);
  for (const [key, line] of lines) {
    assert.match(key, OUTSIDE_KEY);
    assert.ok(line.th.length > 0, key);
    assert.ok(line.en.length > 0, key);
    if (!LATIN_LINES.has(key)) assert.match(line.th, THAI, key);
    assert.deepEqual(placeholders(line.th), placeholders(line.en), key);
    for (const text of [line.th, line.en]) {
      assert.equal(EMOJI.test(text), false, key);
      assert.equal(PUNCTUATION_DASH.test(text), false, key);
    }
  }
});
