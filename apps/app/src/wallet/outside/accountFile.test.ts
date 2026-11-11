import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';

import { accountMarker, parseAccountFile, readAccountFile, writeAccountFile } from './accountFile.ts';
import type { AccountFile, Digest } from './accountFile.ts';
import { OUTSIDE_FILES, memoryAppGroup, noAppGroup } from './appGroup.ts';

const ACCOUNT = '00000000-0000-4000-8000-0000000000aa';
const OTHER_ACCOUNT = '00000000-0000-4000-8000-0000000000bb';
const sha256Hex: Digest = async (text) => createHash('sha256').update(text).digest('hex');

test('the marker is the first 16 hex characters of SHA-256 over the labelled account id', async () => {
  const handed: string[] = [];
  const digest: Digest = (text) => {
    handed.push(text);
    return sha256Hex(text);
  };
  const expected = createHash('sha256').update(`jotbun-outside-marker:${ACCOUNT}`).digest('hex').slice(0, 16);
  assert.equal(expected, 'c0c03b1684a0dc26');
  assert.equal(await accountMarker(ACCOUNT, digest), expected);
  assert.deepEqual(handed, [`jotbun-outside-marker:${ACCOUNT}`]);
});

test('two accounts get different markers', async () => {
  const one = await accountMarker(ACCOUNT, sha256Hex);
  const other = await accountMarker(OTHER_ACCOUNT, sha256Hex);
  assert.notEqual(one, other);
  assert.equal(other, '3777b4a04ad6ce6c');
  assert.match(one, /^[0-9a-f]{16}$/);
  assert.equal(await accountMarker(ACCOUNT, sha256Hex), one);
});

test('the file has exactly v, marker, locale and hidden and never the account id', async () => {
  const group = memoryAppGroup();
  const file: AccountFile = { v: 1, marker: await accountMarker(ACCOUNT, sha256Hex), locale: 'th', hidden: true };
  await writeAccountFile(group, { ...file, accountId: ACCOUNT } as AccountFile);
  const text = group.files.get(OUTSIDE_FILES.account);
  assert.equal(typeof text, 'string');
  assert.deepEqual(Object.keys(JSON.parse(text as string)).sort(), ['hidden', 'locale', 'marker', 'v']);
  assert.equal((text as string).includes(ACCOUNT), false);
  assert.deepEqual(await readAccountFile(group), file);
  assert.deepEqual(parseAccountFile(JSON.stringify({ hidden: false, locale: 'en', marker: file.marker, v: 1 })), { v: 1, marker: file.marker, locale: 'en', hidden: false });
  const refused = [
    JSON.stringify({ ...file, accountId: ACCOUNT }),
    JSON.stringify({ ...file, marker: file.marker.slice(0, 15) }),
    JSON.stringify({ ...file, locale: 'vi' }),
    JSON.stringify({ ...file, marker: 'C0C03B1684A0DC26' }),
    JSON.stringify({ ...file, marker: [file.marker] }),
    JSON.stringify({ ...file, v: 2 }),
    JSON.stringify({ ...file, hidden: 'yes' }),
    JSON.stringify({ v: 1, marker: file.marker, locale: 'th' }),
    '[]',
    'null',
    '"outside"',
    'not json',
  ];
  for (const text of refused) assert.equal(parseAccountFile(text), null, text);
  assert.equal(parseAccountFile(null), null);
  assert.equal(await readAccountFile(memoryAppGroup()), null);
  assert.equal(await readAccountFile(noAppGroup), null);
});

test('writing refuses what reading refuses, so an account id is never written as the marker', async () => {
  const group = memoryAppGroup();
  const marker = await accountMarker(ACCOUNT, sha256Hex);
  const refused = [
    { v: 1, marker: ACCOUNT, locale: 'th', hidden: false },
    { v: 1, marker: marker.slice(0, 15), locale: 'th', hidden: false },
    { v: 1, marker: marker.toUpperCase(), locale: 'th', hidden: false },
    { v: 1, marker, locale: 'vi', hidden: false },
    { v: 1, marker, locale: 'th', hidden: 'no' },
  ] as unknown as AccountFile[];
  for (const file of refused) {
    await assert.rejects(writeAccountFile(group, file), (error: unknown) => error instanceof TypeError && !error.message.includes(ACCOUNT));
  }
  assert.equal(group.files.size, 0);
  await writeAccountFile(group, { v: 1, marker, locale: 'en', hidden: false });
  assert.deepEqual(await readAccountFile(group), { v: 1, marker, locale: 'en', hidden: false });
});
