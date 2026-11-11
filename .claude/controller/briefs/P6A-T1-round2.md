# P6A-T1 round 2 brief: the review's fixes

For the Haiku implementer. Read `PROTOCOL` first: it is binding, except where this brief says otherwise on the orchestrator's ruling (no sync this round).

Paths used below:
- `PROTOCOL` = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/protocol.md`
- `WT` = `/Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p6a-t1` (your worktree, branch `p6a/t1-outside-ids`, at `489a525`). Every `npm` and `git` command runs with `WT` as the working directory, one git command per call, with `/usr/bin/git`.
- `FILES` = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p6a-t1-round2/files` (this brief's verified files: the Find and Replace texts, the scripts, `final/`, `SHA256SUMS`, `BASE-SHA256SUMS`, `commit-msg.txt`). Read-only for you.
- `SCRATCH` = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p6a-t1-round2-impl` (create it; your logs and the probe copy go there). Never keep anything under `/private/tmp`.

## 0. The task, the ruling and the files

- Task: P6A-T1 in `docs/superpowers/plans/2026-10-25-jotbun-p6a-outside-the-app.md` (`### Task P6A-T1`, line 83). Round 1 is commit `489a525`. The independent review approved it with four minors and a nit, and the orchestrator ruled that all five are fixed in this task before merge, as a second local commit on the same branch.
- **No fetch and no merge this round** (the orchestrator's ruling, in place of the protocol's step 1). The integration head is now `8f04a3b`; the orchestrator merges it when opening the PR. Only `docs/implementation/premium-progress.md` will conflict there (both sides append sections at the end; keep both), which is the orchestrator's job, not yours.
- What changes:
  1. Minor 1: the device test's fake file system treats a folder as expo-file-system 58.0.9's native code does (a `File` whose path is a folder does not exist, a write to it fails, its `delete()` removes the folder and everything in it, and a copy onto it with `overwrite` first removes the folder). A new test proves `remove('outside/shares')` leaves the waiting slips, which kills the review's surviving mutant E34.
  2. Minor 2: the device `copyIn` answers `false`, before any copy, when a folder holds the name, on every platform, so iOS's `copy` with `overwrite` can never delete it. It uses the installed API only: `Directory` (`node_modules/expo-file-system/build/Directory.d.ts:15`, `export declare class Directory extends ExpoFileSystem.FileSystemDirectory`; constructor at line 27, `constructor(...uris: (string | File | Directory)[])`) and its `exists` (`node_modules/expo-file-system/build/internal/NativeFileSystem.types.d.ts:37`, `exists: boolean`, "A boolean representing if a directory exists and can be accessed"; the constructor's note at line 12 says the location "may already contain a file"). Natively it is true only for a folder (iOS `ios/FileSystemDirectory.swift:52-61` returns `isDirectory.boolValue`; Android `FileSystemDirectory.kt:18-24` returns `file.isDirectory()`), so an existing file is still replaced. The memory store's `copyIn` answers `false` over a folder's name too, so tests over it see the same contract.
  3. Minor 3: `appOutside.ts` no longer imports expo-constants at the top. `appOutsideIds()` loads it on first use through a guarded, typed lazy `require` (the house pattern: `app/dev/catalogue.tsx:26` and this file's own expo-file-system load) and falls back to `TEMPORARY_IDS` when it cannot load. A render test that reaches the file then needs only the usual expo-crypto mock.
  4. Minor 4: the receipt's E34 and E44 claims are corrected.
  5. Nit 1: `writeAccountFile` refuses with a `TypeError`, before any write, any file `parseAccountFile` would refuse (one guard line), so an account id can never be written as the marker.
- `isSafeName` keeps the plan's regex exactly. Folder names pass it (its extension is optional); that is why the stores guard folders, and the receipt says so.
- Files this round touches (8, all already in round 1):
  - `apps/app/src/wallet/outside/deviceAppGroup.test.ts`, `appGroup.test.ts`, `accountFile.test.ts` (tests)
  - `apps/app/src/wallet/outside/deviceAppGroup.ts`, `appGroup.ts`, `accountFile.ts`, `appOutside.ts` (code)
  - `docs/implementation/premium-progress.md` (inside `### P6A Task 1` only)
- Touch nothing else: no `package.json`, lockfile, `app.json`, `featureFlags.ts`, `en.json`, `th.json`, other catalog, `outsideIds.ts` or `outsideIds.test.ts`, and no render test.

### How to make the edits

Each edit below is a Find block and a Replace block. The Find text occurs exactly once in its file. Apply a whole phase with the script, which uses exactly these texts and writes nothing if any Find is not found exactly once:

```sh
node /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p6a-t1-round2/files/apply-edits.mjs /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p6a-t1 <tests|code|receipt>
```

If the script refuses, stop and report BLOCKED with its output (do not hand-edit around it). The checksums in Step 5 prove the result either way.

## 1. Step 0: check the start

From `WT`:
1. `/usr/bin/git status --short`: prints nothing.
2. `/usr/bin/git log --oneline -1`: `489a525 Add the outside ids, an app group store over expo-file-system and an account file that names no account`.
3. `/usr/bin/git branch --show-current`: `p6a/t1-outside-ids`.
4. `ls node_modules/expo-file-system/package.json` exists (no install needed).
5. `shasum -a 256 -c /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p6a-t1-round2/files/BASE-SHA256SUMS`: 8 lines, each `OK`.
6. `mkdir -p /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p6a-t1-round2-impl`

## 2. Step 1: the tests, then RED

1. `node /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p6a-t1-round2/files/apply-edits.mjs /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p6a-t1 tests` (8 edits, 3 files).
2. `/usr/bin/git diff --stat`: `3 files changed, 75 insertions(+), 3 deletions(-)`.
3. RED: `npm run test:unit -w gogospend-app -- src/wallet/outside/outsideIds.test.ts src/wallet/outside/appGroup.test.ts src/wallet/outside/deviceAppGroup.test.ts src/wallet/outside/accountFile.test.ts > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p6a-t1-round2-impl/red.log 2>&1`. Expected: `tests 23`, `pass 20`, `fail 3`, each failure an `AssertionError [ERR_ASSERTION]` (none a missing module or syntax error). The three failing tests:
   - `a copy onto a folder's name answers false and leaves the folder`
   - `the memory store, like the device one, never copies onto a folder's name`
   - `writing refuses what reading refuses, so an account id is never written as the marker`
4. The fourth new test, `removing a folder's name leaves the folder and its files`, passes on `489a525`, because round 1's `remove` is already right; it exists to kill E34. Record its RED with E34 applied, then undo it:
   - In `apps/app/src/wallet/outside/deviceAppGroup.ts`, with the Edit tool, Find `        if (file.exists) file.delete();` and Replace with `        file.delete();` (8 leading spaces both times).
   - `node --test --test-name-pattern="removing a folder" apps/app/src/wallet/outside/deviceAppGroup.test.ts > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p6a-t1-round2-impl/red-e34.log 2>&1`. Expected: `tests 1`, `pass 0`, `fail 1`, `AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal`.
   - Edit it back: Find `        file.delete();` and Replace with `        if (file.exists) file.delete();`.
   - `/usr/bin/git diff --stat -- apps/app/src/wallet/outside/deviceAppGroup.ts`: prints nothing.

The test edits:

### Edit t1: `apps/app/src/wallet/outside/deviceAppGroup.test.ts` (the fake's comment names its folder behaviour)

Find:

````ts
 * fails like the real one: a write needs its folder, a create without
 * intermediates needs its parent, a copy onto a file needs overwrite.
 */
````

Replace with:

````ts
 * fails like the real one: a write needs its folder, a create without
 * intermediates needs its parent, a copy onto a file needs overwrite. A File
 * whose path is a folder acts as 58.0.9's native code does: it does not exist
 * (iOS FileSystemFile.exists, Android isFile), a write to it fails, its
 * delete() removes the folder and everything in it (iOS FileSystemPath.delete,
 * Android deleteRecursively), and a copy onto it with overwrite first removes
 * the folder (iOS FileSystemPath.copy).
 */
````

### Edit t2: `apps/app/src/wallet/outside/deviceAppGroup.test.ts` (the fake gains removeFolder)

Find:

````ts
    if (failing.has(operation)) throw new Error(`${operation} failed`);
  };
