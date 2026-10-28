import assert from 'node:assert/strict';
import { test } from 'node:test';

import { OUTSIDE_FILES, noAppGroup } from './appGroup.ts';
import { deviceAppGroup } from './deviceAppGroup.ts';
import type { FileSystemLike } from './deviceAppGroup.ts';
import { TEMPORARY_IDS } from './outsideIds.ts';

const CONTAINER = 'file:///containers/group.co.gogocash.jotbun.localcheck';
const OTHER_CONTAINER = 'file:///containers/group.th.co.other.app';
const DOCUMENTS = 'file:///data/user/0/co.gogocash.spend/files';
const SOURCE = 'file:///private/var/mobile/share/slip.jpg';
const WITH_GROUP = { [TEMPORARY_IDS.appGroup]: CONTAINER, 'group.th.co.other.app': OTHER_CONTAINER };

type Operation = 'text' | 'write' | 'delete' | 'copy' | 'create' | 'list';
type Part = string | { uri: string };
type FakeOptions = { containers?: Record<string, string>; files?: Record<string, string>; fail?: readonly Operation[] };

/**
 * A fake of expo-file-system's File, Directory and Paths over in-memory files
 * and folders. It records each operation as "<operation> <uri>[ <uri>]" and
 * fails like the real one: a write needs its folder, a create without
 * intermediates needs its parent, a copy onto a file needs overwrite.
 */
function fakeFs(options: FakeOptions = {}) {
  const calls: string[] = [];
  const files = new Map<string, string>(Object.entries(options.files ?? {}));
  const folders = new Set<string>([DOCUMENTS, ...Object.values(options.containers ?? {})]);
  const failing = new Set<Operation>(options.fail ?? []);
  const joined = (parts: readonly Part[]): string => parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('/');
  const parentOf = (uri: string): string => uri.slice(0, uri.lastIndexOf('/'));
  const record = (operation: Operation, ...uris: string[]): void => {
    calls.push([operation, ...uris].join(' '));
    if (failing.has(operation)) throw new Error(`${operation} failed`);
  };
  for (const uri of files.keys()) {
    for (let folder = parentOf(uri); folder.startsWith('file:///') && !folders.has(folder); folder = parentOf(folder)) folders.add(folder);
  }

  class FakeFile {
    readonly uri: string;
    constructor(...parts: Part[]) {
      this.uri = joined(parts);
    }
    get name(): string {
      return this.uri.slice(this.uri.lastIndexOf('/') + 1);
    }
    get exists(): boolean {
      return files.has(this.uri);
    }
    async text(): Promise<string> {
      record('text', this.uri);
      const text = files.get(this.uri);
      if (text === undefined) throw new Error('no such file');
      return text;
    }
    async write(text: string): Promise<void> {
      record('write', this.uri);
      if (!folders.has(parentOf(this.uri))) throw new Error('no such folder');
      files.set(this.uri, text);
    }
    delete(): void {
      record('delete', this.uri);
      if (!files.delete(this.uri)) throw new Error('no such file');
    }
    async copy(to: FakeFile, copyOptions?: { overwrite?: boolean }): Promise<void> {
      record('copy', this.uri, to.uri);
      const text = files.get(this.uri);
      if (text === undefined) throw new Error('no such file');
      if (!folders.has(parentOf(to.uri))) throw new Error('no such folder');
      if (files.has(to.uri) && !copyOptions?.overwrite) throw new Error('destination exists');
      files.set(to.uri, text);
    }
  }

  class FakeDirectory {
    readonly uri: string;
    constructor(...parts: Part[]) {
      this.uri = joined(parts);
    }
    get exists(): boolean {
      return folders.has(this.uri);
    }
    create(createOptions?: { intermediates?: boolean; idempotent?: boolean }): void {
      record('create', this.uri);
      if (folders.has(this.uri) && !createOptions?.idempotent) throw new Error('folder exists');
      if (!folders.has(parentOf(this.uri)) && !createOptions?.intermediates) throw new Error('no parent folder');
      for (let folder = this.uri; folder.startsWith('file:///') && !folders.has(folder); folder = parentOf(folder)) folders.add(folder);
    }
    list(): (FakeFile | FakeDirectory)[] {
      record('list', this.uri);
      if (!folders.has(this.uri)) throw new Error('no such folder');
      const inside = (uri: string): boolean => parentOf(uri) === this.uri;
      return [...[...folders].filter(inside).map((uri) => new FakeDirectory(uri)), ...[...files.keys()].filter(inside).map((uri) => new FakeFile(uri))];
    }
  }

  const containers = options.containers ?? {};
  const Paths = {
    get document() {
      return new FakeDirectory(DOCUMENTS);
    },
    get appleSharedContainers() {
      return Object.fromEntries(Object.entries(containers).map(([group, uri]) => [group, new FakeDirectory(uri)]));
    },
  };
  return { fs: { File: FakeFile, Directory: FakeDirectory, Paths } as unknown as FileSystemLike, calls, files };
}

