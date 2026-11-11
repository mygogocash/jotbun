# Confirming review P2-T12: the fix round on PR #395

- **Scope:** the fix commit `af61e89a` only (range `37e366aa..af61e89a`), checked against the first review (`reviews/P2-T12.md`: M1, plus m3, m4, n2, n3 and n4) and the fix brief (`briefs/P2-T12-fix.md`, F1 to F9).
- **Reviewer:** the controller (Claude Code, Opus 5.5), inline in the owner's thread of 11 Nov, about 19:45 Bangkok. The hold was still on, so no new thread or lane was started. The fix was written by Cursor Auto, so this read is independent of it.
- **CI:** 9 of 9 green at `af61e89a` (run on the local runners after the 16:09 push). Since then, the integration branch has gained only controller-state commits under `.claude/`; `git diff af61e89a...origin/claude/p1a-vault-core -- . ':!.claude'` is empty. So the run still covers the current merge.
- **The post-restart gate (16:11):** `typecheck:app` exit 0, `test:app` 34 of 34, `test:unit` 974 of 974, the focused render files 24 of 24, `git diff --check` clean, gitleaks found no leaks.

## Findings

### Blocker, Major

None.

### Minor

- **c-m1, the receipt's Status line is stale.** `docs/implementation/receipts/P2-T12.md:49` says the round is "committed locally, not pushed". The controller pushed it at 16:09. The controller fixes the line in a housekeeping commit on the integration branch after the merge.

### Nit

None that needs action. One reading was checked and holds:
- `cardFrames.tsx` says that a view that comes back "answers only what is measured after it is back".
- A `measure()` asked before the view left, which lands after it is back, is stored, since the view is registered again by then.
- On the web that answer is still current. react-native-web 0.21.4's `measureInWindow` reads `getBoundingClientRect` inside its `setTimeout` callback (`dist/exports/UIManager/index.js:78-88`), so the rect is the one at landing time.
- On a phone `measureInWindow` answers at once (F3), so nothing lands late.

## What was checked and found right

1. **M1 (F1):** `onAccessibilityTap={onPress}` sits on `WalletCard`'s `Pressable` (`WalletCard.tsx:165`), and the header gains two sentences saying why. This is the review's exact fix.
   - `onPress` is typed with no parameters; otherwise `typecheck:app` would refuse it as `onAccessibilityTap`.
   - Under the review's and the planner's reading of React Native 0.88, iOS's `accessibilityActivate` then answers YES, so there is one press and no synthesized tap. Android never reads the prop.
2. **M1's pins (F2):**
   - `cardNativeProps.test.ts` reads both props from the source: P2-T11's review's ready case, and M1's case.
   - The render case records each `Pressable`'s props through a `react-native` mock that wraps `Pressable` only.
   - It calls `onAccessibilityTap` on a card behind the front one, as iOS would. It checks that card's own `onOpen`, the tick, and the 12 pt lift on the gentle spring, all once. That kills M1b, a double tap that presses twice.
3. **n2 (F3):** the fix has two lines, as the brief found it must:
   - `forget()` deletes the leaving view's own frame. The map is keyed by view, so no other view's frame is touched.
   - `measureView(walletId, view)` stores an answer only while that view is still the one registered for the wallet.
   - The registry case drives the review's FP4 sequence by hand with held measurements. N2a and N2b each fail it.
4. **The pins (F4):**
   - m3: a lone card's today line, and a back card's pending total, spoken and drawn.
   - m4: one `onOpen` per press after the lift settles.
   - n3: the keyed-order case at text sizes 1 and AX5, and `cardStackNative.test.ts`'s check that no view of the stack carries `accessible`. The check strips `//` comments first, and `accessibilityLabel` does not contain the word `accessible`.
   - n4: a second layout measures again; a render that changes nothing measures nothing again, counted per card view; `frameOf` is read as is.
   - Each pin is an assertion inside the case its rule belongs to. The render file goes from 12 cases to 15.
5. **Carried elsewhere (F7):** m1 and n1 go to P2-T24, and m2 to P2-T17. All three are in `followups.md` (the P2-T12 entry), and m2's "call `measure()` before every flight" is also in the receipt's P2-T17 note.
6. **Scope:** nothing outside `apps/app/src/wallet/card/` and the task's receipt changed. `WalletCard.tsx` was edited under the controller's leave (brief, opening section). No route, config, package or lockfile changed.
7. **RED, GREEN and mutants:** these are as the receipt records them (the Node pin and two render cases RED on `90b5079`'s code; the review's eight survivors each killed by their own pin; 73 of 73 mutants killed, the runner's output byte-identical to the planner's). They were not rerun here: the gate and CI cover GREEN, and the brief's kit sums matched in the worktree.

**Still SKIPPED (F9):** with VoiceOver on an iPhone, check that a double tap on each card behind the front one opens its own wallet. The Simulator has no VoiceOver.

VERDICT: Approved