````

Replace with:

````ts
    if (failing.has(operation)) throw new Error(`${operation} failed`);
  };
  const removeFolder = (uri: string): void => {
    for (const file of [...files.keys()]) if (file.startsWith(`${uri}/`)) files.delete(file);
    for (const folder of [...folders]) if (folder === uri || folder.startsWith(`${uri}/`)) folders.delete(folder);
  };
````

### Edit t3: `apps/app/src/wallet/outside/deviceAppGroup.test.ts` (a fake write onto a folder fails)

Find:

````ts
      record('write', this.uri);
      if (!folders.has(parentOf(this.uri))) throw new Error('no such folder');
````

Replace with:

````ts
      record('write', this.uri);
      if (folders.has(this.uri)) throw new Error('a folder is there');
      if (!folders.has(parentOf(this.uri))) throw new Error('no such folder');
````

### Edit t4: `apps/app/src/wallet/outside/deviceAppGroup.test.ts` (a fake delete on a folder removes it and all in it)

Find:

````ts
      record('delete', this.uri);
      if (!files.delete(this.uri)) throw new Error('no such file');
    }
````

Replace with:

````ts
      record('delete', this.uri);
      if (files.delete(this.uri)) return;
      if (!folders.has(this.uri)) throw new Error('no such file');
      removeFolder(this.uri);
    }
````

### Edit t5: `apps/app/src/wallet/outside/deviceAppGroup.test.ts` (a fake copy with overwrite onto a folder removes it first)

Find:

````ts
      if (files.has(to.uri) && !copyOptions?.overwrite) throw new Error('destination exists');
      files.set(to.uri, text);
````

Replace with:

````ts
      const taken = files.has(to.uri) || folders.has(to.uri);
      if (taken && !copyOptions?.overwrite) throw new Error('destination exists');
      if (folders.has(to.uri)) removeFolder(to.uri);
      files.set(to.uri, text);
````

### Edit t6: `apps/app/src/wallet/outside/deviceAppGroup.test.ts` (two new device tests)

Find:

````ts
  assert.equal(deviceAppGroup(TEMPORARY_IDS, 'ios', unreadable).uriOf(OUTSIDE_FILES.account), null);
});
````

