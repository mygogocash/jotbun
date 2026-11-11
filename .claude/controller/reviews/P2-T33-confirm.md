# P2-T33 confirming review: the fix round `8e270766`

- **Reviewer:** Claude Opus 5.5, the independent confirming review. Read-only.
- **What:** the fix commit `8e270766` on `p2/t33-face-id-lock` (range `5844e4c1..8e270766`, 12 files), PR #406, after `git fetch` (the worktree is clean and level with its remote).
- **Read against:**
  - the second review's M1 and minors (`reviews/P2-T33-second.md`);
  - the first review's m2 to m4 and n4 (`reviews/P2-T33.md`);
  - ruling R107 (`handover.md`, 21:45, and the 22:50 calls accepted);
  - the fix brief `briefs/P2-T33-fix.md` and its kit `scratch/p2-t33-fix-planner/`;
  - the implementer's logs (`scratch/p2-t33-fix/`) and the receipt `docs/implementation/receipts/P2-T33-fix.md`;
  - the plan's `### Task P2-T33` (line 1555) and the protocol (R87, R100).
- **Where:** probes and mutants ran only in scratch copies under `.claude/controller/scratch/p2-t33-confirm/`:
  - `copy/` (`git archive 8e270766`) for the planner's mutants;
  - `copy2/` (the same) for my probes and my own mutants;
  - `copy-base/` (`git archive 5844e4c1`) for my probes on the reviewed head.

  `node_modules` was linked from the worktree. Every mutated file was restored and checked by SHA-256 against the kit's `SHA256SUMS.real-in-wt` (11 OK in both copies). Nothing in the worktree or the main checkout was edited.
- **Verdict: Approved.** M1 is fixed, end to end through the record's real receipt panel. Every gate fix the controller listed holds, and the 11 planner mutants I sampled are all killed.
  - One minor (m1): the new quiet flag has two windows that no case holds. They are the setting read at a cold start, where the gate itself closes a leak that `5844e4c1` had, and `inactive`. Two proven cases are ready below.
  - Three nits.
  - CI has not finished: the Exports job hit its 20-minute limit on a slow runner. Rerun it; the merge waits on a green run (R100).

## CI on PR #406 (head `8e270766`, run 43055161049, read at 23:43 Bangkok)

- **Exports: cancelled at the job's time limit (`gh pr checks` shows "fail"). Not this commit.**
  - The job ran on the local runner `jotbun-runner-2` and has `timeout-minutes: 20` (`.github/workflows/backend.yml:77`).
  - `setup-node` took 13.5 minutes (16:14:00 to 16:27:33 UTC), and `npm ci` took 5 more (to 16:32:49).
  - `export:web` then passed in 2 s: `Web Bundled … (4832 modules)` and `Exported: dist`. At `5844e4c1` it bundled 4830.
  - `export:ios` had run for 32 s when the limit cancelled it ("The operation was canceled", 16:33:23).
  - Rerun the job. Log: `scratch/p2-t33-confirm/ci-exports-130642540017.log`.
- **The other eight jobs:** queued, behind five older queued runs (`promote/p2-t23`, `p2/t25`, `p2/t32`, `p2/t14`, `p3/t4`).
- **The local checks:**
  - `git diff --check` is clean on `5844e4c1..8e270766` and on `origin/claude/p1a-vault-core...8e270766` (27 files over both rounds).
  - The PR is `MERGEABLE`.

## Findings

### Blocker

None.

### Major

None.

### Minor

**m1. The new quiet flag has two windows no case holds; one of them stops a leak at every cold start.**

- **What the code does.** `hidden` includes `!setting.ready` and `view.covered` (`LockGate.tsx:350`), and the layout effect sets the flag from `hidden` (`:353-356`). So the app below says nothing on iOS in two more windows besides "locked":
  - **The setting read at a cold start.** With the lock on, this keeps a line the app below already has at its first render from being said over the cover. `useAnnouncement` speaks on mount as well as on change (`a11y.ts:51-55`); Home's sync line is one such line (`HomeScreen.tsx:413`).
  - **`inactive`.** Control Centre or the app switcher, with the lock on and the app unlocked.
- **Evidence.**
  - Probe G1 (`copy2/apps/app/src/wallet/lock/ConfirmProbe.render.test.tsx`): the lock is on, the case runs as iOS from the first render, and a line "Saving 2 entries…" is set at mount.
    - At `8e270766`, iOS hears only `lock.tryAgain`.
    - At `5844e4c1`, it hears "Saving 2 entries…" first (`probe-gate-base.log`).
    - So this round closes that cold-start leak too, though no case says so.
  - My mutant QX1 narrows the flag to the lock's view: `setQuietUnderLockCover(view.locked || view.covered)`, with the dependencies `[view.locked, view.covered]`.
    - It SURVIVES all 38 cases of `Lock.render.test.tsx` (`own-mutants-full.out`).
    - Probe G1 kills it (`QX1p`): iOS hears "Saving 2 entries…" over the cover.
  - My mutant QX7, `setQuietUnderLockCover(!setting.ready || view.locked)`, leaves `inactive` unquiet.
    - It SURVIVES all 38 cases.
    - Probe G5 kills it (`QX7p`): a line that changes while the app is only covered is said.
  - Only `PrivateMode.render.test.tsx` also spies on announcements, and it never switches the `wallet` area on, so it runs with no gate.
