## Summary
- **P2-T18a: the guards the wallet shell needs before it mounts the saved moment and hides the bar on `/spend/wallet/*`.** P2-T18 is split in two (its brief's P2). This half merges first; the shell (P2-T18) builds beside it and shares no file.
- **Today's total stays exact** (P2-T17's reviews, m1; followups line 838):
  - **race A and the closed diary (P3):** the toast shows a figure only when the read and the outbox are one moment. A diary that has applied past the read's revision, or one no longer open, gives "unknown" and the plain line;
  - **race B (P4):** an acknowledged command whose `ackedRevision` is at or before the read's revision is not counted, because its record was committed and then deleted;
  - **P5:** every sum is still BigInt, and the guards only leave out or say unknown.
- **PV1 (P6, both reviews' m2):** in private mode, iOS hears the hidden words, and no announcement has a digit or the typed name.
- **The new-wallet flow and the editor** (P2-T21's confirming review; followups lines 699 to 701):
  - the flow is left once (m2, P7);
  - the card's place keeps a stacking context with `nativeID` (m1, P8);
  - step 2's back after a refusal is pinned (n1, P9);
  - the editor's ref survives StrictMode's double run (n2, P10);
  - P2-T21's receipts are corrected (m3 and the housekeeping, P11).
- **The controller accepted the planner's calls P1 to P16.**
  - Planned on Claude Opus, built on Claude Haiku 5.5.
  - The controller checked the commit: all 10 `real/` files are byte-identical.
  - The receipt is its own file under R87: `docs/implementation/receipts/P2-T18a.md`.
  - No copy, package, lockfile, route or edge change.
- **The reviews' pins (the controller's commit `7e2ae0dc`, test-only plus one comment).** Both reviews approve. Their findings were guards of this task's own code that no case held, and one comment:
  - race A for a diary still opening as the toast began (Sonnet m1b);
  - race B with the diary behind its acknowledgement, the shape reconcile leaves standing, so the read's revision decides (Opus m1, Sonnet m1a);
  - the closed diary over `locked`, `opening` and `unavailable` (Opus m2, Sonnet m1c);
  - an online save held the same way (Sonnet m1d);
  - the flow with nothing to go back to, left once (Sonnet n1);
  - the comment over the card's place (Opus n1, Sonnet n2).

## Test plan
- [x] RED: Node 1 of 8 and render 6 of 54 failing, every one an `AssertionError`.
- [x] GREEN: Node 8, render 54.
- [x] 20 of 20 mutants killed, every failing case an assertion. The output is identical to the planner's.
- [x] R100's fast gate:
  - `typecheck:app`, `test:app` and `test:unit` (1110);
  - the eight kit files 142;
  - the four routes tests 17;
  - the catalogue's `bw-saved` and `bw-wallet` sections 24;
  - `git diff --check`.
- [x] The reviews' pins (`7e2ae0dc`), under the heavy lock: the three render files 56 of 56 and `typecheck:app`. The reviews' mutants O1, O2, O6, O9, OF1, R1 and R3 are each killed on an assertion, by the case meant for it. The planner's H1 to H7 and W1 to W5 are still killed. Proof: `.claude/controller/scratch/p2-t18a-pins/`.
- [ ] CI on this pull request is green: the nine jobs. Note: GitHub Actions is queued org-wide.
- [x] Independent review (Opus), and a second review (Sonnet): today's total (races A and B, the closed diary), PV1, and the flow left once. Both approve.
- [ ] The Opus reviewer confirms `7e2ae0dc`.
- [ ] SKIPPED: device checks (VoiceOver hearing the toast in private mode; the flow's back on a phone).

Part of #164 (P2-T18); P2-T18's own PR closes it.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