test('on iOS the app group container is the root', async () => {
  const fake = fakeFs({ containers: WITH_GROUP, files: { [SOURCE]: 'slip-bytes' } });
  const group = deviceAppGroup(TEMPORARY_IDS, 'ios', fake.fs);
  assert.equal(group.available, true);
  await group.writeText(OUTSIDE_FILES.account, '{"v":1}');
  assert.equal(fake.files.get(`${CONTAINER}/outside/account-v1.json`), '{"v":1}');
  assert.equal(await group.readText(OUTSIDE_FILES.account), '{"v":1}');
  assert.equal(await group.readText(OUTSIDE_FILES.shares), null);
  assert.deepEqual(fake.calls.filter((call) => call.startsWith('text ')), [`text ${CONTAINER}/outside/account-v1.json`]);
  assert.equal(group.uriOf(OUTSIDE_FILES.account), `${CONTAINER}/outside/account-v1.json`);
  assert.equal(group.uriOf(OUTSIDE_FILES.shares), null);
  await group.writeText('outside/shares/b.png', 'b');
  assert.equal(await group.copyIn(SOURCE, 'outside/shares/a.jpg'), true);
  assert.equal(await group.copyIn(SOURCE, 'outside/shares/a.jpg'), true);
  assert.equal(fake.files.get(`${CONTAINER}/outside/shares/a.jpg`), 'slip-bytes');
  await group.writeText('outside/shares/inner/c.jpg', 'c');
  assert.deepEqual(await group.list(OUTSIDE_FILES.shareFolder), ['a.jpg', 'b.png']);
  await group.remove('outside/shares/a.jpg');
  await group.remove('outside/shares/never-written.jpg');
  assert.deepEqual(await group.list(OUTSIDE_FILES.shareFolder), ['b.png']);
  assert.deepEqual(await group.list('outside/empty'), []);
  assert.ok([...fake.files.keys()].every((uri) => uri === SOURCE || uri.startsWith(`${CONTAINER}/outside/`)));
});

test('on iOS without the group nothing is available and nothing is written', async () => {
  const withoutOurGroup: Record<string, string>[] = [{}, { 'group.th.co.other.app': OTHER_CONTAINER }];
  for (const containers of withoutOurGroup) {
    const fake = fakeFs({ containers, files: { [SOURCE]: 'slip-bytes' } });
    const group = deviceAppGroup(TEMPORARY_IDS, 'ios', fake.fs);
    assert.equal(group.available, false);
    await group.writeText(OUTSIDE_FILES.account, '{"v":1}');
    assert.equal(await group.readText(OUTSIDE_FILES.account), null);
    assert.equal(await group.copyIn(SOURCE, 'outside/shares/a.jpg'), false);
    assert.deepEqual(await group.list(OUTSIDE_FILES.shareFolder), []);
    assert.equal(group.uriOf(OUTSIDE_FILES.account), null);
    assert.deepEqual(fake.calls, []);
    assert.deepEqual([...fake.files.keys()], [SOURCE]);
  }
});

test('on Android the documents folder is the root', async () => {
  const fake = fakeFs({ containers: WITH_GROUP });
  const group = deviceAppGroup(TEMPORARY_IDS, 'android', fake.fs);
  assert.equal(group.available, true);
  await group.writeText(OUTSIDE_FILES.account, '{"v":1}');
  assert.deepEqual([...fake.files.keys()], [`${DOCUMENTS}/outside/account-v1.json`]);
  assert.equal(group.uriOf(OUTSIDE_FILES.account), `${DOCUMENTS}/outside/account-v1.json`);
});

test('on the web nothing is available', async () => {
  const fake = fakeFs({ containers: WITH_GROUP });
  const group = deviceAppGroup(TEMPORARY_IDS, 'web', fake.fs);
  assert.equal(group, noAppGroup);
  assert.equal(group.available, false);
  await group.writeText(OUTSIDE_FILES.account, '{"v":1}');
  assert.deepEqual(fake.calls, []);
  assert.equal(fake.files.size, 0);
});