- **Why it is not a nit.** The m4 case mounts its lines empty and goes straight to `background`, so it holds only "locked". R107, as the brief states it, says every new guard gets a mutant, and the protocol's step 5 says to add a case for every survivor. QX1 is not equivalent: it brings back the second review's m4 leak, at every cold start. Nit n1 below gives someone a reason to narrow the flag later.
- **The fix.** Add G1 and G5 to `Lock.render.test.tsx`. Its `Status`, `gated`, `port`, `say`, `ready` and `app` already fit.
  - G1 runs as iOS from the first render. There, `ThemeProvider` reads `expo-secure-store`, which the web build lacks, so the file needs `vi.mock('expo-secure-store', () => ({ getItemAsync: async () => null, setItemAsync: async () => undefined, deleteItemAsync: async () => undefined }))`. It is harmless to the cases that run as the web.
  - Both pass on `8e270766`. Their bodies, as run:

```tsx
test('PROBE G1: lock on, a cold start: a line the app below has at its first render is not said', async () => {
  listenToAppState();
  const announce = vi.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
  Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true, writable: true });
  mountWallet(gated(fakeLocalAuth(['cancelled']), <Status line="Saving 2 entries…" />), { device: { lock: '1' } });
  await ready();
  expect(screen.queryAllByTestId('locked-screen').length).toBe(1);
  expect(announce.mock.calls).toEqual([[say('lock.tryAgain')]]);
});

test('PROBE G5: lock on, only covered: a line that changes below is not said until the app is in front', async () => {
  listenToAppState();
  const fake = fakeLocalAuth(['success']);
  const view = mountWallet(gated(fake, <Status line="" />), { device: { lock: '1' } });
  const announce = vi.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
  Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true, writable: true });
  await ready();
  expect(screen.queryByTestId('locked-screen')).toBeNull();
  app('inactive');
  await ready();
  expect(screen.queryByTestId('lock-cover')).not.toBeNull();
  view.rerender(gated(fake, <Status line="Saving 2 entries…" />));
  await ready();
  expect(announce.mock.calls).toEqual([]);
  app('active');
  await ready();
  view.rerender(gated(fake, <Status line="Saved 2 entries" />));
  await ready();
  expect(announce.mock.calls).toEqual([['Saved 2 entries']]);
});
```

- **Whether to block.** The code is right today, so this need not block the merge. The controller may fold the two cases into #406's merge round or carry them to P2-T34, the first task that lets the lock turn on.

### Nit

**n1. With the lock off, a line the app below has at its first render is never said on iOS (new in this round).**
- **The cause.** The gate cannot know whether the lock is on until the setting is read, so it covers, and now quiets, for everyone in that window.
- **Evidence (probe G2).** The lock is off and the line "Saving 2 entries…" is set at mount. At `5844e4c1` iOS hears it; at `8e270766` it is never said. A later change is said.
- **How much it costs.** It fails closed and is small in practice. Home builds its line from diary state that loads after the first commit, so the line rarely exists at the first render. Still, it is a cost for every iOS VoiceOver user with the `wallet` area on, lock on or off, and neither the receipt nor the `a11y.ts` comment records it.
- **Suggested.**
  - Record it, and add "a VoiceOver cold start with the lock off" to P19's device checks.
  - If it ever needs a fix, do not narrow the flag (m1). Hold first-render lines until the setting is read, then say them if the lock is off.

**n2. A first reading that never answers holds the automatic ask for the whole session.**
- **The cause.** Only the mount's `readPhone()` sets `settled` (`LockGate.tsx:220-228`).
- **Evidence (probe G4).** The first `availability()` never answers and later ones answer Face ID. The read on `active` makes the lock screen name Face ID. Yet neither the cold start nor the next opening asks by itself (0 and 0); the button asks (1).
- **How much it costs.** It fails closed. Ruling P4 accepts that "a reading that never answers leaves the ask to the button", but here a later reading did answer.
- **Suggested.** One line lets any settled reading set `settled`, for example `readPhone` setting it once it returns. The receipt's P2-T34 note already says `availability()` must answer.