Replace with:

````ts
  assert.equal(deviceAppGroup(TEMPORARY_IDS, 'ios', unreadable).uriOf(OUTSIDE_FILES.account), null);
});

test("removing a folder's name leaves the folder and its files", async () => {
  const shares = `${CONTAINER}/outside/shares`;
  const fake = fakeFs({ containers: WITH_GROUP, files: { [`${shares}/a.jpg`]: 'A', [`${shares}/b.png`]: 'B' } });
  const group = deviceAppGroup(TEMPORARY_IDS, 'ios', fake.fs);
  await group.remove(OUTSIDE_FILES.shareFolder);
  assert.deepEqual(await group.list(OUTSIDE_FILES.shareFolder), ['a.jpg', 'b.png']);
  assert.equal(await group.readText(OUTSIDE_FILES.shareFolder), null);
  assert.equal(group.uriOf(OUTSIDE_FILES.shareFolder), null);
  await group.writeText(OUTSIDE_FILES.shareFolder, '{}');
  assert.deepEqual(await group.list(OUTSIDE_FILES.shareFolder), ['a.jpg', 'b.png']);
  assert.equal(fake.files.has(shares), false);
  assert.deepEqual(fake.calls.filter((call) => call.startsWith('delete ')), []);
});

test("a copy onto a folder's name answers false and leaves the folder", async () => {
  const platforms = [['ios', CONTAINER], ['android', DOCUMENTS]] as const;
  for (const [platform, root] of platforms) {
    const shares = `${root}/outside/shares`;
    const fake = fakeFs({ containers: WITH_GROUP, files: { [SOURCE]: 'slip-bytes', [`${shares}/a.jpg`]: 'A', [`${shares}/b.png`]: 'B' } });
    const group = deviceAppGroup(TEMPORARY_IDS, platform, fake.fs);
    assert.equal(await group.copyIn(SOURCE, OUTSIDE_FILES.shareFolder), false, platform);
    assert.deepEqual(await group.list(OUTSIDE_FILES.shareFolder), ['a.jpg', 'b.png'], platform);
    assert.equal(fake.files.has(shares), false, platform);
    assert.deepEqual(fake.calls.filter((call) => call.startsWith('copy ')), [], platform);
    assert.equal(await group.copyIn(SOURCE, 'outside/shares/a.jpg'), true, platform);
    assert.equal(fake.files.get(`${shares}/a.jpg`), 'slip-bytes', platform);
  }
});
````

### Edit t7: `apps/app/src/wallet/outside/appGroup.test.ts` (one new memory-store test)

Find:

````ts
  assert.throws(() => noAppGroup.uriOf('../outside/account-v1.json'), TypeError);
});
````

Replace with:

````ts
  assert.throws(() => noAppGroup.uriOf('../outside/account-v1.json'), TypeError);
});

test("the memory store, like the device one, never copies onto a folder's name", async () => {
  const group = memoryAppGroup();
  const source = 'file:///private/var/mobile/share/slip.jpg';
  await group.writeText('outside/shares/a.jpg', 'A');
  assert.equal(await group.copyIn(source, OUTSIDE_FILES.shareFolder), false);
  assert.equal(group.files.has(OUTSIDE_FILES.shareFolder), false);
  assert.deepEqual(await group.list(OUTSIDE_FILES.shareFolder), ['a.jpg']);
  assert.equal(await group.copyIn(source, 'outside/shares/a.jpg'), true);
  assert.equal(group.files.get('outside/shares/a.jpg'), source);
});
````

### Edit t8: `apps/app/src/wallet/outside/accountFile.test.ts` (one new account-file test)

Find:

````ts
  assert.equal(await readAccountFile(noAppGroup), null);
});
````

Replace with:

````ts
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
````

## 3. Step 2: the code, then GREEN

1. `node /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p6a-t1-round2/files/apply-edits.mjs /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p6a-t1 code` (10 edits, 4 files).
2. GREEN, the same command as RED (log to `.../p6a-t1-round2-impl/green.log`): `tests 23`, `pass 23`, `fail 0`.
3. `npm run typecheck:app`: exit 0.

The code edits:

### Edit c1: `apps/app/src/wallet/outside/appGroup.ts` (header: folder names pass isSafeName)

Find:

````ts
// Every store refuses an unsafe name with a TypeError before touching
// anything. Pure: no React, React Native or native module.
````

Replace with:

````ts
// Every store refuses an unsafe name with a TypeError before touching
// anything. isSafeName (the plan's pattern) lets a folder's name through as a
// file name, so no store deletes or replaces a folder through a file call.
// Pure: no React, React Native or native module.
````

### Edit c2: `apps/app/src/wallet/outside/appGroup.ts` (copyIn's contract)

Find:

````ts
  /** False when the source cannot be read. */
````

Replace with:

````ts
  /** False when the source cannot be read, or when a folder holds the name (never replaced). */
````

### Edit c3: `apps/app/src/wallet/outside/appGroup.ts` (memory store comment)

Find:

````ts
/** Tests: the files live in `files`. copyIn keeps the source uri as the file's text; uriOf answers `memory:///<name>`. */
````

Replace with:

