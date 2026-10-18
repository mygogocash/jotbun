import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseCatalogueParams } from './params.ts';

test('a deep link names the section, theme and locale', () => {
  assert.deepEqual(parseCatalogueParams({ section: 'receipt', theme: 'dark', locale: 'th' }), { section: 'receipt', theme: 'dark', locale: 'th' });
  assert.deepEqual(parseCatalogueParams({ section: 'bun-m', theme: 'system', locale: 'vi' }), { section: 'bun-m', theme: 'system', locale: 'vi' });
  assert.deepEqual(parseCatalogueParams({ theme: 'light', locale: 'en' }), { section: null, theme: 'light', locale: 'en' });
});

test('missing or empty params leave the catalogue on its defaults', () => {
  assert.deepEqual(parseCatalogueParams({}), { section: null, theme: null, locale: null });
  assert.deepEqual(parseCatalogueParams({ section: '', theme: '', locale: '  ' }), { section: null, theme: null, locale: null });
});

test('values the app does not ship are ignored, not guessed', () => {
  // jp is web-only and sepia is not a theme; neither falls back to a neighbour.
  assert.deepEqual(parseCatalogueParams({ section: 'receipt', theme: 'sepia', locale: 'jp' }), { section: 'receipt', theme: null, locale: null });
  assert.deepEqual(parseCatalogueParams({ locale: 'th-TH', theme: 'darkish' }), { section: null, theme: null, locale: null });
});

test('case and surrounding spaces do not matter, so hand-typed links work', () => {
  assert.deepEqual(parseCatalogueParams({ section: ' Receipt ', theme: 'DARK', locale: 'TH' }), { section: 'receipt', theme: 'dark', locale: 'th' });
});

test('a repeated param takes its first value', () => {
  assert.deepEqual(
    parseCatalogueParams({ section: ['amount', 'receipt'], theme: ['light', 'dark'], locale: ['vi', 'th'] }),
    { section: 'amount', theme: 'light', locale: 'vi' },
  );
});
