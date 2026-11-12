// P3's draft tables (P3-T14): src/wallet/{photos,bunai,receipts}/drafts.ts.
// Every line has Thai and English with the same placeholders, no emoji and no
// dash used as punctuation, and a key `<area>.<name>` of its own folder's
// area; and every key is used once across P3's tables and P2's (every
// src/wallet/**/copy.ts), so a P3 line never stands in for a P2 one. A table
// not written yet is skipped (photos is P3-T15's, receipts P3-T19's); bunai's
// must be there.
import assert from 'node:assert/strict';
import { existsSync, lstatSync, readdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const walletRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const P3_AREAS = ['photos', 'bunai', 'receipts'] as const;

/** Lines with no Thai letters of their own: one made only of placeholders. */
const LATIN_LINES = new Set<string>(['bunai.usesOf']);
const THAI = /[\u0E00-\u0E7F]/;
const EMOJI = /\p{Extended_Pictographic}/u;
const PUNCTUATION_DASH = /[\u2013\u2014]/;
const AREA_KEY = /^[a-z]+\.[A-Za-z0-9_.]+$/;

type Loaded = { key: string; th: string; en: string; file: string };

/** P2's tables: every copy.ts under src/wallet, as draftText.test.ts finds them. */
function copyFiles(dir: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    const file = join(dir, name);
    const entry = lstatSync(file);
    if (entry.isDirectory()) found.push(...copyFiles(file));
    else if (entry.isFile() && name === 'copy.ts') found.push(file);
  }
  return found;
}

function isTable(value: unknown): value is Readonly<Record<string, { th: string; en: string }>> {
  if (value === null || typeof value !== 'object') return false;
  const rows = Object.values(value as Record<string, unknown>);
  return rows.length > 0 && rows.every((row) => {
    if (row === null || typeof row !== 'object') return false;
    const line = row as { th?: unknown; en?: unknown };
    return typeof line.th === 'string' && typeof line.en === 'string';
  });
}

async function linesIn(files: readonly string[]): Promise<Loaded[]> {
  const found: Loaded[] = [];
  for (const file of files) {
    const mod = (await import(pathToFileURL(file).href)) as Record<string, unknown>;
    for (const value of Object.values(mod)) {
      if (!isTable(value)) continue;
      for (const [key, line] of Object.entries(value)) found.push({ key, th: line.th, en: line.en, file });
    }
  }
  return found;
}

function placeholders(text: string): string[] {
  return [...text.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((match) => match[1]).sort();
}

test('every P3 draft line has Thai and English with the same placeholders, no emoji and no dash, and a key used once', async () => {
  const p3 = await linesIn(P3_AREAS.map((area) => join(walletRoot, area, 'drafts.ts')).filter((file) => existsSync(file)));
  assert.ok(p3.some((line) => line.key === 'bunai.consentTitle'), "bunai's table is read");
  for (const line of p3) {
    assert.ok(line.th.length > 0, line.key);
    assert.ok(line.en.length > 0, line.key);
    if (!LATIN_LINES.has(line.key)) assert.match(line.th, THAI, line.key);
    assert.deepEqual(placeholders(line.th), placeholders(line.en), line.key);
    for (const text of [line.th, line.en]) {
      assert.equal(EMOJI.test(text), false, line.key);
      assert.equal(PUNCTUATION_DASH.test(text), false, line.key);
    }
    assert.match(line.key, AREA_KEY, line.key);
    assert.equal(line.key.split('.')[0], basename(dirname(line.file)), line.key);
  }
  const p2 = await linesIn(copyFiles(walletRoot));
  assert.ok(p2.some((line) => line.key === 'common.close'), "P2's tables are read");
  const keys = [...p3, ...p2].map((line) => line.key);
  assert.deepEqual(keys.filter((key, index) => keys.indexOf(key) !== index), []);
});
