# Brief P4-T13: Photos, shrinking and batches on the phone

You are the implementer for plan P4, Task P4-T13. You add the phone's three slip ports and their fakes, all new files in `apps/app/src/slips/`:

- `photoLibrary.ts`: the photo library port and its picker path, `pickerPhotoLibrary()`. Under owner Q1's default the app reads no album: the person picks slips by hand through the installed `expo-image-picker`.
- `imageShrink.ts`: the shrink port and `pickerShrink()`. Under owner Q2's default a photo is sent as it is, within 1,200,000 bytes, or not at all.
- `slipBatches.ts`: slip batches for `POST /v1/slips`, at most 5 slips and 8 MiB of JSON each, in order.
- `testing/fakePhotos.ts`: fakes of both ports, for the scan engine (P4-T14) and the slip screens (P4-T18 on).
- Their three Node test files.

No existing file changes. The planner wrote every file below and proved it in a scratch copy of the integration head `0bd5659`: RED on typed stubs (18 of 18 cases fail, each on an assertion), GREEN (18 of 18), 84 mutants killed (none survive) and R100's fast local gate. Do exactly what this brief says.

Read first, in this order:

1. The protocol, which is binding: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/protocol.md`. Two notes at its top apply:
   - **R100:** CI is the gate for whole suites. Run only the fast local gate (Step 5). Never run the full render suite or the iOS export, and never compare whole-suite totals.
   - **R87:** your receipt is its own file, `docs/implementation/receipts/P4-T13.md`; do not edit `premium-progress.md`.
2. The plan task: `docs/superpowers/plans/2026-10-25-jotbun-p4-slips-statements.md`, `### Task P4-T13` (lines 713 to 750). Also read:
   - S5 (line 28), S14 (line 37), S17 (line 40) and S19 (line 42);
   - the owner questions Q1, Q2 and Q12 (lines 47, 48 and 55), whose defaults this task follows;
   - the Global Constraints (lines 63 to 75), especially "Packages" (line 65), "Process" (line 66) and "Privacy anti-goals" (line 70);
   - for context only: P4-T14's `run` paragraph (line 812), which says how the engine uses these ports, and P4-T6's handler (line 445), which says what the server refuses in a batch.
3. P4-T1's receipt (the contracts this task reads): `docs/implementation/premium-progress.md`, `### P4 Task 1`.

## Paths and rules used below

- **WT** = `/Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p4-t13` (branch `p4/t13-photos`, made by the orchestrator from `origin/claude/p1a-vault-core`). Work only here.
- **S** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p4-t13`, your scratch folder. Create it with `mkdir -p`. Logs and the commit message go there. Never keep anything under `/private/tmp`.
- **PL** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p4-t13-planner`, the planner's folder. Read it and `cp` from it; never write into it. It holds:
  - `real/apps/app/src/slips/...`: the final version of the 7 files this task creates (list in `files-real.txt`);
  - `stubs/apps/app/src/slips/...`: the 4 code files in their RED form (typed stubs; list in `files-stubs.txt`);
  - `base/packages/contracts/src/v1/...`: the two contract files the kit was proved against, as they are at the head (list in `files-base.txt`). There is no `orig/` and no `diffs/`: this task edits no existing file;
  - `tools/mutants.py` (the mutant runner), `tools/prove.sh` (the planner's RED and GREEN stages), `tools/fast-gate.sh` (the planner's gate), and `tools/fill_brief.py` with `tools/brief.template.md` (how this brief was built: every code block in the appendix is the kit's file, byte for byte);
  - `logs/`: `summary.txt` (RED and GREEN, timed), `red/`, `green/`, `gate/`, `mutants.out` (the planner's run: 84 `KILLED`, exit 0), `mutants-check.out`, `mutant-logs/`, `rehearsal.txt` (this brief's commands, run as written), and `superseded/iter-1/` (a first RED and GREEN, before the album case gained its leading spaces; the same counts);
  - checksums with paths relative to WT, for `shasum -a 256 -c` run from WT:
    - `SHA256SUMS.base` (the 2 contract files);
    - `SHA256SUMS.red` (the RED state: the 3 final tests and the 4 stubs);
    - `SHA256SUMS.real` (the final 7);
    - and `SHA256SUMS`, the folder's own (paths under PL; `SHA256SUMS.logs` lists the planner's `*.log` files, which are not part of it).
- Every shell call starts in a fresh directory, so type full paths.
  - Git: `/usr/bin/git -C WT <command>`, one git command per call.
  - npm: `cd WT && npm run <script>`.
  - The task's tests (Node): `cd WT/apps/app && node scripts/test-unit.mjs <files>`.

  Below, WT, S and PL stand for those full paths: type the full path.
- No database or workers suite runs in this task, so there is no lock to take. Docker stays stopped.
- **If a result differs from an "Expected" line, stop and report BLOCKED with the output.** Do not change tests or code to make them pass.
  - The one exception is a case that times out under load in a file this task does not touch (a known flake, protocol). Rerun that file alone once; if it passes alone, record both runs and go on.

## Scope

