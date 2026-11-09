import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ANDROID_PACKAGE_PATTERN, IOS_BUNDLE_ID_PATTERN, TEMPORARY_IDS, outsideIdsFrom, outsideLink } from './outsideIds.ts';

test('with no extra the temporary ids apply', () => {
  assert.deepEqual(TEMPORARY_IDS, {
    iosBundleId: 'co.gogocash.jotbun.localcheck',
    androidPackage: 'co.gogocash.spend',
    appGroup: 'group.co.gogocash.jotbun.localcheck',
    keychainGroup: null,
    scheme: 'gogospend',
  });
  for (const extra of [undefined, null, {}, 'outside', 42, { outside: null }, { outside: 'co.example.app' }, { outside: [] }, { outside: {} }]) {
    assert.deepEqual(outsideIdsFrom(extra), TEMPORARY_IDS);
  }
});

test('each valid field overrides its default and a malformed one keeps it', () => {
  assert.deepEqual(
    outsideIdsFrom({ outside: { iosBundleId: 'th.co.jotbun.app', appGroup: 'group.th.co.jotbun.app', keychainGroup: 'ABCDE12345.th.co.jotbun.app.shared', scheme: '../x' } }),
    { iosBundleId: 'th.co.jotbun.app', androidPackage: 'co.gogocash.spend', appGroup: 'group.th.co.jotbun.app', keychainGroup: 'ABCDE12345.th.co.jotbun.app.shared', scheme: 'gogospend' },
  );
  assert.deepEqual(
    outsideIdsFrom({ outside: { iosBundleId: 'th..jotbun', androidPackage: 42, appGroup: 'th.co.jotbun.app', keychainGroup: 7, scheme: 'jotbun' } }),
    { ...TEMPORARY_IDS, scheme: 'jotbun' },
  );
  assert.equal(outsideIdsFrom({ outside: { appGroup: 'group.' } }).appGroup, TEMPORARY_IDS.appGroup);
  assert.equal(outsideIdsFrom({ outside: { appGroup: 'group.co' } }).appGroup, TEMPORARY_IDS.appGroup);
  assert.equal(outsideIdsFrom({ outside: { scheme: 'Jotbun' } }).scheme, 'gogospend');
});

test('a keychain group needs a ten-character team id', () => {
  assert.equal(outsideIdsFrom({ outside: { keychainGroup: 'ABCDE1234.th.co.jotbun' } }).keychainGroup, null);
  assert.equal(outsideIdsFrom({ outside: { keychainGroup: 'ABCDE123456.th.co.jotbun' } }).keychainGroup, null);
  assert.equal(outsideIdsFrom({ outside: { keychainGroup: 'abcde12345.th.co.jotbun' } }).keychainGroup, null);
  assert.equal(outsideIdsFrom({ outside: { keychainGroup: 'ABCDE12345.th.co.jotbun' } }).keychainGroup, 'ABCDE12345.th.co.jotbun');
});

test('the Android package allows _ and refuses -', () => {
  assert.equal(outsideIdsFrom({ outside: { androidPackage: 'th.co.jotbun_app' } }).androidPackage, 'th.co.jotbun_app');
  assert.equal(outsideIdsFrom({ outside: { androidPackage: 'th.co.jotbun-app' } }).androidPackage, 'co.gogocash.spend');
  assert.equal(outsideIdsFrom({ outside: { androidPackage: 'th.co.1jotbun' } }).androidPackage, 'co.gogocash.spend');
  // A36: P6A-T7's config and P6C compare these exact sources.
  assert.equal(IOS_BUNDLE_ID_PATTERN.source, '^[A-Za-z][A-Za-z0-9-]*(\\.[A-Za-z0-9-]+)+$');
  assert.equal(IOS_BUNDLE_ID_PATTERN.flags, '');
  assert.equal(ANDROID_PACKAGE_PATTERN.source, '^[A-Za-z][A-Za-z0-9_]*(\\.[A-Za-z][A-Za-z0-9_]*)+$');
  assert.equal(ANDROID_PACKAGE_PATTERN.flags, '');
});

test("outsideLink('gogospend', 'record') is 'gogospend://outside/record'", () => {
  assert.equal(outsideLink('gogospend', 'record'), 'gogospend://outside/record');
  assert.equal(outsideLink('gogospend', 'today'), 'gogospend://outside/today');
  assert.equal(outsideLink('gogospend', 'tell'), 'gogospend://outside/tell');
  assert.equal(outsideLink('jotbun', 'scan'), 'jotbun://outside/scan');
});
