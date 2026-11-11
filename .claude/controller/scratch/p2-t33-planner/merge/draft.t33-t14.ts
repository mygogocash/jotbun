// Every wallet draft table: Thai and English on each line, the same
// placeholders, no emoji or dash-as-punctuation, and keys that name their area.
import assert from 'node:assert/strict';
import { lstatSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { COMMON_COPY } from '../common/copy.ts';
import type { DraftTable } from './draftText.ts';
import { draftText, tableT } from './draftText.ts';

/**
 * Lines with no Thai letters of their own in Thai: what the boards write in
 * Latin letters in Thai too, such as card.kindTransit ("BTS / MRT"), and a
 * line made only of placeholders, such as add.chip ("{label} {amount}").
 */
const LATIN_LINES = new Set<string>(['card.kindTransit', 'add.chip']);

const THAI = /[\u0E00-\u0E7F]/;
const EMOJI = /\p{Extended_Pictographic}/u;
const PUNCTUATION_DASH = /[\u2013\u2014]/;
const AREA_KEY = /^[a-z]+\.[A-Za-z0-9_.]+$/;
// The lock's method is named Face ID in Thai too (sa-lock-setup, sa-locked).
LATIN_LINES.add('lock.methodFace');

const walletRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function copyFiles(dir: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const entry = lstatSync(path);
    if (entry.isDirectory()) found.push(...copyFiles(path));
    else if (entry.isFile() && name === 'copy.ts') found.push(path);
  }
  return found;
}

function isDraftTable(value: unknown): value is DraftTable {
  if (value === null || typeof value !== 'object') return false;
  const rows = Object.values(value as Record<string, unknown>);
  if (rows.length === 0) return false;
  return rows.every((row) => {
    if (row === null || typeof row !== 'object') return false;
    const line = row as { th?: unknown; en?: unknown };
    return typeof line.th === 'string' && typeof line.en === 'string';
  });
}

type LoadedLine = { key: string; th: string; en: string };

async function lines(): Promise<LoadedLine[]> {
  const found: LoadedLine[] = [];
  for (const file of copyFiles(walletRoot)) {
    const mod = await import(pathToFileURL(file).href);
    for (const value of Object.values(mod as Record<string, unknown>)) {
      if (!isDraftTable(value)) continue;
      for (const [key, line] of Object.entries(value)) found.push({ key, th: line.th, en: line.en });
    }
  }
  return found;
}

function placeholders(text: string): string[] {
  return [...text.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((match) => match[1]).sort();
}

test('every draft line has Thai and English, with the same placeholders', async () => {
  const found = await lines();
  assert.ok(found.some((line) => line.key === 'common.close'));
  for (const line of found) {
    assert.ok(line.th.length > 0, line.key);
    assert.ok(line.en.length > 0, line.key);
    if (!LATIN_LINES.has(line.key)) assert.match(line.th, THAI, line.key);
    assert.deepEqual(placeholders(line.th), placeholders(line.en), line.key);
  }
});

test('no draft line has an emoji or a dash used as punctuation', async () => {
  for (const line of await lines()) {
    assert.equal(EMOJI.test(line.th), false, line.key);
    assert.equal(EMOJI.test(line.en), false, line.key);
    assert.equal(PUNCTUATION_DASH.test(line.th), false, line.key);
    assert.equal(PUNCTUATION_DASH.test(line.en), false, line.key);
  }
});

test('every key is unique across every table and has an area prefix', async () => {
  const found = await lines();
  const keys = found.map((line) => line.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const key of keys) assert.match(key, AREA_KEY, key);
});

test('draftText picks Thai for th and English for en and vi, then fills placeholders', () => {
  const values = { amount: '12,480' };
  assert.equal(draftText(COMMON_COPY, 'common.baht', 'th', values), '12,480 บาท');
  assert.equal(draftText(COMMON_COPY, 'common.baht', 'en', values), '12,480 baht');
  assert.equal(draftText(COMMON_COPY, 'common.baht', 'vi', values), '12,480 baht');
  // One pass: a value that looks like a placeholder is inserted, not filled again.
  assert.equal(draftText(COMMON_COPY, 'common.baht', 'en', { amount: '{amount}' }), '{amount} baht');
  assert.equal(tableT(COMMON_COPY, 'th')('common.baht', values), '12,480 บาท');
  assert.equal(tableT(COMMON_COPY, 'vi')('common.close'), 'Close');
});