| File | Change |
| --- | --- |
| `apps/app/src/slips/photoLibrary.ts` | **new.** `PhotoAccess`, `AlbumInfo`, `PhotoAsset`, `PhotoLibraryPort`, `PickerPhotoLibraryOptions`, `pickerPhotoLibrary()` (P2 to P8). |
| `apps/app/src/slips/imageShrink.ts` | **new.** `ShrunkImage`, `ImageShrinkPort`, `pickerShrink()` (P9). |
| `apps/app/src/slips/slipBatches.ts` | **new**, pure. `ReadySlip`, `slipBatchRequest()`, `slipBatchBytes()`, `buildSlipBatches()` (P10, P11). |
| `apps/app/src/slips/testing/fakePhotos.ts` | **new.** `fakePhotoLibrary()`, `fakeShrunkImage()`, `fakeImageShrink()` and their types (P12). |
| `apps/app/src/slips/photoLibrary.test.ts` | **new**, Node. 7 cases. |
| `apps/app/src/slips/imageShrink.test.ts` | **new**, Node. 6 cases. |
| `apps/app/src/slips/slipBatches.test.ts` | **new**, Node. 5 cases. |
| `docs/implementation/receipts/P4-T13.md` (repo root) | **new.** Your receipt (R87). |

Not in this task:
- Q1's `mediaLibraryPhotoLibrary()` and Q2's `manipulatorShrink()`: they wait on the owner's yes (the plan). So no package, no lockfile change, and no `app.json`, `locales/` or Android permission change (Q1's plugin, Q12).
- The scan engine and everything that calls these ports (P4-T14 on).
- P4-T12's files, planned in parallel: `slipResources.ts`, `slipRefs.ts`, `slipRoutes.ts`, `testing/fakeSlipResources.ts`, `src/api/sharedV1.ts`, `DeviceDiaryProvider.tsx` and the ten `app/spend/slips/` routes.
- 1D-T8's files, in flight: `featureFlags.ts`, `registry.tsx`, the analytics consent screen and the Privacy, SpendLayout and Catalogue tests.
- `en.json`, `th.json` and any screen (this task has no copy), anything under `apps/edge`, `apps/api` or `packages/`, and `premium-progress.md`.

## Interfaces (as `PL/real` has them)

```ts
// apps/app/src/slips/photoLibrary.ts
export type PhotoAccess = 'all' | 'limited' | 'none' | 'undetermined';
export type AlbumInfo = { id: string; title: string; count: number };
export type PhotoAsset = { id: string; uri: string; createdMs: number; albumId: string | null; bytes?: number };   // a picked photo: id assetId ?? uri, albumId null; bytes a hint only (P4)
export type PhotoLibraryPort = {
  readonly albumsSupported: boolean;
  access(): Promise<PhotoAccess>;
  request(): Promise<PhotoAccess>;
  albums(): Promise<AlbumInfo[]>;
  assetsSince(albumId: string, after: { ms: number; id: string | null }, limit: number): Promise<PhotoAsset[]>;   // oldest first, strictly after (ms, id)
  asset(id: string): Promise<PhotoAsset | null>;   // an album photo again by its id; null once it is gone
  pick(limit: number): Promise<PhotoAsset[]>;
  release(asset: PhotoAsset): Promise<void>;   // deletes a picked photo's copy, best effort; nothing for an album photo
  openSettings(): Promise<void>;   // best effort
};
export type PickerPhotoLibraryOptions = {
  loadModule?: () => Promise<typeof import('expo-image-picker')>;
  loadFileSystem?: () => Promise<typeof import('expo-file-system')>;   // beyond the plan (P8)
  loadLinking?: () => Promise<typeof import('expo-linking')>;   // beyond the plan (P8)
};
export function pickerPhotoLibrary(options?: PickerPhotoLibraryOptions): PhotoLibraryPort;   // Q1's default: no albums, asset() always null

// apps/app/src/slips/imageShrink.ts
export type ShrunkImage = { uri: string | null; base64: string; bytes: number; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' };
export type ImageShrinkPort = { shrink(asset: PhotoAsset): Promise<ShrunkImage | null>; remove(image: ShrunkImage): Promise<void> };   // shrink: null when it cannot be sent; throws when the photo is gone
export function pickerShrink(options?: { loadModule?: () => Promise<typeof import('expo-file-system')> }): ImageShrinkPort;   // Q2's default; its image's uri is null, so remove() deletes nothing

// apps/app/src/slips/slipBatches.ts
export type ReadySlip = { assetId: string; refHash: string; image: ShrunkImage; album: string | null; origin: SlipOrigin };
export function slipBatchRequest(slips: readonly ReadySlip[], header: Omit<SlipBatchRequest, 'slips'>): SlipBatchRequest;   // beyond the plan (P11): the body the count measures
export function slipBatchBytes(slips: readonly ReadySlip[], header: Omit<SlipBatchRequest, 'slips'>): number;   // the JSON body's UTF-8 length
export function buildSlipBatches(slips: readonly ReadySlip[], header: Omit<SlipBatchRequest, 'slips'>): ReadySlip[][];   // at most 5 slips and 8 MiB each, in order; RangeError for a slip larger than a batch

// apps/app/src/slips/testing/fakePhotos.ts
export type FakeAlbum = { id: string; title: string; assets?: readonly Omit<PhotoAsset, 'albumId'>[] };
export type FakeLibraryCall = { method: Exclude<keyof PhotoLibraryPort, 'albumsSupported'>; args: unknown[] };
export type FakePhotoLibrary = PhotoLibraryPort & { released: PhotoAsset[]; calls: FakeLibraryCall[] };
export type FakeImageShrink = ImageShrinkPort & { removed: ShrunkImage[] };
export function fakePhotoLibrary(options?: { access?: PhotoAccess; albums?: readonly FakeAlbum[]; picked?: readonly PhotoAsset[]; albumsSupported?: boolean }): FakePhotoLibrary;
export function fakeShrunkImage(asset: PhotoAsset): ShrunkImage;   // a JPEG's first bytes, then the photo's uri
export function fakeImageShrink(options?: { tooLarge?: readonly string[]; gone?: readonly string[] }): FakeImageShrink;   // tooLarge by asset id, gone by uri
```

