## Summary
- **P2-T33, the Face ID lock on a port.** This adds the gate (`LockGate`), the cover over trays and sheets, the locked screen (sa-locked), the setup screen (sa-lock-setup), Settings' row and the `/settings/lock` route, all behind the `wallet` area.
- **The port:** `localAuthPort.ts`. `getAppLocalAuth()` answers `noLocalAuth` until P2-T34 adds `expo-local-authentication`, so no package or lockfile changes.
- **The rules** (`lockModel.ts`; W18, R67, R63):
  - With the lock on, each opening (a start, every return from the background) locks, and asks once, when the app is in front.
  - `inactive` covers only. The prompt's own `inactive` never asks again, so it cannot loop.
  - The app stays covered until the setting is read. A setting that cannot be read counts as on, so a broken store never opens the app.
  - The answers:
    - success unlocks;
    - cancelled and failed stay locked, with a note;
    - lockout says so;
    - unavailable reads the phone again, and turns the lock off with a notice only when the phone can no longer lock.
  - An answer to an earlier opening is dropped.
- **Covered or locked, the app stays mounted,** so drafts and sync carry on. It is hidden from screen readers, and Android's back does nothing under the cover.
- **Trays and sheets (P2, P10, P11):**
  - `LockCover` gains an optional `screen`. Each tray or sheet draws the lock screen inside its own Modal, since on iOS a Modal draws above the app's root.
  - `Sheet` draws the cover in place of its backdrop and panel, and its backdrop is no longer a tab stop.
  - `Tray.tsx` is unchanged.
- **Copy:** the plan's Thai lines, word for word, plus three drafts for E2-D (P4d). `draftText.test.ts` exempts `lock.methodFace` (Face ID is Latin in Thai too).
- **Sections:** five `bw-lock-*` catalogue sections in `lockSections.tsx`. In `index.ts`, the import goes after `import type`, and the spread goes last (P4g), merged after P2-T12's lines.
- **Merge order (P17):** P2-T14 first. The second of the two to merge keeps both lines in `index.ts` (`...WALLET_ADD_SECTIONS,` before `...WALLET_LOCK_SECTIONS,`). `draftText.test.ts` merges cleanly.
- **The controller:**
  - accepted the planner's calls P1 to P20 (receipt, Deviations);
  - ruled on `WalletCard.tsx`: P2-T12 added one prop on its `Pressable` branch, and the lock's preview passes no `onPress`.
  - No package, lockfile, edge, API or database change. The receipt is its own file under R87: `docs/implementation/receipts/P2-T33.md`.

## Test plan
- [x] RED. Every failure is an assertion:
  - `lockModel.test.ts`: 10 of 11 failing; the copy pin passes;
  - the lock and sheet render files: 26 of 39 failing;
  - the draft check: 4 of 4, by design.
- [x] GREEN:
  - Node: 15 of 15;
  - render: 39 of 39, with nothing on stderr;
  - the 12 neighbour files: 174 of 174, unchanged;
  - the catalogue's `bw-` sections: 32, which is C + 10 (C = 22 at this head);
  - the registry rule: 1 of 1.
- [x] 121 of 121 mutants killed, with output identical to the planner's. The files match the planner's verified copies. `index.ts` equals the planner's `merge/index.t12-t33.ts`, since P2-T12 merged first.
- [x] R100's fast gate:
  - `typecheck:app` and `typecheck:routes`;
  - `test:app` and `test:unit`;
  - `export:web`: 4830 modules (a route was added);
  - the focused render files: 213 of 213;
  - `git diff --check`.
- [ ] CI on this pull request is green: the nine jobs, including the full render suite and the iOS export.
- [ ] Independent review (Opus), and a second review, since an app lock is privacy work. Then the owner's yes before merging.
- [ ] SKIPPED, device checks (P19):
  - Face ID on a phone (needs P2-T34);
  - the iOS app-switcher snapshot and Android recents (owner Q1);
  - which lock screen VoiceOver and TalkBack reach with a tray or sheet open;
  - the card's entry, scroll and focus when the cover lifts;
  - Android's back under the lock;
  - the turned-off notice under an open tray;
  - AX5 on both screens.

Closes #179 once merged (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
