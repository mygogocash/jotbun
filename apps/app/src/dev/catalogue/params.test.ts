import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseCatalogueChromeHidden, parseCatalogueParams, parseCatalogueTour } from './params.ts';

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

test('a tour steps every N milliseconds, between 1 and 10 seconds', () => {
  assert.equal(parseCatalogueTour({ tour: '3000' }), 3000);
  assert.equal(parseCatalogueTour({ tour: ' 1000 ' }), 1000);
  assert.equal(parseCatalogueTour({ tour: ['2500', '9000'] }), 2500);
  assert.equal(parseCatalogueTour({}), null);
  for (const bad of ['', '999', '10001', '2.5s', 'fast', '-3000', '3e3']) assert.equal(parseCatalogueTour({ tour: bad }), null, bad);
});

test('chrome=off hides the catalogue header, so a screen shows as it does on a phone', () => {
  assert.equal(parseCatalogueChromeHidden({ chrome: 'off' }), true);
  assert.equal(parseCatalogueChromeHidden({ chrome: ' OFF ' }), true);
  assert.equal(parseCatalogueChromeHidden({ chrome: ['off', 'on'] }), true);
  assert.equal(parseCatalogueChromeHidden({}), false);
  for (const other of ['', 'on', 'no', 'false', 'hidden']) assert.equal(parseCatalogueChromeHidden({ chrome: other }), false, other);
});