## The integration head

- The planner's proof base is `0bd5659`, the head when this brief was written. Its proof tree is a `git archive` of `606e131` with `npm ci` (1416 packages); between `606e131` and `0bd5659` only `.claude/` changed, and the planner compared all 1,468 tracked files outside `.claude/`: every one is byte for byte the head's.
- P4-T1 (#332, `d13eda3`) is merged: `packages/contracts/src/v1/slips.ts` has `SLIP_LIMITS`, `SlipBatchItem`, `SlipBatchRequest`, `SlipOrigin` and `parseSlipBatchRequest`. `PL/SHA256SUMS.base` checks its two files at the head.
- None of the 7 paths exists at the head, and no existing file changes, so no merge order matters.
- R100: no whole-suite totals are expected here. For the controller's CI check, this task's deltas are: `test:unit` +18 (photoLibrary 7, imageShrink 6, slipBatches 5), `test:app` +0, render +0 files and +0 cases, web and iOS +0 modules (no app file imports the new modules yet). The planner saw `test:unit` 940 with this task on `0bd5659`.

## Planner rulings (the calls this brief makes, with the reason for each)

- **P1. Ready.**
  - "Starts after: P4-T1": merged (#332, `d13eda3`).
  - No new package: `expo-image-picker` 58.0.10, `expo-file-system` 58.0.9 and `expo-linking` 58.0.13 are already `apps/app` dependencies (`~58.0.10`, `~58.0.9`, `~58.0.13`) and installed. Q1's `expo-media-library` and Q2's `expo-image-manipulator` stay out under their defaults, so no lockfile change.
  - No Cloudflare resource, account setting or owner decision: Q1, Q2 and Q12 apply by default (R26).
- **P2. Q1's default is the picker path only.** `pickerPhotoLibrary()` says `albumsSupported: false`; `albums()` and `assetsSince()` answer nothing and `asset()` always null (P4-T14 finds a picked copy by its uri). `pick`, `release`, `access`, `request` and `openSettings` work.
- **P3. The picker's options are exactly the plan's list:** `{ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: limit, quality: SLIP_LIMITS.jpegQuality, preferredAssetRepresentationMode: Compatible }`, and no `base64`.
  - `allowsEditing` and `exif` are not passed: the plan names five options, and both default to false.
  - The port does not cut the result to the limit, because both pickers keep it. iOS sets the picker's `selectionLimit` from the option (`ImagePickerModule.swift`). Android's `ImageLibraryContract.parseResult` takes the first `selectionLimit` photos before any copy is made, so no copy exists beyond the limit.
  - A cancelled pick gives `[]`. So does Android's "the picker is already open", which answers cancelled.
- **P4. A picked photo.**
  - `id` is `assetId ?? uri` (the plan).
  - `uri` is the picker's copy. Both platforms write it under the app cache's `ImagePicker/` folder (Android's `MediaHandler` through `createOutputFile(cacheDirectory, ...)`, iOS's `MediaHandler` under `cachesDirectory`).
  - `createdMs` is the time of the pick: the picker gives no taken time without `exif`, which the plan leaves off.
  - `albumId` is null, and `bytes` is the picker's `fileSize` when it gives one.
  - `bytes` is a hint only, and its doc comment says so. Android's picker reports the original photo's size (`OpenableColumns.SIZE`), not its copy's. The shrink port measures the file it reads.
- **P5. Photo access** comes from the picker's media-library permission:
  - `access()` reads it (`getMediaLibraryPermissionsAsync`); `request()` asks (`requestMediaLibraryPermissionsAsync`).
  - Granted and `limited` is `limited`; any other granted answer is `all` (the web gives no `accessPrivileges`); `undetermined` is `undetermined`; anything else is `none`.
  - Both platforms answer granted and `limited` for partial access: iOS's `.limited`, and Android 14's "selected photos", which the module turns into granted and `limited`.
  - Under Q1's default P4-T18 opens the picker without asking (the picker needs no library permission).
- **P6. `release()`** deletes a picked copy (`albumId` null) with `new File(uri).delete()`, best effort.
  - A copy already gone throws on both platforms; that, and any other failure, is ignored.
  - An album photo (`albumId` set) is never touched: it is the person's own (mutant L14).
- **P7. `openSettings()`** is `expo-linking`'s `openSettings()`, loaded lazily; a failure (the web's `UnavailabilityError`) is ignored.
  - The plan asks for `Linking.openSettings()` imported lazily, so Node loads the module.
  - A lazy `import('react-native')` is the fatal pattern `src/lib/haptics.ts` documents: Metro's `metroImportAll` enumerates React Native's lazy getters.
  - `expo-linking` is an installed direct dependency, and on a phone its `openSettings` calls React Native's `Linking.openSettings()`. That is all `src/lib/openAppSettings.ts` does for photos.
- **P8. The options are a superset of the plan's.** `pickerPhotoLibrary` takes `loadFileSystem` and `loadLinking` besides `loadModule` (the type `PickerPhotoLibraryOptions` is exported), so `release` and `openSettings` run in Node tests. The defaults are lazy imports, as `TellBunSheet.tsx`, `ReceiptParts.tsx` and `ImportDeviceParts.tsx` already load `expo-image-picker` and `expo-file-system`.
- **P9. Q2's default: `pickerShrink()` reads the photo as it is,** in this order:
  1. `new File(uri).size` over 1,200,000: null, and the file is never read.
  2. `base64()`: a copy that is gone throws. On both platforms `size` reads 0 for a missing file and `base64()` throws. So P4-T14 can tell a gone copy (it stays pending) from one that cannot be sent (null: unreadable).
  3. Not whole base64 (a length that is not a multiple of 4, or a character outside the contract's `BASE64` alphabet): null.
  4. The decoded length over 1,200,000: null. This also covers a phone that gave a size of 0.
  5. The type from the first 12 bytes: JPEG `FF D8 FF`, PNG's 8-byte signature, WebP `RIFF` with `WEBP` at offset 8. Anything else (HEIC, another RIFF file, text) is null.

  The result is `{ uri: null, base64, bytes, mediaType }`, and `remove()` does nothing: nothing was copied.

  Why so strict: the server refuses a whole batch for one bad image. `parseSlipImage` refuses text that is not base64 or is over 1,200,000 bytes, and P4-T6's handler refuses bytes that are not their type (`UPLOAD_TYPE_MISMATCH`), checking the same signatures. So one bad image would stop every slip in its batch on every run. The phone's PNG check (8 bytes) is stricter than the server's (4), so it never sends what the server refuses.
- **P10. Batches.**
  - `slipBatchBytes` is the UTF-8 length of `JSON.stringify` of the body. That is exactly what goes on the wire: the transport sends `JSON.stringify(body)` (`src/api/client.ts`), and P4-T12's planned `read()` sends that text's UTF-8 bytes.
  - `buildSlipBatches` keeps the order. It cuts before a slip that would make a sixth, or take the body past 8,388,608 bytes, commas counted.
  - Each batch is measured with `last: false`, the longer word, so it fits whichever `last` the engine sends it with.
  - A slip that cannot fit a batch alone throws `RangeError`. A shrink port never makes one: 1,200,000 bytes are 1,600,000 base64 characters.
- **P11. `slipBatchRequest`, an export beyond the plan's interface,** builds the one body both the count and the send use. P4-T14 should send `resources.read(slipBatchRequest(batch, { ...header, last }))`.
  - Each slip's album goes as the server keeps it: NFC, trimmed, cut to 60 code points, trimmed again (a cut can end on a space). An album with nothing left is null.
  - Why: the contract's `parseAlbum` refuses the whole batch for an album over 60 code points or blank. A long or blank album title (P4-T14 sends `slip_albums.title`) would make its batches fail forever.
  - The test writes the decomposed `é` and its NFC form as `\u` escapes (P4-T1's review note in `followups.md`).
- **P12. The fakes** (for P4-T14 and P4-T18 on):
  - `fakePhotoLibrary({ access, albums, picked, albumsSupported })` records `released` and `calls`. Its `asset(id)` finds a listed album photo only by its id, never by a uri or a pick, and every answer is a copy.
  - `fakeImageShrink({ tooLarge, gone })` records `removed`. `gone`, by uri, is beyond the plan: it throws as a removed copy does, for P4-T14's "a pending photo that is gone" and "a removed copy whose shrink throws".
  - `fakeShrunkImage(asset)` is a JPEG's first bytes, then the photo's uri, so a test can tell which copy was sent; it is valid base64 that the contract's parser takes.
- **P13. Cases beyond the plan's eight named ones** (all eight are there, word for word):
  - `photoLibrary.test.ts`: the settings case, and the fake's access, picks and calls. Inside named cases: a cancelled pick, a release of an album photo or of a copy already gone, and the fake's copies.
  - `imageShrink.test.ts`: only a JPEG, PNG or WebP; a gone copy throws; the limit on the bytes read; padding; the fake shrink.
  - `slipBatches.test.ts`: the exact 8 MiB cut (commas and `last: false`); a slip that fills a batch alone, and one larger; the album as the server keeps it. The byte-count case also runs the server's `parseSlipBatchRequest` on the phone's body.
- **P14. Node and Hermes.**
  - No module imports `react-native`; the three Expo modules load through the loaders.
  - `atob` and `TextEncoder` already ship in app code (`src/auth/*`, `src/spend/v1/privacy.ts`, `src/slips/slipQr.ts`). `btoa` is only in the testing fake.
  - `hermesGlobals.test.ts` checks for Web Crypto only and skips `testing/` paths.
- **P15. Clear of the work in flight.**
  - P4-T12 (in parallel) creates other files in `src/slips/` and `src/slips/testing/`; no file is shared.
  - 1D-T8 (running) and 1B-T8 (`apps/edge`) share nothing with this task.
- **P16. Gate (R100).**
  - Run: `typecheck:app`; the three files RED to GREEN; `test:app`; `test:unit`; `git diff --check`.
  - Not run: `typecheck:routes` and `export:web`, since no route, app config or app entry changes, and no app file imports the new modules. Not run either: the edge, API and database suites, and `test:ops`.
  - Leave to CI: the full render suite and the iOS export.
- **P17. Mutants.** The plan's four:
  - M1, pick with `base64`;
  - M2, six slips a batch;
  - M3 and M3b, the base64 length without the JSON, in the builder and in the count;
  - M4, ignore ties.

  Then 79 more over every guard and branch: L1 to L24 and L8b, S1 to S14, B1 to B17, F1 to F18, G1 to G5. The planner's run killed all 84, each by the case its line names.
- **P18. The owner-question adapters are not written.** `mediaLibraryPhotoLibrary()` (Q1) and `manipulatorShrink()` (Q2) "wait on the owner's yes" (the plan). The receipt lists them for the integrator.

---

## Step 0: Sync, install and check the base

1. `/usr/bin/git -C WT fetch origin claude/p1a-vault-core`, then `/usr/bin/git -C WT merge --no-edit origin/claude/p1a-vault-core`. Expected: "Already up to date." or a clean merge. Then `/usr/bin/git -C WT rev-parse --short HEAD`, and record it.
2. `/usr/bin/git -C WT cat-file -e HEAD:packages/contracts/src/v1/slips.ts; echo exit=$?`. Expected: `exit=0` (P4-T1 merged).
3. `ls WT/apps/app/src/slips/photoLibrary.ts WT/apps/app/src/slips/imageShrink.ts WT/apps/app/src/slips/slipBatches.ts WT/apps/app/src/slips/testing/fakePhotos.ts WT/apps/app/src/slips/photoLibrary.test.ts WT/apps/app/src/slips/imageShrink.test.ts WT/apps/app/src/slips/slipBatches.test.ts`. Expected: "No such file or directory" for all seven. If any exists, stop: BLOCKED, with `/usr/bin/git -C WT log --oneline -3 -- <that file>`.
4. `mkdir -p S`, then `cd WT && shasum -a 256 -c PL/SHA256SUMS.base > S/base-check.txt 2>&1; echo exit=$?`. Expected: `exit=0` and two `OK` lines.
   - If a line says `FAILED`, another task changed that contract file. Run `/usr/bin/git -C WT log --oneline -3 -- <that file>`, record both in the receipt under Deviations, and go on: the Expected lines of Steps 2 and 3 decide.
5. `cd WT && npm ci --ignore-scripts --no-audit --no-fund > S/npm-ci.log 2>&1; echo exit=$?`. Expected: `exit=0`. The worktree may come installed; running it again is safe. There is no edge install: this task is app-only.

## Step 1: The tests and the typed stubs (plan Step 1)

1. Copy every final file (7), then the 4 stubs over the code files:
   ```
   cp -R PL/real/apps WT/
   cp -R PL/stubs/apps WT/
   ```
   The stubs are typed with the final interfaces and wrong behaviour (R52):
   - the picker library says it supports albums, answers `undetermined`, picks nothing, and releases and opens nothing;
   - the shrink port never sends an image (always null);
   - the batch module builds no batch, counts 0 bytes and builds an empty body;
   - the fakes answer nothing (`undetermined`, no albums, no photos, null images) and record nothing.
2. `/usr/bin/git -C WT status --short --untracked-files=all`. Expected: exactly these seven lines, and nothing else:
   ```
   ?? apps/app/src/slips/imageShrink.test.ts
   ?? apps/app/src/slips/imageShrink.ts
   ?? apps/app/src/slips/photoLibrary.test.ts
   ?? apps/app/src/slips/photoLibrary.ts
   ?? apps/app/src/slips/slipBatches.test.ts
   ?? apps/app/src/slips/slipBatches.ts
   ?? apps/app/src/slips/testing/fakePhotos.ts
   ```
3. `cd WT && shasum -a 256 -c PL/SHA256SUMS.red`. Expected: 7 `OK` lines, exit 0.
4. `cd WT && npm run typecheck:app > S/red-typecheck.log 2>&1; echo exit=$?`. Expected: `exit=0`.

## Step 2: RED (plan Step 2)

1. Run the three files:
   ```
   cd WT/apps/app && node scripts/test-unit.mjs src/slips/photoLibrary.test.ts src/slips/imageShrink.test.ts src/slips/slipBatches.test.ts > S/red-unit.log 2>&1; echo exit=$?
   ```
   Expected: `exit=1`. Then `grep -E "^ℹ (tests|pass|fail) " S/red-unit.log` prints `ℹ tests 18`, `ℹ pass 0` and `ℹ fail 18`: every case fails (photoLibrary 7, imageShrink 6, slipBatches 5).
2. Every failure is an assertion:
   - `grep -c "code: 'ERR_ASSERTION'" S/red-unit.log` prints `18`;
   - `grep -c -e ERR_MODULE_NOT_FOUND -e "Cannot find module" S/red-unit.log` prints `0`;
   - `grep -c -e TypeError -e RangeError -e ReferenceError -e SyntaxError S/red-unit.log` prints `0`.

## Step 3: GREEN (plan Steps 3 and 4)

1. Copy the 4 final code files over their stubs: `while read -r f; do cp "PL/real/$f" "WT/$f"; done < PL/files-stubs.txt` (type the full paths). Then `cd WT && shasum -a 256 -c PL/SHA256SUMS.real`. Expected: 7 `OK` lines, exit 0.
2. `cd WT && npm run typecheck:app > S/green-typecheck.log 2>&1; echo exit=$?`. Expected: `exit=0`.
3. The same command as Step 2.1, into `S/green-unit.log`. Expected: `exit=0`, `ℹ tests 18`, `ℹ pass 18`, `ℹ fail 0`.

What the code does: read it in `PL/real` (the appendix holds the same bytes), and do not retype it. It follows rulings P2 to P12.

## Step 4: Mutation check (plan Step 5)

Run the planner's runner once. It applies each mutant alone to its file in WT, runs that file's tests, restores the file and checks its SHA-256:

```
MUTANT_LOGS=S/mutant-logs python3 -I PL/tools/mutants.py WT/apps/app > S/mutants.out 2> S/mutants.err; echo exit=$?
```

Type the full paths. To check first that every pattern matches once, run `python3 -I PL/tools/mutants.py WT/apps/app --check` (84 `APPLIES` lines, exit 0).

Expected: `exit=0`, and:
- `grep -c " KILLED: " S/mutants.out` prints `84`, and `grep -c "restored=True" S/mutants.out` prints `84`;
- `diff S/mutants.out PL/logs/mutants.out` prints nothing: each mutant fails the same cases as in the planner's run.

It takes about a minute. Then `/usr/bin/git -C WT status --short --untracked-files=all` shows the seven lines of Step 1.2, and `cd WT && shasum -a 256 -c PL/SHA256SUMS.real` still prints 7 `OK` lines.

| Mutant | Change | Killed by |
| --- | --- | --- |
| M1 (plan) | pick with `base64: true` | `the picker path picks up to the limit ...` |
| M2 (plan) | six slips a batch | `batches hold at most 5 slips and 8 MiB of JSON, in order` |
| M3, M3b (plan) | the base64 length without the JSON: in the builder; in the byte count | the 8 MiB cut and the slip-alone cases; also the byte-count case for M3b |
| M4 (plan) | the fake's order ignores ties | `the fake library lists photos oldest first ...` |
| L1 to L8b | albums on the picker path; full quality; no compatible representation; one photo at a time; no limit; videos; a copy found by id; an album or album photos listed | `the picker path picks up to the limit ...` |
| L9 to L13 | id always the uri; no id without an asset id; a cancel not checked (L11); an undated pick; a size set when none is given | `a picked image without an asset id is known by its uri` (L11: `the picker path picks up to the limit ...`) |
| L14 to L16 | release deletes an album photo; throws for a copy already gone; keeps the copy | `releasing a picked photo deletes its cache copy` |
| L17 to L22 | limited read as all; the web's granted read as limited; undetermined read as none; denied read as undetermined; request only reads; access asks | `photo access reads all, limited, none and undetermined ...` |
| L23, L24 | settings never open; their failure not caught | `the phone's settings open through expo-linking ...` |
| S1 to S4 | the size never checked or refused at the limit; the bytes read never checked or refused at the limit | the first case, and `the limit holds on the bytes read ...` |
| S5, S6 | any letters or any length taken as base64 | `only a JPEG, a PNG or a WebP is sent ...` |
| S7, S8 | padding ignored or swapped in the byte count | `an image's byte count is its decoded length, whatever its padding` |
| S9 to S12 | every image a JPEG; no PNG; any RIFF a WebP; the first bytes read short | `only a JPEG, a PNG or a WebP is sent ...` (S9, S10 and S12 also the first case) |
| S13, S14 | the image keeps the photo's uri; a gone copy read as too large | the first case; `a copy that is gone throws ...` |
| B1 to B6 | commas not counted (cut, sum); measured with the batch's own `last`; an exact 8 MiB batch cut; a slip larger than a batch let through, or one that fills a batch refused | the 8 MiB cut case; the slip-alone case |
| B7 | UTF-16 length | `the byte count is the JSON body's UTF-8 length` |
| B8 to B10 | the last batch dropped; slips or batches reversed | the batch cases |
| B11 to B17 | the album as given; not NFC; not trimmed before or after the cut; not cut; cut in UTF-16 units; blank sent as empty text | `each slip's album is sent as the server keeps it ...` |
| F1 to F18 | the fake library: ties, the watermark's own photo, photos at its time, newest first, the page limit, found by uri or as a pick, answers not copies, the pick limit, album ids, counts, access, the default `albumsSupported`, releases, calls, `request` | the two fake-library cases |
| G1 to G5 | the fake shrink: `tooLarge` or `gone` ignored, removals not recorded, one image for every photo, not a JPEG | `the fake shrink answers null for a photo too large ...` |

## Step 5: The fast local gate (R100)

Run from WT, in order, and record each result. Totals are not compared (R100): record the counts you see.

1. `cd WT && npm run typecheck:app`. Expected: exit 0 (Step 3.2).
2. The focused files: Step 3.3 (18 of 18).
3. `cd WT && npm run test:app > S/test-app.log 2>&1; echo exit=$?`. Expected: `exit=0` and `ℹ fail 0`. This task adds no `src/api` test; the planner saw 34.
4. `cd WT && npm run test:unit > S/test-unit.log 2>&1; echo exit=$?`. Expected: `exit=0` and `ℹ fail 0`. This task adds 18 cases; the planner saw 940 with this task on `0bd5659` (more if another app task merged first).
5. `git diff --check` comes in Step 7: new files are not in `git diff` until they are staged.

Not run here, recorded as "CI" (R100): the full `test:render` suite and the iOS export. Not run at all: `typecheck:routes` and `export:web` (no route, app config or app entry changes), the edge, API and database suites (nothing outside `apps/app` changes), and `test:ops` (no package or lockfile change).

## Step 6: Receipt

Create `WT/docs/implementation/receipts/P4-T13.md` with the Write tool, in the house style of `docs/implementation/receipts/P2-T10.md`. Replace every `<...>` with what you saw; if a number differs from the planner's, write yours and say why under Deviations.

```markdown
# P4-T13: Photos, shrinking and batches on the phone

- **Status:** built and verified locally on `p4/t13-photos` (`.claude/worktrees/p4-t13`), from `<head>`. Not pushed. The independent review is the controller's, after this receipt. Under R87 this receipt is its own file; `premium-progress.md` is not edited.
- **What it does:** the phone's photo, shrink and batch ports for slip import, under the owner's defaults Q1 (no `expo-media-library`: the person picks slips by hand) and Q2 (no `expo-image-manipulator`: a photo is sent as it is, or not at all).
  - `pickerPhotoLibrary()` picks up to a limit of photos through the installed `expo-image-picker`: images only, quality 0.7, the compatible representation, no base64. It reads no album (`albumsSupported` false, no albums, no lookup by id).
    - A picked photo is the picker's own copy in the app's cache, known by its asset id or else its uri, and dated when it was picked.
    - `release()` deletes that copy, never an album photo, best effort. `openSettings()` opens the app's settings through `expo-linking`, best effort.
    - Access comes from the picker's media-library permission.
  - `pickerShrink()` sends a photo's own bytes when they fit 1,200,000 bytes and are a JPEG, PNG or WebP by their first bytes; otherwise nothing (null).
    - A photo whose size is over the limit is never read, and a copy that is gone throws.
    - Its image has no uri, so `remove()` deletes nothing.
  - `buildSlipBatches()` cuts slips, in order, into batches of at most 5 slips and 8,388,608 bytes of JSON (commas counted, measured with `last: false`). `slipBatchBytes()` is the JSON body's UTF-8 length, and `slipBatchRequest()` builds that body, each album as the server keeps it.
  - `testing/fakePhotos.ts`: `fakePhotoLibrary`, `fakeImageShrink` and `fakeShrunkImage`, for P4-T14 and the slip screens.
- **Files:** created `apps/app/src/slips/photoLibrary.ts`, `imageShrink.ts`, `slipBatches.ts`, `testing/fakePhotos.ts`, `photoLibrary.test.ts` (7 cases), `imageShrink.test.ts` (6) and `slipBatches.test.ts` (5), and this receipt. No existing file changed.
- **RED to GREEN** (typed stubs first, R52: a picker library that claims albums and answers nothing, a shrink port that sends nothing, a batch module that builds nothing, fakes that answer nothing):
  - RED: `typecheck:app` `<result>`; the three files `<counts>`; `<n>` `ERR_ASSERTION`, no missing module, no other error.
  - GREEN: `typecheck:app` `<result>`; the three files `<counts>` (photoLibrary 7, imageShrink 6, slipBatches 5).
- **Mutation check:** the planner's runner (`.claude/controller/scratch/p4-t13-planner/tools/mutants.py`), 84 mutants. Each was applied alone, run against its file's tests and restored (SHA-256 checked): `<killed> killed, <survived> survived`. `S/mutants.out` `<is identical to / differs from>` the planner's `logs/mutants.out`.
  - The plan's four: M1 (pick with base64), M2 (six slips a batch), M3 and M3b (the base64 length without the JSON, in the builder and in the count), M4 (ignore ties).
- **Gate** (worktree root; R100's fast local gate):
  - `typecheck:app`: `<result>`.
  - Focused: `<counts>`.
  - `test:app`: `<counts>`. `test:unit`: `<counts>` (this task: +18).
  - `git diff --cached --check`: `<result>`. The check after the commit is in the final message.
  - CI (R100, not run locally): the full `test:render` suite and the iOS export. This task adds no render file and no bundled module.
- **SKIPPED:**
  - The picker, the file system and the settings page on a real phone: no device or simulator here. P4-T23 Step 3's phone proof runs the slip flow.
  - `typecheck:routes` and `export:web` (no route, app config or app entry changes). The edge, API and database suites (nothing outside `apps/app` changed; Docker is stopped). `test:ops` (no package or lockfile change).
- **Not applicable:** no package, lockfile, `app.json`, locale, route, `en.json` or `th.json` change; no analytics event; no log line.
- **Deviations** (the planner's rulings P1 to P18 in `.claude/controller/briefs/P4-T13.md`):
  1. `pickerPhotoLibrary` also takes `loadFileSystem` and `loadLinking`, so `release` and `openSettings` run in Node tests (P8).
  2. `openSettings()` uses `expo-linking`'s `openSettings`, loaded lazily (P7).
  3. `slipBatchRequest` is exported beyond the plan's interface, and each slip's album goes as the server keeps it (P11).
  4. `pickerShrink` also refuses text that is not whole base64, and the fake shrink takes `gone` (P9, P12).
  5. Cases beyond the plan's eight named ones (P13).
  <your own, if any>
- **Risks and notes for later tasks:**
  - P4-T14: send `resources.read(slipBatchRequest(batch, { ...header, last }))`, so the bytes counted are the bytes sent. `buildSlipBatches` measures with `last: false`, so a batch fits either `last`.
  - P4-T14: a null from `shrink()` means the photo cannot be sent (unreadable: drop it from pending); a throw means the copy is gone (it stays pending). `fakeImageShrink({ gone })` throws by uri.
  - P4-T14's `sendOneSlip` answers `too_large` for a null shrink. `pickerShrink` is also null for a file that is not a JPEG, PNG or WebP (a HEIC file shared from another app), which that word does not name.
  - `release()` deletes only a photo whose `albumId` is null (a picked copy). On both platforms every picked copy is under the app cache's `ImagePicker/` folder.
  - `PhotoAsset.bytes` is a hint: Android's picker reports the original photo's size, not its copy's. Nothing reads it yet.
  - A picked photo's `createdMs` is the time it was picked: the picker gives no taken time without `exif`.
  - Q1's `mediaLibraryPhotoLibrary()` and Q2's `manipulatorShrink()` wait on the owner's yes and are not written.
  - Under Q2's default, a photo over 1,200,000 bytes after the picker's 0.7 compression stays unread on the phone: a large camera photo, or a PNG screenshot, which iOS's picker does not compress.
```

## Step 7: Commit

1. `/usr/bin/git -C WT add apps/app/src/slips docs/implementation/receipts/P4-T13.md`
2. `/usr/bin/git -C WT status --short`. Expected: 8 paths staged (`A`), the 7 of `PL/files-real.txt` and the receipt, and nothing else. If anything else shows, stop and report.
3. `/usr/bin/git -C WT diff --cached --check; echo exit=$?`. Expected: no output and `exit=0`.
4. Write the message to `S/commit-message.txt` with the Write tool, then `/usr/bin/git -C WT commit -F S/commit-message.txt`:

```
Add the phone's photo, shrink and batch ports

The picker path of the photo library port under owner Q1's default
(expo-image-picker, no albums), the shrink port under Q2's default (a
photo's own bytes within 1,200,000, typed by its first bytes), slip
batches of at most 5 slips and 8 MiB of JSON with the body they measure,
and fakes of both ports for the scan engine and the slip screens.

Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
```

5. `/usr/bin/git -C WT diff --check origin/claude/p1a-vault-core...HEAD; echo exit=$?`. Expected: no output and `exit=0`. Then `/usr/bin/git -C WT log --oneline -1`, and record the SHA.

## Your final message

As the protocol says:
- `STATUS: DONE` or `STATUS: BLOCKED` first;
- the commit SHA and branch, and the files;
- the RED and GREEN counts, and the mutants (84 killed, and whether `S/mutants.out` equals the planner's);
- each gate command with its counts;
- SKIPPED: the phone checks, `typecheck:routes`, `export:web`, the edge, API and database suites and `test:ops`; CI: the full render suite and the iOS export;
- deviations: the five above, and any of your own.

---

## For the controller (not the implementer's)

- **Readiness.** READY. P4-T1 is merged; no package, lockfile, Cloudflare resource, account setting or owner answer is needed (Q1, Q2 and Q12 by default). No in-flight task shares a file, so it can run beside P4-T12 and 1D-T8.
- **Kit checks.**
  - The folder's own sums: `shasum -a 256 -c SHA256SUMS` from PL. The `*.log` files are in `SHA256SUMS.logs`, not in it.
  - `SHA256SUMS.base` checks the two contract files at `0bd5659`; `SHA256SUMS.red` and `SHA256SUMS.real` are the RED and final states.
  - `PL/work/` is the planner's proof tree (`606e131`'s code, byte for byte `0bd5659`'s, plus `node_modules` and the final files), outside the sums.
  - The planner's logs: `logs/summary.txt`, `logs/red/`, `logs/green/`, `logs/gate/` (`exits.txt`, `typecheck-app`, `test-app` 34 of 34, `test-unit` 940 of 940, `diff-check.log`), `logs/mutants.out` (84 `KILLED`), `logs/mutants-check.out`, `logs/mutant-logs/`, `logs/superseded/iter-1/`.
  - `logs/rehearsal.txt`: the brief's own commands, typed as written in a throwaway git copy of `0bd5659`. Every Expected line of Steps 0 to 4 and Step 7's staging and checks held, and its `mutants.out` was identical to `logs/mutants.out`.
- **The CI deltas:** `test:unit` +18; `test:app`, render, web and iOS +0.
- **Carry-ins, and where each went:**
  - P4-T1's review note (decomposed `é` as `\u` escapes): the album case (P11).
  - P3-T1's note (a null from `slipQrIn` never proves "not a slip") is P4-T14's: no QR is read here.
  - 1D-T6's m4 (the analytics-off header) does not apply: this task adds no transport.
- **Followups to record:**
  - P4-T14: send the body through `slipBatchRequest` (receipt note).
  - P4-T14 or P6A: `sendOneSlip`'s `too_large` also covers a shared file that is not a JPEG, PNG or WebP.
  - Q2's default leaves a large picked photo unread (the plan's own risk). A camera photo of a paper slip is the likely case, since bank-app slips are screenshots.
- **The planner's history.** The first planner of this task died with the controller at 22:04. Its seven `real/` files were checked whole and reused, with these changes:
  - `PhotoAsset`'s doc comment now says `bytes` is a hint (P4);
  - the album is trimmed again after the cut, and its case gained the cut-on-space and leading-space album with `\u` escapes (P11);
  - a padding case was added (S7 and S8 need it);
  - the fake's answers are checked to be copies (F8 to F10 need it).

  The stubs, tools, proof and brief are this planner's.

## Appendix: the code

Every block below is the kit's file, byte for byte (`tools/fill_brief.py` checks it). Copy from PL with `cp`; never retype.

### The final files (`PL/real/`)

`apps/app/src/slips/photoLibrary.ts`:

@@FILE real/apps/app/src/slips/photoLibrary.ts@@

`apps/app/src/slips/imageShrink.ts`:

@@FILE real/apps/app/src/slips/imageShrink.ts@@

`apps/app/src/slips/slipBatches.ts`:

@@FILE real/apps/app/src/slips/slipBatches.ts@@

`apps/app/src/slips/testing/fakePhotos.ts`:

@@FILE real/apps/app/src/slips/testing/fakePhotos.ts@@

`apps/app/src/slips/photoLibrary.test.ts`:

@@FILE real/apps/app/src/slips/photoLibrary.test.ts@@

`apps/app/src/slips/imageShrink.test.ts`:

@@FILE real/apps/app/src/slips/imageShrink.test.ts@@

`apps/app/src/slips/slipBatches.test.ts`:

@@FILE real/apps/app/src/slips/slipBatches.test.ts@@

### The typed stubs (`PL/stubs/`)

`apps/app/src/slips/photoLibrary.ts`:

@@FILE stubs/apps/app/src/slips/photoLibrary.ts@@

`apps/app/src/slips/imageShrink.ts`:

@@FILE stubs/apps/app/src/slips/imageShrink.ts@@

`apps/app/src/slips/slipBatches.ts`:

@@FILE stubs/apps/app/src/slips/slipBatches.ts@@

`apps/app/src/slips/testing/fakePhotos.ts`:

@@FILE stubs/apps/app/src/slips/testing/fakePhotos.ts@@
