# Confirming review: P6A-T1 round 2 "Outside ids, the app group store and the account file"

- Reviewer: Opus, read-only, fresh to the code. Branch `p6a/t1-outside-ids` (worktree `.claude/worktrees/p6a-t1`), task commit `489a525`, fix round `2304d8b`. Range `origin/claude/p1a-vault-core...2304d8b` after `git fetch` (integration head `8f04a3b`), merge base `bdf6b12`.
- Spec: plan `docs/superpowers/plans/2026-10-25-jotbun-p6a-outside-the-app.md` `### Task P6A-T1` (line 83) and its Global Constraints; the first review `reviews/P6A-T1.md`; the round brief `briefs/P6A-T1-round2.md`; the implementer's logs `scratch/p6a-t1-impl2/`.
- Probes: `.claude/controller/scratch/p6a-t1-confirm/` (`head/` = `2304d8b`, `base/` = `489a525`, `red/` = `489a525` code with the round 2 tests, `mut/` = mutant copy, each with `node_modules` symlinked from the worktree; scripts in `probe-src/`; logs beside them). The worktree was not edited: `git status` is clean and HEAD is still `2304d8b`. Git run in the worktree: `fetch`, `diff`, `log`, `grep`, `archive`, and `merge-tree --write-tree` (writes objects only, no ref or file).

## Verdict