test('a missing folder is created before a write', async () => {
  const fake = fakeFs({ containers: WITH_GROUP, files: { [SOURCE]: 'slip-bytes' } });
  const group = deviceAppGroup(TEMPORARY_IDS, 'ios', fake.fs);
  await group.writeText('outside/shares/a.json', '{}');
  assert.deepEqual(fake.calls, [`create ${CONTAINER}/outside/shares`, `write ${CONTAINER}/outside/shares/a.json`]);
  assert.equal(fake.files.get(`${CONTAINER}/outside/shares/a.json`), '{}');
  await group.writeText('outside/shares/b.json', '[]');
  assert.deepEqual(fake.calls.slice(2), [`write ${CONTAINER}/outside/shares/b.json`]);
  assert.equal(await group.copyIn(SOURCE, 'outside/copies/slip.jpg'), true);
  assert.equal(fake.files.get(`${CONTAINER}/outside/copies/slip.jpg`), 'slip-bytes');
});

test('a copy that fails answers false', async () => {
  const failing = fakeFs({ containers: WITH_GROUP, files: { [SOURCE]: 'slip-bytes' }, fail: ['copy'] });
  assert.equal(await deviceAppGroup(TEMPORARY_IDS, 'ios', failing.fs).copyIn(SOURCE, 'outside/shares/a.jpg'), false);
  assert.equal(failing.files.has(`${CONTAINER}/outside/shares/a.jpg`), false);
  const missing = fakeFs({ containers: WITH_GROUP });
  assert.equal(await deviceAppGroup(TEMPORARY_IDS, 'ios', missing.fs).copyIn('file:///private/var/mobile/share/gone.jpg', 'outside/shares/a.jpg'), false);
  assert.equal(missing.files.size, 0);
});

test('an unsafe name is refused before any file call', async () => {
  const fake = fakeFs({ containers: WITH_GROUP, files: { [SOURCE]: 'slip-bytes' } });
  const group = deviceAppGroup(TEMPORARY_IDS, 'ios', fake.fs);
  await assert.rejects(group.writeText('outside/../secret', 'x'), TypeError);
  await assert.rejects(group.readText('outside/../../Library/Preferences/x.json'), TypeError);
  await assert.rejects(group.remove('/etc/x'), TypeError);
  await assert.rejects(group.list('outside/a/../..'), TypeError);
  await assert.rejects(group.copyIn(SOURCE, 'outside/shares/../../x.jpg'), TypeError);
  assert.throws(() => group.uriOf('outside/../secret'), TypeError);
  assert.deepEqual(fake.calls, []);
  assert.deepEqual([...fake.files.keys()], [SOURCE]);
});

test('a native failure answers null or false, and a failed write or remove still resolves', async () => {
  const account = `${CONTAINER}/outside/account-v1.json`;
  const share = `${CONTAINER}/outside/shares/a.jpg`;
  const fake = fakeFs({ containers: WITH_GROUP, files: { [account]: '{"v":1}', [share]: 'slip-bytes' }, fail: ['text', 'write', 'delete', 'create', 'list'] });
  const group = deviceAppGroup(TEMPORARY_IDS, 'ios', fake.fs);
  assert.equal(await group.readText(OUTSIDE_FILES.account), null);
  await group.writeText(OUTSIDE_FILES.account, '{"v":2}');
  await group.writeText('outside/new/a.json', '{}');
  await group.remove(OUTSIDE_FILES.account);
  assert.deepEqual(await group.list(OUTSIDE_FILES.shareFolder), []);
  assert.equal(fake.files.get(account), '{"v":1}');
  assert.equal(fake.files.get(share), 'slip-bytes');
  assert.deepEqual(fake.calls, [
    `text ${account}`,
    `write ${account}`,
    `create ${CONTAINER}/outside/new`,
    `delete ${account}`,
    `list ${CONTAINER}/outside/shares`,
  ]);
  const broken = { Paths: { get document(): never { throw new Error('native'); }, get appleSharedContainers(): never { throw new Error('native'); } } } as unknown as FileSystemLike;
  assert.equal(deviceAppGroup(TEMPORARY_IDS, 'ios', broken).available, false);
  assert.equal(deviceAppGroup(TEMPORARY_IDS, 'android', broken).available, false);
  const unreadable = { ...fake.fs, File: class { constructor() { throw new Error('native'); } } } as unknown as FileSystemLike;
  assert.equal(deviceAppGroup(TEMPORARY_IDS, 'ios', unreadable).uriOf(OUTSIDE_FILES.account), null);
});
