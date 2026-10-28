import assert from 'node:assert/strict';
import { test } from 'node:test';

import { OUTSIDE_FILES, isSafeName, memoryAppGroup, noAppGroup } from './appGroup.ts';

test('the memory store reads what it wrote, lists a folder and removes', async () => {
  assert.deepEqual(OUTSIDE_FILES, { account: 'outside/account-v1.json', shares: 'outside/shares-v1.json', shareFolder: 'outside/shares' });
  const group = memoryAppGroup();
  assert.equal(group.available, true);
  assert.equal(await group.readText(OUTSIDE_FILES.account), null);
  await group.writeText(OUTSIDE_FILES.account, '{"v":1}');
  assert.equal(await group.readText(OUTSIDE_FILES.account), '{"v":1}');
  await group.writeText('outside/shares/b.png', 'b');
  await group.writeText('outside/shares/a.jpg', 'a');
  await group.writeText('outside/shares/deeper/c.jpg', 'c');
  assert.deepEqual(await group.list(OUTSIDE_FILES.shareFolder), ['a.jpg', 'b.png']);
  assert.equal(await group.copyIn('file:///private/var/mobile/share/slip.jpg', 'outside/shares/d.jpg'), true);
  assert.equal(group.files.get('outside/shares/d.jpg'), 'file:///private/var/mobile/share/slip.jpg');
  assert.equal(group.uriOf('outside/shares/d.jpg'), 'memory:///outside/shares/d.jpg');
  await group.remove('outside/shares/a.jpg');
  await group.remove('outside/shares/never-written.jpg');
  assert.deepEqual(await group.list(OUTSIDE_FILES.shareFolder), ['b.png', 'd.jpg']);
  assert.equal(group.uriOf('outside/shares/a.jpg'), null);
  assert.deepEqual(await group.list('outside/empty'), []);
});

test('unsafe names are refused', async () => {
  const group = memoryAppGroup();
  await assert.rejects(group.writeText('outside/../secret', 'x'), TypeError);
  await assert.rejects(group.readText('/etc/x'), TypeError);
  await assert.rejects(group.remove('outside/a/../b'), TypeError);
  await assert.rejects(group.list('outside/..'), TypeError);
  await assert.rejects(group.copyIn('file:///private/var/mobile/share/slip.jpg', 'outside/shares/../../slip.jpg'), TypeError);
  assert.throws(() => group.uriOf('../outside/account-v1.json'), TypeError);
  assert.equal(group.files.size, 0);
  assert.equal(isSafeName('/etc/x'), false);
  assert.equal(isSafeName('outside/a/../b'), false);
  assert.equal(isSafeName('outside/shares/3f2a-91.jpg'), true);
  for (const name of Object.values(OUTSIDE_FILES)) assert.equal(isSafeName(name), true, name);
  for (const name of ['outside', 'outside/', 'outside//a.json', 'outsider/a.json', 'x/outside/a.json', 'outside/Shares/a.jpg', 'outside/shares/a.gif', 'outside/shares/a.jpg/', 'outside/shares/.hidden', 'outside/shares/a.jpg.png']) {
    assert.equal(isSafeName(name), false, name);
  }
});

test('noAppGroup reads nothing and accepts writes', async () => {
  assert.equal(noAppGroup.available, false);
  await noAppGroup.writeText(OUTSIDE_FILES.account, '{"v":1}');
  assert.equal(await noAppGroup.readText(OUTSIDE_FILES.account), null);
  await noAppGroup.remove(OUTSIDE_FILES.account);
  assert.deepEqual(await noAppGroup.list(OUTSIDE_FILES.shareFolder), []);
  assert.equal(await noAppGroup.copyIn('file:///private/var/mobile/share/slip.jpg', 'outside/shares/a.jpg'), false);
  assert.equal(noAppGroup.uriOf(OUTSIDE_FILES.account), null);
  await assert.rejects(noAppGroup.writeText('outside/../secret', 'x'), TypeError);
  await assert.rejects(noAppGroup.readText('/etc/x'), TypeError);
  await assert.rejects(noAppGroup.remove('outside/a/../b'), TypeError);
  await assert.rejects(noAppGroup.list('outside/..'), TypeError);
  await assert.rejects(noAppGroup.copyIn('file:///private/var/mobile/share/slip.jpg', 'outside/shares/../../slip.jpg'), TypeError);
  assert.throws(() => noAppGroup.uriOf('../outside/account-v1.json'), TypeError);
});