**n3. The receipt's keyboard line is loose.**
- The receipt says the keyboard goes "on both background and inactive when locked".
- The code dismisses it whenever the app is hidden (`LockGate.tsx:358-360`): on `inactive` whenever the lock is on, locked or not, and once at a cold start's unread cover.
- The brief (P11) and the case agree with the code. Only the receipt's wording is off.

## What I checked, by the controller's focus

1. **M1: fixed.**
   - **The planner's case.** The lock is on, the photo open, then `background` and `active`. The viewer's Modal draws `LockCoverArt` with the lock screen, and nothing of the photo. Its layer is unnamed, and Escape asks nothing. Unlocking inside the viewer brings the photo back, and back then closes it. RV1 and RV2 are killed in my sample.
   - **My probe R1, end to end** (`copy2/apps/app/src/screens/redesign/import/ConfirmReceiptProbe.render.test.tsx`, `probe-receipt.log`):
     - **The setup.** The record's real `RecordReceipt`, with its `ReceiptViewer` (`RecordReceipt.tsx:394`), under a `LockGate`. The photo is opened from its thumbnail ("Open the receipt photo"), then `background` and `active`, and the scan is cancelled.
     - **Outside the app's root:** no `receipt-viewer`, no `receipt-full-image`, no `img`, no "Receipt photo" text, no Close button (hidden ones counted too) and no dialog named "Receipt photo".
     - **In the viewer's layer:** a cover with the lock screen, whose only buttons are "Unlock with Face ID" and "Use passcode".
     - **Below:** the record's thumbnail stays mounted, under the gate's `aria-hidden`.
     - **Unlocking** inside the viewer brings the photo back.
     - **Then `inactive`:** the viewer draws the cover, with no lock screen and nothing of the photo. `active` brings the photo back, with no prompt.
   - **The sweep.**
     - A grep for `Modal` in `apps/app/src` and `apps/app/app` (tests aside) finds exactly the seven files `lockCover.test.ts` lists.
     - Nothing else draws above the root: no `Modal as` import, no portal, no `FullWindowOverlay`, no native `presentation` and no overlay package. There are no `.js` sources.
     - `WalletRoot` wraps the whole `Stack` (`app/_layout.tsx:45-50`) and holds the only `LockGate`.
     - No native `Alert.alert` exists outside the legacy screen, so there is nothing to add to the second review's m6.
   - **The four legacy Modals are shown only under `EXPO_PUBLIC_LEGACY_SPEND=1`.**
     - `SpendDatePicker`, `SpendMediaPermissionPrimer` and `SpendNewCategorySheet` are referenced only in `CustomerSpendScreen.tsx`. Only `app/spend/index.tsx:9` draws that screen, behind `isLegacySpendEnabled()`, which is `=== '1'` (`featureFlags.ts`).
     - There is no re-export or dynamic import of any of them.
     - The switch is set only in tests. `.env.example` sets it to `0`, and P6C-T1's planned store profiles do too.
     - `PushPermissionPrimer`, named in a comment, no longer exists. MS2 is killed.
2. **The gate's fixes: they hold.**
   - **The first ask waits for the phone's reading (`settled`, `:223`, `:293`).** FP1 is killed. Probe G3: a fingerprint phone that answers after the setting is asked with `lock.lineFingerprint`. The planner's case covers Face ID, and an unreadable phone in the passcode's words. My QX2 (`settled` out of the effect's dependencies) is killed.
   - **An opening that comes during a prompt asks after it.**
     - The opening is marked in `unlock`, after the in-flight check (`:269`), and `busy` is in the effect's dependencies (`:295`). AO1 is killed.
     - I traced the switch too: a turn-off prompt that answers after a trip away leaves the new opening locked, and that opening asks by itself once the prompt answers. A scan from before the trip opens nothing.
   - **`try/finally`, in both `unlock` and `change`.** The dropped answer's early return is inside the `try`. FIN2 is killed.
   - **Answers and readings outside the port's types fail closed.**
     - `authResultOf` turns them into `failed`. `availabilityOf` checks the method against a list, not with `in`, and returns null otherwise. `afterRecheck` turns off only on `=== false`.
     - The Node case pins `{ canLock: true }` with no `method` as unreadable.
   - **The stored write, and `lock.notStored`.**
     - `change(true)` turns the lock on only after `store.set` resolves (`:316`), and `asking` holds through the write. WS1 is killed.
     - The notice is a polite status with no timeout and a close button, said once on iOS through `announceOverLockCover`.
     - Turning the lock off stays fire-and-forget, which fails closed.
     - A write that never settles leaves the switch busy with the lock off. That is no lockout: nothing locks until `enabled` is set.
   - **n6: no false turned-off notice.** It holds through `assumed` (`:258`). N6B is killed. My QX5 moves n6's early return above the unlock, which would leave an unreadable store stuck locked; the n6 case kills it, since it asserts the app opens.