VERDICT: Approved. No blocker or major. All five fixes are in and proven. One minor (the fake's `copy` checks things in a different order from the native code, which hides a data-loss case that predates this round) and some nits, none blocking.

## Findings

### Minor 1. The fake's `copy` reads the source before it touches the destination, but both native copies remove an existing destination first. So a failed `copyIn` over an existing copy loses that copy on a phone, and the fake hides this.

- Native: iOS `ios/FileSystemPath.swift:74-78`: with `overwrite`, it runs `removeItem(at: destinationUrl)` and only then `copyItem`, so a source that is missing or unreadable fails after the old file is gone. Android `FileSystemPath.kt:226-235` then `CopyMoveStrategy.kt:33-35` (`spec.resolve(file).receiveFrom(file)`) and `:94-99`: `prepareAsDestination` runs `deleteRecursively()` on an existing target before `receiveFrom` reads the source.
- Fake: `deviceAppGroup.test.ts:78-87` throws `no such file` for a missing source before it looks at the destination.
- Probe (`probe-src/copy-order.mjs`, run on `mut/`): with the fake's `copy` reordered as the native code runs, all 10 committed device tests still pass. A probe test, `copyIn('.../gone.jpg', 'outside/shares/a.jpg')` over an existing `a.jpg`, answers `false` and leaves `a.jpg` absent. The same probe test passes on the committed fake (11 of 11), so the tests cannot see the loss.
- Scope: this behaviour comes from round 1's deviation 4 (`overwrite: true`), not from this round. The folder guard is not affected, because it returns before `copy` runs. But the fake's comment says it "fails like the real one" for copy, and the header line "a copy false, and a write or a remove resolves, keeping the last good file" can be read as covering copy.
- Suggested fix: carry it to P6A-T6a or T11 rather than open another round. Add one receipt or port note: "a failed copyIn over a name that already holds a file may lose that file; use a fresh name per hand-off". Optionally, check `new fs.File(fromUri).exists` before copying, which narrows the window but does not close it.
- Related, harmless: the fake applies iOS's copy-over-a-folder behaviour on both platforms. Android refuses that copy outright (`to.validateType()`, `FileSystemPath.kt:228`; `FileSystemFile.kt:30-35`). The fake is therefore stricter than Android, which is fine because the guard does not depend on the platform. The fake's comment correctly attributes the behaviour to iOS.

### Nit 1. The check-then-copy window is acceptable but not documented, and the comments say "never"

`deviceAppGroup.ts:96-98`: a folder that another process (P6A-T10's share extension) creates at the same name between `Directory.exists` and the native `copy` would still be removed recursively on iOS. Android has the same window natively, between `to.validateType()` and `deleteRecursively()`. `remove` has the mirror case: a file replaced by a folder between `File.exists` and `delete()`.

All of these need a caller bug first (a folder's name passed as a file name, which the receipt's notes forbid), then a concurrent folder creation at exactly that name within a few milliseconds. That is acceptable.

None of it is documented, though. `appGroup.ts:5-6` ("no store deletes or replaces a folder through a file call"), `deviceAppGroup.ts:8` ("A folder is never touched") and receipt note 5 are absolute. E44's correction already names this same cross-process race for `create`, so one matching sentence would do.

### Nit 2. Survivor A4: `writeAccountFile` without its `await` is not killed

`accountFile.ts:49`. Probe `mutants-confirm.log` A4 (`void group.writeText(...)`): 4 passed. Every store's `writeText` resolves, so the only difference is ordering: the caller could resume before the device write finishes. A test with a store whose write resolves on a later tick would kill it. Round 1's `return group.writeText(...)` had the same semantics, so this is not a regression.

### Nit 3. The memory store matches the device contract only for `copyIn`

`memoryAppGroup().writeText('outside/shares', 'x')` stores the text, and `readText` and `uriOf` then answer it. The device store's write onto a folder fails, so it answers `null`. Round 2's device test (`deviceAppGroup.test.ts:251-253`) pins the device side. The memory comment claims parity only for `copyIn`, so nothing it says is wrong. This predates the round.

### Nit 4. The fallback is silent on a phone

`appOutside.ts:24-32` catches everything. If expo-constants ever failed to load on a device, `appOutsideIds()` would quietly become `TEMPORARY_IDS`. On iOS that means looking up the wrong app group and getting `noAppGroup`, so widgets would see nothing and no error would appear. Round 1's top-level import failed loudly. The shape is right today (see the focus items below), so this is a note for P6A-T7: once D33's ids exist, its device check should confirm `appOutsideIds()` is not `TEMPORARY_IDS`.

### Nit 5. Receipt details

- The `Files` bullet still gives round 1's test counts (`appGroup.test.ts (3)`, `deviceAppGroup.test.ts (8)`, `accountFile.test.ts (3)`); they are now 4, 10 and 4. The Round 2 block lists the four new tests, so nothing is lost.
- `Status` still says the integration head "is `75b3625` now" (it is `8f04a3b`).
- E44's "no single-process test can tell the two apart" overstates it. A fake whose `Directory.exists` answers `false` while the folder is present (simulating the other process) would kill E44. Keeping `idempotent: true` is still right.

## Focus items

All checks were confirmed by my own probes.

### Fake against expo-file-system 58.0.9

I read the installed `build/Directory.d.ts`, `build/internal/NativeFileSystem.types.d.ts`, `ios/FileSystemFile.swift`, `FileSystemDirectory.swift`, `FileSystemPath.swift` and `FileSystemModule.swift`, and the Android `FileSystemFile.kt`, `FileSystemDirectory.kt`, `FileSystemPath.kt`, `FileSystemModule.kt` and `fsops/CopyMoveStrategy.kt`.

| Operation | Native (iOS / Android) | Fake |
| --- | --- | --- |
| `File.exists` | false for a folder: iOS `FileSystemFile.swift:35-44` (`!isDirectory`), Android `FileSystemFile.kt:37` (`isFile()`) | matches (`files.has`) |
| `Directory.exists` | true only for a folder: iOS `FileSystemDirectory.swift:52-61`, Android `FileSystemDirectory.kt:18` (`isDirectory()`) | matches (`folders.has`) |
| `File.delete` | missing: throws. Folder: recursive. iOS `FileSystemPath.swift:38-48` (`removeItem`), Android `FileSystemPath.kt:88-102` (`deleteRecursively`); the module binding calls it with no type check (iOS `FileSystemModule.swift:414`, Android `FileSystemModule.kt:177`) | matches |
| `File.write` onto a folder | fails: iOS non-atomic `String.write` to a folder; Android `validateType()` | matches |
| `copy` with `overwrite` | iOS removes whatever is at the destination, folder included (`FileSystemPath.swift:74-76`); Android refuses a folder destination | iOS behaviour on both platforms (stricter); the source-first ordering is minor 1 |

- The guard works on a phone. `new fs.Directory(root, name)` points at the same path as `fileAt(name)`, with a trailing slash, and `exists` uses `url.path`. The app group directories get read and write permission (`expo-modules-core/ios/FileSystemUtilities/FileSystemUtilities.swift:86-95`, `appGroupSharedDirectories`), so `exists` is not falsely `false` there. The guard returns before `makeFolderOf` and before `copy`, so iOS's `removeItem` is never reached for a folder, apart from the race in nit 1.
- RED, the round 2 tests over `489a525` (`red-tests.log`): 23 tests, 20 passed, 3 failed, each an `AssertionError`: the two copy tests and the account-file test. The remove test passes on `489a525`. With E34 applied there it fails (1 failed, `Expected values to be strictly deep-equal`), and it passes again once restored. GREEN at `2304d8b` (`head-tests.log`): 23 passed. Full `test:unit` at `2304d8b` (`head-unit-full.log`): 757 passed, 0 failed. `tsc --noEmit` for the app: exit 0.
- My mutants (`mutants-confirm.log`, all restored and checked with `cmp`):
  - Killed: D1 (E34), D2 (no guard), D3 (`File` in place of `Directory`), D4 (the guard answers `true`), D5 (the guard checks the parent), D6 (the guard after the copy), D8 (`remove` also deletes a `Directory`); memory M1 (`key === name`) and M2 (answers `true`); account A1 (the guard parses the input object, killed by the extra-key test), A2 (inverted) and A3 (locale only).
  - Equivalent: D7 (the guard after `makeFolderOf`, which only creates the parent).
  - Survivor: A4 (nit 2).
  - The implementer's R1 to R10 and M1 to M17 lines match `scratch/p6a-t1-impl2/mutants-r*.log` and the brief's expected output. `sums-before.txt` and `sums-after.txt` are equal.

### Names

- 40 hostile names are refused (`names.log`): a trailing `\n`, NUL, `\r` or space; `.` and `..` segments; `//`; backslash; percent-encoded traversal; upper case; Cyrillic, fullwidth and dotless-i lookalikes; a zero-width space; U+2028; `.jpeg`, `.gif` and a double extension; schemes; leading `/` or `./`; `outside`; `outside/`; the empty name.
- Fuzz: about 21,700 random names were accepted, and every one has the shape `outside/<seg>(/<seg>)*[.json|.jpg|.png|.webp]` and joins to `<root>/<name>` under `<root>/outside/`.
- `outside` itself cannot be named. Every folder below it (`outside/shares` and the others) is protected: `remove` uses `File.exists`, which is false for a folder; `copyIn` uses the `Directory.exists` guard; `writeText` fails natively and the failure is swallowed.

### The lazy require

- It is typed: `typeof import('expo-constants')`. Dropping `.default` fails `tsc` with TS2339.
- It is guarded: a try around the require and the property access.
- It falls back correctly: under the render harness the require fails with Node's `ERR_MODULE_NOT_FOUND` (expo-modules-core's extensionless `./ts-declarations/global`), which is caught, giving `TEMPORARY_IDS`. A missing module or a `__DEV__` `ReferenceError` is caught the same way.
- Metro keeps it on every platform (`babel-deps.log`). `babel-preset-expo` 58.0.16 plus Metro 0.87.1's `collectDependencies` list `expo-constants` and `expo-file-system` as optional dependencies on web and iOS, in dev and production. A dependency that resolves is bundled, and `expo-constants` is in `apps/app/package.json`.
- `require('expo-constants').default` is the Constants object: after the transform, expo-constants' `build/Constants.js` sets `exports.default` and `__esModule` on web, iOS and Android.
- Render-config probe (`probe-src/`, the harness's own `vitest.render.config.ts` and setup with `include` narrowed and `cacheDir` outside `node_modules`; only `randomUUID` is mocked for expo-crypto; no expo-constants mock):
  - At `2304d8b` (`probe-head.log`): 3 passed. `appOutsideIds()` is `TEMPORARY_IDS` and memoized, `getAppGroup()` is `noAppGroup`, and the account file round-trips through `setAppGroup(memoryAppGroup())`.
  - Deviation 11 confirmed: a `vi.mock('expo-constants')` no longer reaches the require (scheme `gogospend`). On `489a525` the same mock is seen (`mocked`), and the minimal probe fails to load with `ReferenceError: __DEV__ is not defined` (`probe-base.log`).
  - Mutants: L1 (unguarded require), L2 (top-level import back) and L4 (a wrong fallback) are killed. L3 (dropping `.default`) is killed by `tsc`.
- Nothing imports `src/wallet/outside/` outside that folder, at `2304d8b` or at `8f04a3b`.

### `writeAccountFile`

- `accountFile.ts:47-49` builds `text` once, parses that same string with `parseAccountFile`, and writes that same string. The guard therefore accepts exactly what `readAccountFile` will accept from the file, by construction: nothing the reader accepts is refused, and nothing it refuses is written.
- It throws before any write, and the test checks `files.size === 0`.
- The `TypeError` message is fixed (`Not an account file.`) and carries no value.
- The plan's signature is unchanged. Throwing for a programmer error fits the plan's existing `TypeError` for unsafe names. The global constraint about swallowing failures concerns native failures, and the receipt tells P6A-T3a to catch.

### Receipt

- In house style (bold labels, a fix-round block like 1D's "Review fix round"), with no em or en dashes.
- E34 is corrected accurately (iOS `FileSystemPath.delete`, Android `deleteRecursively`). E44 is corrected, with the wording quibble in nit 5. "Six equivalent" adds up: E28, E36, E49, E51, E53 and E60.
- Deviation 9 names both the device and memory `copyIn`; 10 and 11 are accurate.
- "Android's `copy` refuses a folder" is right.
- The gate counts match the logs (`test:unit` 757; typecheck and routes exit 0).

### Hygiene

- The range touches only `apps/app/src/wallet/outside/*` and `docs/implementation/premium-progress.md`. No manifest, lockfile, `app.json`, `featureFlags.ts` or catalog changed.
- `git diff --check origin/claude/p1a-vault-core...2304d8b` is clean.
- All 8 files match the brief's `SHA256SUMS`.
- Commit message: identical to the brief's `commit-msg.txt`. The summary is 66 characters, imperative, with no type prefix, and the trailer is `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`.
- `git merge-tree --write-tree origin/claude/p1a-vault-core 2304d8b`: the only conflict is `docs/implementation/premium-progress.md`, an append against an append. The integration side adds P2 Task 1, P4 Task 1 and P6B Task 0 at the end, and this side adds `## P6A: Outside the app`. Keep both.
