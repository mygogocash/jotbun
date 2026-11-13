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
- [ ] Independent review (Opus), and a second review (Sonnet): private mode (P3, and R123's receipt photo), the actions tray's order (R69), the undo bar's rules, and the events.
- [ ] Fix round for R123, with the reviews' findings.
- [ ] SKIPPED: device checks (the record, the tray and the bar on a phone; VoiceOver; the largest text).

Closes #172 once merged (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