````ts
/** Tests: the files live in `files`. copyIn keeps the source uri as the file's text and, as the device store does, answers false over a folder's name; uriOf answers `memory:///<name>`. */
````

### Edit c4: `apps/app/src/wallet/outside/appGroup.ts` (memory copyIn refuses a folder's name)

Find:

````ts
    copyIn: async (fromUri, name) => {
      refuseUnsafe(name);
      files.set(name, fromUri);
````

Replace with:

````ts
    copyIn: async (fromUri, name) => {
      refuseUnsafe(name);
      if ([...files.keys()].some((key) => key.startsWith(`${name}/`))) return false;
      files.set(name, fromUri);
````

### Edit c5: `apps/app/src/wallet/outside/deviceAppGroup.ts` (header: why folders are guarded)

Find:

````ts
// answers null, a copy false, and a write or a remove resolves, keeping the
// last good file. Pure: the file system is a type-only import.
````

Replace with:

````ts
// answers null, a copy false, and a write or a remove resolves, keeping the
// last good file. A folder is never touched through a file name (isSafeName
// lets a folder's name through): in 58.0.9 a File whose path is a folder does
// not exist, but its delete() removes the folder and all in it, and iOS's copy
// with overwrite removes it first. So remove deletes only what File.exists
// reports, and copyIn answers false when Directory.exists holds the name.
// Pure: the file system is a type-only import.
````

### Edit c6: `apps/app/src/wallet/outside/deviceAppGroup.ts` (remove: why the exists check stays)

Find:

````ts
        const file = fileAt(name);
        if (file.exists) file.delete();
````

Replace with:

````ts
        const file = fileAt(name);
        // exists is false for a folder, whose delete() would remove everything in it.
        if (file.exists) file.delete();
````

### Edit c7: `apps/app/src/wallet/outside/deviceAppGroup.ts` (device copyIn refuses a folder's name)

Find:

````ts
      try {
        makeFolderOf(name);
        await new fs.File(fromUri).copy(fileAt(name), { overwrite: true });
````

Replace with:

````ts
      try {
        // A folder at the name is never replaced: iOS's copy with overwrite would delete it first.
        if (new fs.Directory(root, name).exists) return false;
        makeFolderOf(name);
        await new fs.File(fromUri).copy(fileAt(name), { overwrite: true });
````

### Edit c8: `apps/app/src/wallet/outside/accountFile.ts` (writeAccountFile refuses what parseAccountFile refuses)

Find:

````ts
/** Writes the four fields by name, so nothing else the object carries reaches the file. */
export function writeAccountFile(group: AppGroupPort, file: AccountFile): Promise<void> {
  return group.writeText(OUTSIDE_FILES.account, JSON.stringify({ v: 1, marker: file.marker, locale: file.locale, hidden: file.hidden }));
}
````

Replace with:

````ts
/**
 * Writes the four fields by name, so nothing else the object carries reaches
 * the file, and only a file parseAccountFile accepts: anything else (an
 * account id as the marker, `vi`) is refused with a TypeError before a write.
 */
export async function writeAccountFile(group: AppGroupPort, file: AccountFile): Promise<void> {
  const text = JSON.stringify({ v: 1, marker: file.marker, locale: file.locale, hidden: file.hidden });
  if (parseAccountFile(text) === null) throw new TypeError('Not an account file.');
  await group.writeText(OUTSIDE_FILES.account, text);
}
````

### Edit c9: `apps/app/src/wallet/outside/appOutside.ts` (no top-level expo-constants import)

Find:

````ts
// expo-file-system, and SHA-256 through expo-crypto. expo-file-system loads on
// the first getAppGroup() on a phone: never on the web, and never in a test
// that installs a store with setAppGroup first.
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
````

Replace with:

````ts
// expo-file-system, and SHA-256 through expo-crypto. expo-constants loads on
// the first appOutsideIds() and expo-file-system on the first getAppGroup() on
// a phone, never at import: a render test that reaches this file needs only
// the usual expo-crypto mock (expo-constants cannot load there, so the
// temporary ids apply), and expo-file-system never loads on the web or in a
// test that installs a store with setAppGroup first.
import * as Crypto from 'expo-crypto';
````

### Edit c10: `apps/app/src/wallet/outside/appOutside.ts` (appOutsideIds loads expo-constants lazily)

Find:

````ts
/** outsideIdsFrom(Constants.expoConfig?.extra), read once. */
export function appOutsideIds(): OutsideIds {
  ids ??= outsideIdsFrom(Constants.expoConfig?.extra);
  return ids;
}
````

Replace with:

````ts
/** The evaluated config's `extra`, or undefined when expo-constants cannot load (a render test), so the temporary ids apply. */
function configExtra(): unknown {
  try {
    // A lazy require, as for expo-file-system below: expo-constants loads here, on first use.
    const constants: typeof import('expo-constants') = require('expo-constants');
    return constants.default.expoConfig?.extra;
  } catch {
    return undefined;
  }
}

/** outsideIdsFrom(Constants.expoConfig?.extra), read once. */
export function appOutsideIds(): OutsideIds {
  ids ??= outsideIdsFrom(configExtra());
  return ids;
}
````

## 4. Step 3: the mutation check

From `WT`:
1. `shasum -a 256 apps/app/src/wallet/outside/*.ts > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p6a-t1-round2-impl/sums-before.txt`
2. `node /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p6a-t1-round2/files/mutants-r2.mjs /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p6a-t1/apps/app/src/wallet/outside`. Each mutant is applied in place, its test file run, and the file restored and checked. Expected, exactly:

```text
R1 (E34) remove deletes without the exists check: killed (failed 1, passed 9) removing a folder's name leaves the folder and its files
R2 device copyIn without the folder guard: killed (failed 1, passed 9) a copy onto a folder's name answers false and leaves the folder
R3 device copyIn asks File instead of Directory: killed (failed 2, passed 8) on iOS the app group container is the root | a copy onto a folder's name answers false and leaves the folder
R4 memory copyIn without the folder guard: killed (failed 1, passed 3) the memory store, like the device one, never copies onto a folder's name
R5 memory guard without the slash: killed (failed 1, passed 3) the memory store, like the device one, never copies onto a folder's name
R6 writeAccountFile without the guard: killed (failed 1, passed 3) writing refuses what reading refuses, so an account id is never written as the marker
R7 the guard checks only the marker: killed (failed 1, passed 3) writing refuses what reading refuses, so an account id is never written as the marker
R8 the guard runs after the write: killed (failed 1, passed 3) writing refuses what reading refuses, so an account id is never written as the marker
R9 a plain Error instead of a TypeError: killed (failed 1, passed 3) writing refuses what reading refuses, so an account id is never written as the marker
R10 the message carries the marker: killed (failed 1, passed 3) writing refuses what reading refuses, so an account id is never written as the marker
mutants: 10, survivors: 0
```

3. `node /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p6a-t1-round2/files/mutants-r1.mjs /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p6a-t1/apps/app/src/wallet/outside` (round 1's 17, a copy of the lost round 1 script, rerun on the new code). Expected, exactly:

```text
M1 skip isSafeName in device writeText: killed (failed 1, passed 9) an unsafe name is refused before any file call
M2 return the whole digest: killed (failed 4, passed 0) the marker is the first 16 hex characters of SHA-256 over the labelled account id | two accounts get different markers | the file has exactly v, marker, locale and hidden and never the account id | writing refuses what reading refuses, so an account id is never written as the marker
M3 root iOS at Paths.document: killed (failed 6, passed 4) on iOS the app group container is the root | on iOS without the group nothing is available and nothing is written | a missing folder is created before a write | a native failure answers null or false, and a failed write or remove still resolves | removing a folder's name leaves the folder and its files | a copy onto a folder's name answers false and leaves the folder
M4 package checked with the iOS pattern: killed (failed 1, passed 4) the Android package allows _ and refuses -
M5 parse accepts any keys: killed (failed 1, passed 3) the file has exactly v, marker, locale and hidden and never the account id
M6 write spreads the input: killed (failed 1, passed 3) the file has exactly v, marker, locale and hidden and never the account id
M7 app group without the group. prefix: killed (failed 1, passed 4) each valid field overrides its default and a malformed one keeps it
M8 team id of 9 or 10: killed (failed 1, passed 4) a keychain group needs a ten-character team id
M9 device list keeps folders: killed (failed 1, passed 9) on iOS the app group container is the root
M10 device read lets a failure through: killed (failed 1, passed 9) a native failure answers null or false, and a failed write or remove still resolves
M11 folder made without intermediates: killed (failed 1, passed 9) a missing folder is created before a write
M12 copy without overwrite: killed (failed 2, passed 8) on iOS the app group container is the root | a copy onto a folder's name answers false and leaves the folder
M13 safe names allow dots in segments: killed (failed 2, passed 2) unsafe names are refused | noAppGroup reads nothing and accepts writes
M14 memory list keeps nested files: killed (failed 1, passed 3) the memory store reads what it wrote, lists a folder and removes
M15 device uriOf ignores existence: killed (failed 2, passed 8) on iOS the app group container is the root | removing a folder's name leaves the folder and its files
M16 scheme unchecked: killed (failed 1, passed 4) each valid field overrides its default and a malformed one keeps it
M17 device write lets a failure through: killed (failed 2, passed 8) a native failure answers null or false, and a failed write or remove still resolves | removing a folder's name leaves the folder and its files
mutants: 17, survivors: 0
```

4. `shasum -a 256 apps/app/src/wallet/outside/*.ts > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p6a-t1-round2-impl/sums-after.txt`, then `diff` the two files: no output.
5. `/usr/bin/git diff --stat`: `7 files changed, 117 insertions(+), 15 deletions(-)`.

## 5. Step 4: the gate

From `WT`, each to a log in `SCRATCH`:
- `npm run typecheck:app`: exit 0.
- `npm run typecheck:routes -w gogospend-app`: exit 0.
- `npm run test:app`: `tests 29`, `pass 29`, `fail 0`.
- `npm run test:unit`: `tests 757`, `pass 757`, `fail 0` (753 after round 1, plus the 4 new tests).
- The four outside files (the RED command): `tests 23`, `pass 23`.
- Not run, and say so in the final message: the full render suite (no render test imports these files; only `src/wallet/outside/` does, and the probe in Step 7 runs the wiring under the render harness); `npm run export:web` (no route, config or app entry changed); `npm run check:native` (P6A-T7 adds it); the API, edge and database gates (nothing there changed).

## 6. Step 5: the receipt, then the checksums

1. `node /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p6a-t1-round2/files/apply-edits.mjs /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p6a-t1 receipt` (9 edits, inside `### P6A Task 1` only; every number in them is the count this brief expects, so they hold only if your runs matched).
2. `shasum -a 256 -c /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p6a-t1-round2/files/SHA256SUMS`: 8 lines, each `OK`. (`FILES/final/` holds byte-identical copies of the 8 files.)

The receipt edits:

### Edit r1: `docs/implementation/premium-progress.md` (Status: Round 2 is a second commit)

Find:

````markdown
passes alone (see Gate). Committed locally, not pushed. The independent review is the controller's, after this receipt.
````

Replace with:

````markdown
passes alone (see Gate). Committed locally, not pushed. The independent review found four minors and a nit; Round 2 (below) fixes them in a second local commit on the same branch, still on `bdf6b12`.
````

### Edit r2: `docs/implementation/premium-progress.md` (Extended run: six equivalent, two corrected)

Find:

````markdown
8 survived, and each is equivalent rather than a gap: E28
````

Replace with:

````markdown
8 survived. Six are equivalent; E34 was not, and E44 is only within one process (both corrected in Round 2): E28
````

### Edit r3: `docs/implementation/premium-progress.md` (Extended run: the E34 claim corrected)

Find:

````markdown
E34 `remove` calls `delete` on a missing file, which either throws (swallowed) or does nothing;
````

Replace with:

````markdown
E34 (`remove` without its `exists` check) was wrongly called equivalent: in expo-file-system 58.0.9 a `File` whose path is a folder does not exist, yet its `delete()` removes the folder and everything in it (iOS `FileSystemPath.delete`, Android `deleteRecursively`), so `remove('outside/shares')` would delete every waiting slip, and the first fake did not model that; Round 2's fake does, and a new test kills E34;
````

### Edit r4: `docs/implementation/premium-progress.md` (Extended run: the E44 claim corrected)

Find:

````markdown
E44 `makeFolderOf` drops `idempotent`, which only matters for a folder that exists, and the guard never creates one;
````

Replace with:

````markdown
E44 `makeFolderOf` drops `idempotent`, equivalent only within one process: another process sharing the app group (P6A-T10's share extension) can create the folder between the `exists` check and `create`, which then throws and loses the write, so `idempotent: true` stays, and no single-process test can tell the two apart;
````

### Edit r5: `docs/implementation/premium-progress.md` (Survivors line)

Find:

````markdown
  - Survivors that need a test: none. `appOutside.ts` has no test, so its branches were not mutated.
````

Replace with:

````markdown
  - Survivors that need a test: E34, added in Round 2. `appOutside.ts` has no Node test, so its branches were not mutated here; Round 2's render probe mutates its lazy load.
````

### Edit r6: `docs/implementation/premium-progress.md` (the Round 2 block after the Gate)

Find:

````markdown
  - Not run: `npm run check:native` (P6A-T7 adds it); the contracts, API and edge gates and the database suites (nothing there changed).
````

Replace with:

````markdown
  - Not run: `npm run check:native` (P6A-T7 adds it); the contracts, API and edge gates and the database suites (nothing there changed).
- **Round 2 (review fixes, a second local commit):** the independent review's minors 1 to 4 and its first nit, as the orchestrator ruled. Not merged with the integration head (the orchestrator merges it when opening the PR). No package manifest, lockfile, `app.json`, `featureFlags.ts` or message catalog changed.
  - Folders (minors 1 and 2). `isSafeName` keeps the plan's pattern, whose extension is optional, so a folder's name such as `OUTSIDE_FILES.shareFolder` passes it as a file name. In expo-file-system 58.0.9 a `File` whose path is a folder does not exist (iOS `FileSystemFile.exists`, Android `isFile()`), but its `delete()` removes the folder and everything in it, and iOS's `copy` with `overwrite` removes whatever is at the destination first (`FileSystemPath.copy`; Android's `copy` refuses a folder). That is why the stores guard folders: the device `remove` deletes only what `File.exists` reports, and the device `copyIn` answers `false`, before any copy, when `new fs.Directory(root, name).exists` (`Directory` in `build/Directory.d.ts`, its `exists` in `build/internal/NativeFileSystem.types.d.ts`, true only for a folder), on iOS and Android alike. The memory store's `copyIn` answers `false` over a folder's name too, so tests over it see the device's contract. The test fake now treats a folder as the native code does.
  - The account file (nit 1). `writeAccountFile` refuses with a `TypeError`, before any write, a file `parseAccountFile` would refuse: an account id as the marker, a short or upper-case marker, `vi`, a `hidden` that is not a boolean. The message never carries the value.
  - expo-constants (minor 3). `appOutside.ts` no longer imports it at the top: `appOutsideIds()` loads it on first use through a guarded, typed lazy `require` (the house pattern of `app/dev/catalogue.tsx` and of this file's expo-file-system load) and falls back to `TEMPORARY_IDS` when it cannot load.
  - New tests (4, plan names kept): `deviceAppGroup.test.ts` `removing a folder's name leaves the folder and its files` and `a copy onto a folder's name answers false and leaves the folder` (iOS and Android roots); `appGroup.test.ts` `the memory store, like the device one, never copies onto a folder's name`; `accountFile.test.ts` `writing refuses what reading refuses, so an account id is never written as the marker`.
  - RED on `489a525` (the new tests over the old code), `npm run test:unit -w gogospend-app -- <the four files>`: 3 failed, 20 passed, each failure an assertion (`AssertionError [ERR_ASSERTION]`): the two copy tests and the account-file test. The remove test passes on `489a525`, whose `remove` was already right; with E34 applied there it fails (1 failed, 0 passed, `--test-name-pattern="removing a folder"`).
  - GREEN, the same command: 23 passed, 0 failed.
  - Mutants (`.claude/controller/scratch/p6a-t1-round2/files/mutants-r2.mjs`, each in place, restore checked, sha256 equal before and after): 10, all killed. R1 (E34) `remove` without the `exists` check, R2 the device `copyIn` without the folder guard, R3 the guard asking `File` instead of `Directory`, R4 the memory `copyIn` without its guard, R5 that guard without the `/`, R6 `writeAccountFile` without its guard, R7 the guard checking only the marker, R8 the guard after the write, R9 a plain `Error`, R10 the message carrying the marker. The first round's 17 (`.claude/controller/scratch/p6a-t1-round2/files/mutants-r1.mjs`, a copy of the first round's script) rerun on the Round 2 code: 17 killed.
  - Render probe (scratch copy only, never the worktree; `.claude/controller/scratch/p6a-t1-round2/files/probe/`): the render harness's own config with its include narrowed to two probe files, no expo-constants mock. With only `randomUUID` mocked, `appOutside` loads, `appOutsideIds()` is `TEMPORARY_IDS`, `getAppGroup()` is `noAppGroup`, and `setAppGroup` installs and restores. With the fuller usual mock (`digestStringAsync`, `CryptoDigestAlgorithm`), `appDigest` gives the marker `c0c03b1684a0dc26` and the account file round-trips through `getAppGroup()`. 2 passed. On `489a525` both files fail to load (`ReferenceError: __DEV__ is not defined`). Probe mutants: L1 the `require` without its guard, L2 the top-level import back: both killed.
  - Gate (worktree root): `npm run typecheck:app` passed; `npm run typecheck:routes -w gogospend-app` passed; `npm run test:app` 29 passed; `npm run test:unit` 757 passed, 0 failed (753 + the 4 new tests); the four outside files 23 passed; `git diff --check origin/claude/p1a-vault-core...HEAD` clean. The render suite was not run: no render test imports the changed files (only `src/wallet/outside/` does), and the probe ran the wiring under the render harness.
````

### Edit r7: `docs/implementation/premium-progress.md` (Deviations 9 to 11)

Find:

````markdown
`accountFile.test.ts`, an array marker is refused.
````

Replace with:

````markdown
`accountFile.test.ts`, an array marker is refused.
  9. Round 2: the device and memory `copyIn` answer `false` when a folder holds the name; the plan says only "false when the source cannot be read".
  10. Round 2: `writeAccountFile` refuses with a `TypeError` any file `parseAccountFile` would refuse; the plan gives it no check.
  11. Round 2: `appOutside.ts` loads expo-constants lazily inside `appOutsideIds()` and falls back to `TEMPORARY_IDS`; the plan lists expo-constants for this file without saying how it loads. A `vi.mock('expo-constants')` no longer reaches it, since the `require` bypasses Vitest's module mocks; `outsideIdsFrom`'s tests cover the ids.
````

### Edit r8: `docs/implementation/premium-progress.md` (Notes: render tests need no expo-constants mock)

Find:

````markdown
  - Render tests whose imports reach `appOutside.ts` (P6A-T3a, P6A-T3b): it imports expo-constants and expo-crypto at the top, and expo-modules-core needs `__DEV__`, which the render harness lacks. Such a test needs `vi.mock('expo-constants', () => ({ default: { expoConfig: null } }))` beside the usual expo-crypto mock, then `setAppGroup(memoryAppGroup())`. The planning step checked this in a scratch copy: without the mock the file fails to load (`ReferenceError: __DEV__ is not defined`); with both mocks it loads, `getAppGroup()` is `noAppGroup` on the web, and `appDigest` gives the expected marker through a mocked `digestStringAsync`.
````

Replace with:

````markdown
  - Render tests whose imports reach `appOutside.ts` (P6A-T3a, P6A-T3b): since Round 2 it imports only expo-crypto and react-native at the top. Such a test needs the usual expo-crypto mock (with `digestStringAsync` and `CryptoDigestAlgorithm` if it reaches `appDigest`), then `setAppGroup(memoryAppGroup())`, and no expo-constants mock: expo-constants cannot load under the render harness, so `appOutsideIds()` gives `TEMPORARY_IDS`. Without the expo-crypto mock the file still fails to load (`ReferenceError: __DEV__ is not defined`), as every file that imports expo-crypto does.
````

### Edit r9: `docs/implementation/premium-progress.md` (Notes: read back, folder names, the account-file rejection)

Find:

````markdown
  - A failed native write or remove resolves without telling the caller, as the plan's global constraint asks; a later read shows what stayed.
````

Replace with:

````markdown
  - A failed native write or remove resolves without telling the caller, as the plan's global constraint asks; a later read shows what stayed. P6A-T3b's erase after a confirmed deletion and P6A-T6a's queue index should read back where the outcome matters.
  - A folder's name passes `isSafeName`, so name every file with its extension (`outside/shares/<id>.<ext>`). Through a file call the device store never deletes or replaces a folder (Round 2): `remove` of a folder's name does nothing and `copyIn` onto one answers `false`.
  - `writeAccountFile` rejects with a `TypeError` for a file the reader would refuse (Round 2). P6A-T3a computes the marker with `accountMarker` and writes `vi` as `en`; its bridge should catch a rejection rather than let it surface.
````

## 7. Step 6: commit

The message is `FILES/commit-msg.txt` (summary line, 66 characters; the Haiku trailer):

```text
Guard app group folders, refuse bad account files, load ids lazily

P6A-T1 round 2, the independent review's fixes. The device and memory
stores never delete or replace a folder through a file name: remove
keeps its exists check, now tested against a fake that treats a folder
as expo-file-system 58.0.9 does, and copyIn answers false when a
folder holds the name. writeAccountFile refuses with a TypeError any
file parseAccountFile would refuse, so an account id is never written
as the marker. appOutside.ts loads expo-constants on the first
appOutsideIds() through a guarded lazy require, so a render test needs
no expo-constants mock. The receipt corrects the E34 and E44 claims.

Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
```

From `WT`, one command per call:
1. `/usr/bin/git add apps/app/src/wallet/outside/appGroup.ts apps/app/src/wallet/outside/appGroup.test.ts apps/app/src/wallet/outside/deviceAppGroup.ts apps/app/src/wallet/outside/deviceAppGroup.test.ts apps/app/src/wallet/outside/accountFile.ts apps/app/src/wallet/outside/accountFile.test.ts apps/app/src/wallet/outside/appOutside.ts docs/implementation/premium-progress.md`
2. `/usr/bin/git status --short`: exactly those 8 paths, each `M ` (staged), nothing else.
3. `/usr/bin/git commit -F /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p6a-t1-round2/files/commit-msg.txt`
4. `/usr/bin/git diff --check origin/claude/p1a-vault-core...HEAD`: no output.
5. `/usr/bin/git log --oneline -2`: your new commit, then `489a525`.
6. `/usr/bin/git status --short`: prints nothing.

Do not push. Do not amend `489a525`.

## 8. Step 7: the render probe, in a scratch copy of your commit

This proves minor 3 under the render harness without touching `WT`. The probe files never enter `WT`; `run-probe.sh` refuses a worktree path.

1. `mkdir -p /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p6a-t1-round2-impl/probe-head`
2. `/usr/bin/git archive HEAD | tar -x -C /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p6a-t1-round2-impl/probe-head`
3. `ln -s /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p6a-t1/node_modules /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p6a-t1-round2-impl/probe-head/node_modules`
4. `sh /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p6a-t1-round2/files/probe/run-probe.sh /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p6a-t1-round2-impl/probe-head /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p6a-t1-round2-impl/probe-head.log`. It runs the render harness's own config (`vitest.render.config.ts`, setup file included) with its include narrowed to two probe files, and no expo-constants mock anywhere. Expected (durations omitted):

```text
 ✓ src/probe-r2/minimalCryptoMock.render.test.tsx > appOutside loads with only randomUUID mocked, and the temporary ids and no app group apply
 ✓ src/probe-r2/fullCryptoMock.render.test.tsx > every export of appOutside works with no expo-constants mock
 Test Files  2 passed (2)
      Tests  2 passed (2)
```

5. `node /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p6a-t1-round2/files/probe/probe-mutants.mjs /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p6a-t1-round2-impl/probe-head /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p6a-t1-round2-impl`. Expected (the module path in L1 is cut short):

```text
L1 the lazy require without its guard: killed (Tests  2 failed (2)) Cannot find module '...
L2 expo-constants imported at the top again: killed (Tests  no tests) ReferenceError: __DEV__ is not defined
probe mutants: 2, survivors: 0
```

6. In `WT`: `/usr/bin/git status --short` prints nothing.

The brief writer ran the same probe on `489a525`: both files fail to load there (`ReferenceError: __DEV__ is not defined`), which is the trap this round removes.

## 9. If anything differs

Any count, test name, mutant line, `git diff --stat` line or checksum that differs from this brief: stop, do not commit (or, after the commit, do not change it), and report `STATUS: BLOCKED` with the command and its output. Do not adjust the receipt's numbers to match.

## 10. Your final message

As the protocol says, with these specifics:
- `STATUS: DONE` or `STATUS: BLOCKED` on the first line.
- The new commit's SHA and the branch; the 8 files.
- RED (3 failed, 20 passed; the E34 RED, 1 failed), GREEN (23 passed), mutants (R1 to R10 killed, M1 to M17 killed, L1 and L2 killed).
- Each gate command with its counts; what was not run and why (Step 4).
- `shasum -c` results for `SHA256SUMS` (8 OK).
- Deviations: none beyond the receipt's 9 to 11. Ask the reviewer to look first at the device `copyIn` folder guard, the fake's folder behaviour, `writeAccountFile`'s guard and `appOutside.ts`'s lazy load.
