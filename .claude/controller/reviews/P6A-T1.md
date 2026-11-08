# Review: P6A-T1 "Outside ids, the app group store and the account file"

> Restored on 8 November 2026 after macOS cleared `/private/tmp`, which held the original of this report and its probe files. Minors 1 to 4 and nit 1 are fixed by the round 2 brief, `.claude/controller/briefs/P6A-T1-round2.md`, whose scratch copy and probes (`.claude/controller/scratch/p6a-t1-round2/`) re-prove minors 1 to 3.

- Reviewer: Opus, read-only. Commit `489a525` on `p6a/t1-outside-ids` (worktree `.claude/worktrees/p6a-t1`), range `origin/claude/p1a-vault-core...489a525`, base `bdf6b12`.
- Spec: plan `docs/superpowers/plans/2026-10-25-jotbun-p6a-outside-the-app.md` `### Task P6A-T1` (line 83), Global Constraints, X5; boundaries A36, Q6/D33 (temporary ids).

## Verdict

VERDICT: Approved. No blocker, no major; four minors and nits. The orchestrator then ruled that minors 1 to 4 and nit 1 are fixed in this task before merge (round 2).

## Findings

### Minor 1. E34 is not equivalent: the `exists` guard in `remove` keeps `remove('outside/shares')` from deleting every waiting slip, and no test pinned it

`deviceAppGroup.ts:68` `if (file.exists) file.delete();`. `isSafeName` makes the extension optional, so `OUTSIDE_FILES.shareFolder` is a valid file name. In expo-file-system 58.0.9 a `File` whose path is a folder does not exist (iOS `ios/FileSystemFile.swift:35-43`, Android `FileSystemFile.kt:37-43` `isFile()`), yet `delete()` removes the folder recursively (iOS `FileSystemPath.swift:38-48` `FileManager.removeItem`; Android `FileSystemPath.kt:88-101` `deleteRecursively()`). A fake following that code showed: as committed, `remove('outside/shares')` keeps both slips; with E34, none survive. Round 1's fake modelled `delete` as file-only, and the receipt called E34 equivalent.

### Minor 2. On iOS, `copyIn(uri, <a folder name>)` with `overwrite: true` deletes that folder first

iOS `FileSystemPath.copy` (`ios/FileSystemPath.swift:69-79`) does no destination type check and, with `overwrite` and something at the path, calls `removeItem(at:)` (recursive) before copying. Probe: `copyIn(src, 'outside/shares')` answered `true` and left no slips. Android refuses (`to.validateType()`, `FileSystemPath.kt:226-235`). Caller-bug only; read from the native source, not run on a device. Deviation 4 (overwrite an existing copy) itself is right.

### Minor 3. The top-level `expo-constants` import is a trap for P6A-T3a and T3b

`appOutside.ts:6`. Under the render harness, importing `appOutside` with only the usual expo-crypto mock fails with `ReferenceError: __DEV__ is not defined` (`expo-modules-core/build/Platform.ts:17` via `expo-constants/build/Constants.ts:11`); with `vi.mock('expo-constants', ...)` added it loads and works. No render test mocks expo-constants, so T3b's edits to `DeviceDiaryProvider.tsx` and `PrivacyScreen.tsx` would break files it does not name (`bunSettingsErase`, the four catalogue tests, `SettingsScreen`), and T3a's Home and catalogue edits likewise. A guarded lazy typed `require` inside `appOutsideIds()` falling back to `TEMPORARY_IDS` avoids it (proven under Vitest).

### Minor 4. Receipt equivalence claims

E34 is wrong (minor 1). E44 (drop `idempotent`) ignores another process (the share extension, T10) creating the folder between `exists` and `create`; keeping `idempotent: true` is right. E28, E36, E49, E51, E53 and E60 are equivalent (checked).

### Nit 1. `writeAccountFile` writes values `parseAccountFile` refuses

It builds the four fields by name (no extra key leaks), but wrote `marker: <account id>`, `locale: 'vi'` or `hidden: 'no'` unchecked, each reading back as `null`.

### Nit 2. `isSafeName` cannot tell a file from a folder and has no length cap (the plan's regex; root of minors 1 and 2).

### Nit 3. Silent write and remove failures follow the plan's rule; T3b's erase after deletion and T6a's queue index must read back where it matters.

## Focus items (all confirmed)

- The name check runs before any file call in all 18 store methods. About 40 hostile names (traversal, separators, encodings, NUL, newline, case, Cyrillic, fullwidth, dotless i, empty) are refused, every accepted name joins inside `<root>/outside/` under expo-file-system's own `Paths.join`, and there is no ReDoS.
- `writeAccountFile` builds `{ v: 1, marker, locale, hidden }` by name.
- The lazy `require('expo-file-system')`: the web gets `noAppGroup` without loading it; typed as `app/dev/catalogue.tsx:26` does.
- expo-crypto 58.0.6 gives lower-case hex on iOS, Android and the web.
- Deviations 1 to 3 and 5 to 8 accepted; deviation 4 accepted with minor 2.
- Nothing in the commit can reach `RemindersScreen.render.test.tsx` (no importer outside `src/wallet/outside/`, no render test, render config and setup unchanged).
- No manifest, lockfile, `app.json`, `featureFlags.ts` or catalog changed; `git diff --check` clean; commit line and trailer as the plan and protocol give them; merge onto `75b3625` was clean (onto `8f04a3b` only the ledger conflicts, append against append).
- Disclosure: one early probe config merged `include` with the render config and started part of the render suite in a scratch copy until `timeout` killed it; the worktree was untouched.
