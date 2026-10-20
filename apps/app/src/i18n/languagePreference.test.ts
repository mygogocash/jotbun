import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEFAULT_LANGUAGE_PREFERENCE, LANGUAGE_PREFERENCES, parseLanguagePreference, resolveLanguage } from './languagePreference.ts';

test('the choices: System (the phone), Thai and English; Vietnamese is not offered while it waits for its translation', () => {
  assert.deepEqual(LANGUAGE_PREFERENCES, ['system', 'th', 'en']);
  assert.equal(DEFAULT_LANGUAGE_PREFERENCE, 'system');
});

test('a stored choice is read back only when it is one of the choices', () => {
  assert.equal(parseLanguagePreference('system'), 'system');
  assert.equal(parseLanguagePreference('th'), 'th');
  assert.equal(parseLanguagePreference('en'), 'en');
  for (const value of ['vi', 'TH', 'th-TH', '', null, undefined, 1]) assert.equal(parseLanguagePreference(value), null, String(value));
});

test('System follows the phone, Vietnamese included; a choice wins over the phone', () => {
  assert.equal(resolveLanguage('system', 'en'), 'en');
  assert.equal(resolveLanguage('system', 'th'), 'th');
  assert.equal(resolveLanguage('system', 'vi'), 'vi');
  assert.equal(resolveLanguage('th', 'en'), 'th');
  assert.equal(resolveLanguage('th', 'vi'), 'th');
  assert.equal(resolveLanguage('en', 'th'), 'en');
});