3. **iOS stays quiet under the cover: it holds, apart from m1.**
   - Only `a11y.ts` calls `AccessibilityInfo.announceForAccessibility`.
   - `announceStatus` now goes through `announcePolitely` (QT5 killed). The controller accepted this as R107's intent.
   - The gate's three notes still speak, through `announceOverLockCover` (`:260`, `:281`, `:319`). No lock part announces through the quiet path.
   - The layout effect matters: QT6, which makes it a plain effect, is killed.
   - The app's other `AppState` listeners announce nothing on their own; they start async work or set state. They are `DeviceDiaryProvider`, `useReminderUpkeep`, `AnalyticsUpkeep` and the legacy screen. So any line they cause is said from an effect after the gate's commit.
   - The only focus moves are `Sheet`'s, `Tray`'s and `ReceiptViewer`'s `onShow`, and `RecordRow`'s menu. Each follows a press, and under a cover their targets are unmounted (`null`).
   - The module flag has one writer, the one `LockGate`.
4. **Keyboard dismissal: it holds.** `Keyboard.dismiss()` runs each time the app becomes hidden (`:358-360`), so `inactive` counts too (KB2 killed). The case asserts both the call and, on the web, the blur. On a phone it stays a P19 device check.
5. **Mutants.**
   - **The planner's, 11 of 166:** RV1, RV2, MS2, QT5, QT6, KB2, FP1, AO1, FIN2, WS1 and N6B (`planner-mutants.out`).
     - Each is killed on an `AssertionError` by the case the brief names, and each restore matched by SHA-256.
     - The slow Settings case was left out by name, so a load timeout could not spread to the cases after it. None of the 11 is killed by it.
   - **Mine:**
     - QX1 and QX7 SURVIVED (m1); probes G1 and G5 kill them.
     - QX2 and QX5 KILLED.
     - Logs: `own-mutants.out`, `own-mutants-full.out` and their `own-mutant-logs*/`.
6. **The rest.**
   - The eleven committed files match the planner's kit byte for byte (`SHA256SUMS.real-in-wt`: 11 OK; `DateChip.tsx` OK).
   - The implementer's logs match the brief:
     - RED: Node 2 of 18 and render 9 of 40, all on assertions, and the nine pins;
     - GREEN: 18 and 40, and 302 across the focused files;
     - mutants: 166 killed with 166 restores.
   - The route test is sound. Its stand-ins hold the route's own two rules: RT1 to RT3, as the implementer ran them.
   - **The focused files in my copy:**
     - Node: 18 of 18.
     - Render, first run (five files at once, load average about 20): two timeouts. The first round's Settings case took 5.6 s, past vitest's 5 s limit, and its leftover work failed the 17 lock cases after it. RecordReceipt's full-screen case took 7.2 s.
     - Rerun alone: RecordReceipt 48 of 48 (213 ms for that case), and Lock with LockRoute 40 of 40.
     - Load flakes. Both runs are recorded (`base-render.log`, `base-recordreceipt-rerun.log`, `base-lock-rerun.log`).

## Notes for later tasks

- **P2-T34:**
  - `availability()` must answer at a cold start, or no opening asks by itself for the whole session (n2).
  - Return `method: null` explicitly for a phone that cannot lock; the port's type already requires it. A reading with no `method` counts as unreadable. On a phone whose passcode was removed, the lock would then never turn itself off, and the person gets back in only by setting a passcode again.
- **P19's device checks:** add a VoiceOver cold start with the lock off (n1).
- **n6's other side (ruling P12):**
  - Suppose a person turned the lock on in an earlier session, and this launch cannot read the setting. The lock then counts as assumed.
  - If the phone can no longer lock, the lock turns off and removes the stored `'1'` without the notice.
  - That needs a failed store read and a removed passcode at once. Noted only.
- **Any later change to the quiet flag:** keep the setting read and `inactive` inside its window (m1).

## Scratch evidence (`.claude/controller/scratch/p2-t33-confirm/`)

- **Copies:** `copy/` (the planner's runner), `copy2/` (my probes and mutants), `copy-base/` (`5844e4c1`, plus my probe file).
- **Probes:**
  - `probe-receipt.log`: probe R1.
  - `probe-gate.log`: probes G1 to G5 at `8e270766`.
  - `probe-gate-base.log`: G1 and G2 at `5844e4c1`.
- **Mutants:**
  - `planner-mutants.out` and `planner-mutant-logs/`;
  - `own-mutants.out`, `own-mutants-full.out`, `own-mutant-logs/` and `own-mutant-logs-full/`;
  - the runners are in `tools/`.
- **Focused runs:** `base-unit.log`, `base-render.log`, `base-recordreceipt-rerun.log` and `base-lock-rerun.log`.
- **CI:** `ci-exports-130642540017.log`.

VERDICT: Approved
