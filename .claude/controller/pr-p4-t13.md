## Summary
- The phone's photo, shrink and batch ports for slip import (P4-T13), as three new modules in `apps/app/src/slips/`, each with a fake for P4-T14 and P4-T18 on. Nothing in the app imports them yet, so no screen, route or bundle changes.
- **Photos (`photoLibrary.ts`):** Q1's default, the system picker only (`albumsSupported: false`). The picker gets exactly the plan's five options; a cancelled pick gives `[]`. Access reads and asks for the picker's media-library permission, with partial access mapped to `limited`. Releasing deletes the app's own picked copy, best effort, and never an album photo. Settings open through lazily loaded `expo-linking`, never a lazy `react-native` import, which Metro cannot load.
- **Shrinking (`imageShrink.ts`):** Q2's default, the photo as it is. A file over 1,200,000 bytes, text that is not whole base64, or anything other than a JPEG, PNG or WebP gives null. These match the server's own checks (`parseSlipImage`, P4-T6's type check), because the server refuses a whole batch for one bad image. A copy that is gone throws, so P4-T14 can tell it from an unreadable one.
- **Batches (`slipBatches.ts`):** in order, at most 5 slips and 8 MiB of JSON each, measured as the bytes sent (`last: false`, commas counted). `slipBatchRequest` builds the one body that is both measured and sent, with each album trimmed and cut as the server's `parseAlbum` keeps it.
- The controller accepted the planner's calls P1 to P18 (receipt, Deviations). The adapters that wait on the owner's Q1 and Q2 (`mediaLibraryPhotoLibrary`, `manipulatorShrink`) are not written, as the plan says.
- No package or lockfile change: `expo-image-picker`, `expo-file-system` and `expo-linking` are already app dependencies. No edge, API or database change. The receipt is its own file under R87: `docs/implementation/receipts/P4-T13.md`.

## Test plan
- [x] RED on typed stubs: 18 of 18 failing, every one an assertion. GREEN: 18 of 18 (photoLibrary 7, imageShrink 6, slipBatches 5).
- [x] 84 of 84 mutants killed (the plan's four and 80 more), each file restored. The output is byte-identical to the planner's run, and the 7 files match the planner's verified copies.
- [x] R100's fast gate: `typecheck:app`, the three focused files, `test:app` 34 of 34, `test:unit` 940 of 940, `git diff --check`.
- [ ] CI on this pull request is green.
- [ ] Independent review (Sonnet: size S).
- [ ] SKIPPED: the real picker, file system and settings on a phone (no device here). No route, config or entry changes, so `typecheck:routes`, `export:web` and the iOS export do not apply.

Closes #221 once merged (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
