## Summary
- **P2-T26: the record in the Bun Wallet look: its detail, its actions tray and Undo.**
  - **`WalletRecordScreen.tsx`:** bw-record.
    - Its title is the merchant, else the category (P2).
    - A facts card holds the wallet swatch and a date with the year (`shortDateWithYear`, new in `ui/dateStep.ts`, P4).
    - Status comes from the row state, with the neutral saved check (P5).
    - It keeps today's receipt section (W15).
  - **`RecordActionsTray.tsx`:** rh-actions, with the plan's props plus two optional ones (P6). Edit and copy run from the tray's `onClosed`, once its Modal has gone (R69, followups line 781).
  - **`WalletUndoBar.tsx`:** rh-undo's pill. It goes after 6 s, but never while a screen reader runs. It stays while its undo is on its way or unconfirmed, and Undo resends the same key (P9, P10).
  - **States:** deleted here, deleted elsewhere (the days left and Restore), a frozen delete, and load problems (P11).
- **Private mode (P3, R114):** every amount and the ghost are `฿••••`, the title falls back to the category, the note reads ซ่อนอยู่, and the undo bar drops the amount. Wallet and category names stay.
- **No events of its own (R61):** one `record_deleted` and one `undo_used`, with no amount or typed words.
- **The route:** `isRedesignEnabled('wallet')` picks the new screen with `key={id}` (P16). The routes test stubs it.
- **Catalogue (P15):** five sections, loaded lazily from `recordScreens.tsx`.
- **The controller accepted the planner's calls P1 to P21.**
  - Planned on Claude Opus (re-proved on `437743e2` after #449), built on Claude Haiku 5.5.
  - The controller checked the commit: all 11 `real/` files are byte-identical.
  - The receipt is its own file under R87: `docs/implementation/receipts/P2-T26.md`.
  - No package, lockfile, edge or database change. The copy is drafts for E2-B (Q3).
- **Open for this PR's fix round, ruling R123 (the controller):** in private mode, the wallet record page must not draw the receipt photo. Today's `RecordReceipt` section draws the slip thumbnail with no private-mode check (`WalletRecordScreen.tsx:376`), and a slip shows amounts and names. R114 hides every amount, so the page must hide the photo too. The implementer raised it; the reviews look for more like it, and one fix round carries R123 with the reviews' findings.

## Test plan
- [x] RED: render 26 of 30 and Node 1 of 15 failing, every one an `AssertionError`. `typecheck:app` passes.
- [x] GREEN: render 30, Node 15.
- [x] 106 of 106 mutants killed. 105 fail on assertions only; C1 is killed by the suite failing to load, as the runner expects (P18). The output is byte-identical to the planner's.
- [x] R100's fast gate:
  - `typecheck:app` and `typecheck:routes`;
  - the focused files 105, and Node 19;
  - the four routes tests 18;
  - the eight kit files 142;
  - the record sections in both catalogue suites 12;
  - `test:app` and `test:unit`;
  - `export:web` (the route changed);
  - `git diff --check`.
- [x] CI at `52110318`: 9 of 9, including the full render suite and the iOS export.
- [x] Independent review (Opus) and second review (Sonnet): **both Needs fixes** on `52110318` (`.claude/controller/reviews/P2-T26.md`, `reviews/P2-T26-second.md`). Both found M1, R123: in private mode the page drew, downloaded and opened the receipt photo. Opus also found m1 (the undo bar spoke `฿50`, not `50 บาท`) and test pins; Sonnet found four unpinned behaviours and the iOS dismissal bound.
- [x] **Fix round** (`0c062e3d`, brief `.claude/controller/briefs/P2-T26-fix.md`; rulings R123 and R124):
  - **R123:** while private mode is on, the page does not mount `RecordReceipt`, so nothing is downloaded or drawn. A record with a receipt, with the import area on, shows the one-row card "รูปใบเสร็จ ซ่อนอยู่", read as one element; with no receipt, nothing.
  - **R124:** `deletedBarText` returns the drawn and the spoken words. `WalletUndoBar`'s optional `spoken` labels them and is what iOS announces ("ลบ ข้าวมันไก่ 50 บาท แล้ว").
  - The reviews' pins: a new delete is a new bar, the tray's Close, Back, the pill's fill, the refused-delete words from the page and the tray, a failed draft Remove, AX5 stacking, and the decorative tile and swatch. Also a late first screen-reader answer is ignored once a change has arrived.
  - The proofs: RED 7 of 39, all assertions; GREEN 39; **139 of 139 mutants killed** (C1 by a load failure, as designed). All 7 fix-kit files are byte-identical, and the mutant log is identical to the planner's.
  - Planned on Claude Opus, built on Claude Haiku 5.5.
- [x] The controller merged the integration head (P2-T17, P4-T3, P3-T8 and P3-T3) as `e4313772`, with no conflicts. On the merged tree:
  - `typecheck:app` 0 and `test:unit` 1110;
  - the five record files 167;
  - the eight kit files with `AddTray` and `SavedMoment` 180;
  - the routes 18;
  - the catalogue's record, deleted and saved sections 20;
  - `git diff --check` on the range.
- [ ] CI at `e4313772` (queued org-wide: GitHub Actions).
- [x] Confirming review (Opus): **approved** on `e4313772` (`.claude/controller/reviews/P2-T26-confirm.md`), with no blocker, major or minor. R123 and R124 are confirmed, and nothing the round could have broken was found. Its two optional nits (the late-answer guard pinned in one direction; the dropped `active` half under StrictMode) are carried in `followups.md`.
- [ ] SKIPPED: device checks (the record, the tray and the bar on a phone; VoiceOver; the largest text).

Closes #172 once merged (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
