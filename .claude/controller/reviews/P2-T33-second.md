# P2-T33 second review (privacy): the Face ID lock on a port

- **Reviewer:** Claude Opus 5.5, the independent second review (the owner's routing for privacy work; Gemini is out of quota until about 18 Nov). Written before reading `reviews/P2-T33.md`.
- **What:** commit `5844e4c1` on `p2/t33-face-id-lock`, range `origin/claude/p1a-vault-core...5844e4c1` (21 files), PR #406. Read against the plan's `### Task P2-T33` (line 1555), W18, W26, Q1, R63 (plan lines 875, 1586; P3's plan line 68), R67, the brief `briefs/P2-T33.md` (rulings P1 to P20), the receipt and the implementer's logs.
- **Where:** read-only. Probes and mutants ran only in a scratch copy (`git archive 5844e4c1`, node_modules linked from the worktree): `.claude/controller/scratch/p2-t33-second/copy/`. Every mutated file was restored and checked against the commit by SHA-256; the worktree is clean at `5844e4c1`.
- **Verdict:** Needs fixes. One major: the record's full-screen receipt photo is a Modal that never reads the lock's cover, so with the lock on it stays drawn, named and pressable over the locked app (probe 1). The gate itself holds: I found no way past it to the app's root, and no way to turn the lock off without a passing prompt or a phone that truly can no longer lock.

## CI on PR #406 (head `5844e4c1`, run 43031794055)

- Attempt 1: every job passed except `SQL integration and ops`, which failed 1 of 694 (`attachments.integration.spec.ts`, "two records retaining one image at once keep one receipt, made by one copy", expected 1 write, got 2). That is the recorded API race (`followups.md` line 27; `handover.md` R-B; `pr-api-db-flakes.md`), and this range changes nothing outside `apps/app` (`git diff --stat` on `apps/api`, `packages`, `scripts`, `package*.json` is empty).
- Attempt 2 (the whole run again): `Typecheck, unit, API, build` passed (`typecheck`, `typecheck:app`, `typecheck:routes`, `test:api` 1000 of 1000 in 47 suites, `test:app` 34, `test:unit` 985, `fail 0`); `Render` 112 files, 1384 passed; the three per-section jobs 224, 210 and 170 passed (604 between them); `Exports` Web Bundled (4830 modules) and iOS Bundled (5796 modules), both exported; `Edge Worker` and `Release image` passed. `SQL integration and ops` was queued when this review was written.

## Findings

### Major

**M1. The record's receipt photo shows over the locked app.** `ReceiptViewer` (`apps/app/src/screens/redesign/import/ReceiptParts.tsx:207-277`) is a full-screen `Modal` of its own and never reads `useLockCover()`. A Modal draws above the app's root on both platforms (the reason R63 makes each Modal hide its own content), so the gate's cover lies under it.
- Reachable with the `wallet` area on: `/spend/record/[id]` draws `RecordScreen`, whose `RecordReceipt` (`RecordScreen.tsx:214`, `RecordReceipt.tsx:65`, `:394`) opens the viewer; `import` and `core` are approved, so on in every build (`featureFlags.ts:49`). P2-T26's `WalletRecordScreen` keeps "today's receipt section unchanged when the `import` area is on" (plan line 1331, W15), and only P3's photos area replaces it with a covered viewer (P3 plan lines 918 and 935). Until then this viewer is the live one.
- Probe 1 (`copy/apps/app/src/wallet/lock/Probe.render.test.tsx`): lock on, the photo open, `background` then `active`. The gate is locked (its lock screen is up), yet `receipt-viewer` and `receipt-full-image` are still in the page, outside the root, not under any `aria-hidden`, with no `lock-cover` in their layer, and the heading "Receipt photo" is reachable by role. The control case with a `Sheet` shows the cover and the lock screen and nothing of the sheet.
- What it means on a phone: the person leaves with a slip open; whoever picks the phone up and opens Jotbun sees the slip (merchant, amount, often an account number) over the lock screen, can dismiss the Face ID prompt and keep looking, and can press the viewer's own Close. The app switcher shows it too, whatever the Q1 race does, since the JavaScript cover is under it. This breaks the lock's own promise (`lock.body`: scan before you see amounts and entries).
- Fix (5 lines and one case): as `Sheet.tsx` now does, `const { hidden } = useLockCover();`, draw `<LockCoverArt />` in place of the `Animated.View` while hidden (so the lock screen shows inside the viewer's Modal, as in a tray or sheet), let `onRequestClose` ask nothing while hidden, and leave the web layer unnamed. A case like the tray and sheet one ("with the receipt photo open, a return from the background shows the lock screen inside its own cover, and no photo") pins it.
- A plan gap: the plan names Tray and Sheet only. `ReceiptParts.tsx` is outside this task's file list, so the controller decides whether it joins this PR (recommended: the change is mechanical and the lock is the task) or becomes a prerequisite of P2-T34, the first task that lets the lock turn on. I swept every other `Modal` in `src`: `SpendDatePicker`, `SpendNewCategorySheet`, `SpendMediaPermissionPrimer` and `CustomerSpendScreen`'s are reached only from the legacy screen (`isLegacySpendEnabled()`, development only). No route uses a native `presentation` (modal or sheet), so every route renders under the gate.

### Minor

**m1. Under the cover a Sheet drops its children's own state; the email code step is lost with the lock on (latent).** `Sheet.tsx` draws `LockCoverArt` in place of the panel, so the panel's children unmount on every `inactive` and `background` while the lock is on. Its new comment says "its content is its host's, so nothing is lost" (`Sheet.tsx:16`), which is not true of every sheet: `ConfirmItsYouSheet` (`signin/ConfirmItsYouSheet.tsx:82-89`) draws `EmailCodeForm`, which keeps its code step, the typed code and the resend wait in its own state (`EmailCodeScreen.tsx:75-82`).
- Probe 5, with the real sheet: send the code (the code step shows), `inactive`, `background`, `active`, a passing scan: the sheet is back at the address step ("Send the code"). With the lock off the same trip keeps the code step.
- Who meets it: `useFreshSignIn` opens this sheet before export, deletion, sign out everywhere and linking or removing a method (`ConfirmItsYouSheet.tsx:1-3`). An email account reading the code in Mail, or even pulling down Notification Centre (`inactive` covers too), comes back to the start every time; on Android no code autofill rescues it. Workaround: turn the lock off first.
- Latent today: no route reaches the sheet yet (1C-T9 wires it into Settings, Privacy and Devices; `freshSignInOf` returns null for email, `SettingsParts.tsx:50-53`), and the lock cannot turn on before P2-T34. It needs a ruling before both land: either the sheet keeps its panel mounted under an opaque cover inside the Modal (hidden from screen readers and touches; the cost is that a focused input there keeps the keyboard, see m5), or the form's step moves to its host (1C's files). P6B-T8, which turns this sheet into a tray, meets the same rule (a tray's content unmounts too, plan line 875).

**m2. Two privacy guards on the switch are untested.** My mutants (`own_mutants.py`, logs in `own-mutants/`) against the 24 lock cases:
- A2 SURVIVED: `if (result !== 'success') return;` (`LockGate.tsx:275`) changed to stop only on `cancelled` and `unavailable`, so a failed scan or a lockout turns the lock on or off. No case answers the switch with `failed` or `lockout`.
- A3 SURVIVED: `gone` (`LockGate.tsx:268`) reads the phone but ignores its answer, so turning the lock off on an `unavailable` answer turns it off on a phone that can still lock. The only turn-off case answers with a phone that cannot lock.
- A1 (turning off asks nothing) and A4 (no explicit `aria-hidden` on the hidden app) are killed.
- Two ready cases (`copy/apps/app/src/wallet/lock/ReviewCases.render.test.tsx`) pass on the real code and kill A1, A2 and A3. With `Lock.render.test.tsx`'s own helpers:

```tsx
test('the switch leaves the lock as it was after a scan that fails or locks out, turning it on or off', async () => {
  const lockSwitch = () => named('switch', say('lock.switch', 'th', { method: FACE.th }));
  for (const answer of ['failed', 'lockout'] as const) {
    listenToAppState();
    const on = port([answer]);
    const off = mountWallet(gated(on, <LockSetupScreen setup={false} />));
    await ready();
    await press(lockSwitch());
    expect(on.authenticate, answer).toHaveBeenCalledTimes(1);
    expect(lockSwitch().getAttribute('aria-checked'), `turning on, ${answer}`).toBe('false');
    expect(off.stored.has(STORED)).toBe(false);
    expect(off.stored.has(ANSWERED)).toBe(false);
    cleanup();
    vi.restoreAllMocks();
    phone.listeners.clear();
    // The cold start unlocks; turning the lock off answers with the failure.
    listenToAppState();
    const turning = port(['success', answer]);
    const kept = mountWallet(gated(turning, <LockSetupScreen setup={false} />), { device: { lock: '1' } });
    await ready();
    await press(lockSwitch());
    expect(turning.authenticate, answer).toHaveBeenCalledTimes(2);
    expect(lockSwitch().getAttribute('aria-checked'), `turning off, ${answer}`).toBe('true');
    expect(kept.stored.get(STORED)).toBe('1');
    cleanup();
    vi.restoreAllMocks();
    phone.listeners.clear();
  }
});

test('turning the lock off, an unavailable answer on a phone that can still lock keeps the lock on and says nothing', async () => {
  listenToAppState();
  const fake = port(['success', 'unavailable'], [FACE_PHONE]);
  const view = mountWallet(gated(fake, <LockSetupScreen setup={false} />), { device: { lock: '1' } });
  await ready();
  const reads = vi.mocked(fake.availability).mock.calls.length;
  await press(named('switch', say('lock.switch', 'th', { method: FACE.th })));
  expect(fake.availability).toHaveBeenCalledTimes(reads + 1);
  expect(named('switch', say('lock.switch', 'th', { method: FACE.th })).getAttribute('aria-checked')).toBe('true');
  expect(view.stored.get(STORED)).toBe('1');
  expect(screen.queryByTestId('lock-turned-off')).toBeNull();
});
```

**m3. Turning the lock on is not stored fail-closed.** The read is fail-closed on purpose (P5: "a broken store never opens the app"), but the write is fire-and-forget (`LockGate.tsx:279-281`). Probe 8: a store whose `setItem` throws; a passing scan turns the switch on (`aria-checked` true), nothing is kept, and the next launch opens with no cover, no lock screen and no word. Rare (a full or broken store), but the person believes the app is locked. Fix: when turning on, await the write, and if it fails keep the lock off and say so (or keep it on for the session and say it will not last); one case.

**m4. While locked, the app below can still speak on iOS.** The app stays mounted and live under the cover (drafts and sync carry on), and iOS announcements are global: `AccessibilityInfo.announceForAccessibility` ignores the wrapper's `accessibilityElementsHidden`. Probe 2: locked, a part below changes its `useAnnouncement` text, and iOS is told "Saving 2 entries…" while the lock screen is up. The paths that can fire without input are status lines: Home's sync banner (`HomeScreen.tsx:413`, `SyncBanner.tsx:77`), Record's message (`RecordScreen.tsx:279`), the conflict heading (`ChoicePanel.tsx:43`), staged progress and the receipt's working label. I found no amount, name or note among them, so the leak is activity (counts, offline, a conflict), beyond the lock's own notes. Fix outside this task's files: `useAnnouncement` and `announcePolitely` stay quiet while the cover is hidden (a flag the gate sets, or `useLockCover()` in the hook). Android's live regions under `no-hide-descendants` should already be quiet (a device check).

**m5. The hidden screen keeps keyboard focus (a device check).** Becoming locked moves no focus (P5), which is right for screen readers, but nothing blurs a focused input either. Probe 4 (web): an input focused before the lock stays `document.activeElement` under the cover, and Enter there ran its `onSubmitEditing` once. Probe 6: a control under the cover keeps `tabindex="0"` and takes focus. On a phone: iOS brings the keyboard back with the app, over the lock screen's foot, where the unlock button and the passcode link sit, and typing reaches the hidden screen (Ask Bun's return asks, `AskBunScreen.tsx:125`); Android's hardware-keyboard focus ignores `importantForAccessibility`. Saving needs a press the cover blocks, so the reach is drafts and Ask Bun. Suggested: `Keyboard.dismiss()` when the lock engages (a `background` with the lock on), and add the keyboard to P19's device checks.

**m6. Native sheets the app presents stay above the cover (owner Q1's class).** A JavaScript cover cannot reach system UI the app has presented: the data export's share sheet carries the whole diary as CSV text (`privacyServices.ts:49-51`, `Share.share({ title, message: csv })`), the recap's share text (`RecapScreen.tsx:91`), and the photo and document pickers (`TellBunSheet.tsx:51`, `ReceiptParts.tsx:111`, `ImportDeviceParts.tsx:60`). With the lock on, someone who opens Jotbun over an export share sheet left open can copy or send the diary without unlocking. Not this task's code; record it with Q1's risk for the owner and the device checks (P19).

### Nit

**n1. The gate trusts the port's types.** Both need an adapter bug, and P2-T34's mapping should prevent them; both are one-line hardening.
- `afterAnswer` has no default (`lockModel.ts:73-85`), and `unlock` and `change` clear `asking` without a `finally` (`LockGate.tsx:234-252`, `260-282`). Probe 3: an answer outside `AuthResult` throws `TypeError: Cannot read properties of undefined (reading 'step')` after `asking` is set, so no press ever asks again until the app restarts (fails closed).
- `afterRecheck` counts any falsy `canLock` as "cannot lock" (`lockModel.ts:94`). Probe 7: an `availability()` answer with no `canLock`, after an `unavailable` prompt, turns the lock off and unlocks. `phone.canLock === false` would keep a malformed answer locked.

## What holds (the controller's five questions)

1. **No app content before an unlock.**
   - The launch: until the setting is read the gate says `hidden` and draws the opaque cover over the app (`LockGate.tsx:297`, `315-316`), and an unreadable setting counts as on (`:174`). Before that the root draws only a spinner (`app/_layout.tsx:38`). The read's two state updates batch into one render (React 19.3, React Native 0.88, new architecture only), so no frame has the setting read and the lock not yet set. The planner's G2 and G3 are killed.
   - A return from the background locks with no grace time (F1 killed); `inactive` only covers (Q1's race excepted).
   - Trays and sheets draw the cover and, while locked, the lock screen (the case and H1 killed; probe 1's control).
   - A deep link: `WalletRoot` wraps the whole `Stack` (`app/_layout.tsx:45-50`), and no route is presented natively, so every route renders under the cover. The gate's wrapper and its cover are siblings in one parent, so a child's `zIndex` or `elevation` cannot rise above the cover.
   - The exception is M1 (and m6's native sheets).
2. **Turning the lock off.** `LockSettingsRow` only opens `/settings/lock`. `change(false)` asks the phone first (A1 killed), and only `success` changes the setting (correct today; m2 pins it). The automatic turn-off comes only from `afterRecheck` of a fresh read that says the phone cannot lock: a prompt that throws counts as `failed` and a read that throws as still able (G19 and G20 killed); an answer to an earlier opening is dropped (`:243`); one in-flight guard serves the unlock and the switch. Turning the lock off on such a phone needs its passcode removed, which itself needs the passcode, so R67's turn-off is no bypass.
3. **Screen readers.** The app below gets `accessibilityElementsHidden`, `no-hide-descendants` and `aria-hidden` (G21 killed). The locked screen speaks no amount. The setup preview is `DECORATIVE` and inside its own `PrivateModeProvider` over a store that says private mode is on, so it shows `฿••••` (S11 killed); its `balanceMinor` is a sample `'0'` in any case. The exception is m4.
4. **Storage and logs.**
   - The setting and `lock-answered` are `jotbun.wallet.lock` and `jotbun.wallet.lock-answered` in the wallet's device store (AsyncStorage), `'1'` or absent. They hold no user data, and the sign-out erase removes them with the diary (`DeviceDiaryProvider.tsx:67-72`). Unencrypted storage suits the threat model (a phone handed to someone): anyone who can read the app's files can read the diary itself.
   - No lock file logs, tracks or reports anything.
   - The lock announces only `lock.tryAgain`, `lock.lockout` and `lock.turnedOff`.
5. **Android's back.** The gate adds its `hardwareBackPress` listener when it hides, and React Native runs back listeners last-added first. React Navigation's listener is added when the navigation container mounts, before the root (which waits for fonts and the language) mounts the gate, so the gate's `true` comes first and nothing pops (G25 killed). Trays and sheets also ignore their own back under the cover. The receipt viewer's back closes it, which only uncovers the lock screen.

## Mutants and probes

- The planner's, sampled (9 of 121, `planner-mutants.out`): F1, G1, G2, G3, G19, G20, G21, H1, S11, all KILLED by the cases the receipt names, restored by SHA-256.
- Mine (`own-mutants.out`, then `own-mutants-cases.out` against the ready cases): A1 KILLED; A2 and A3 SURVIVED (m2), KILLED by the ready cases; A4 KILLED.
- Probes, all in `copy/apps/app/src/wallet/lock/Probe.render.test.tsx` (log `probes-all.log` and `probe-8.log`): 1 (M1), the Sheet control, 2 (m4), 3 and 7 (n1), 4 and 6 (m5), 5 (m1), 8 (m3).
- The focused files in the scratch copy: `Lock.render.test.tsx` and `Sheet.render.test.tsx`, 39 of 39 (`focused-render.log`). No whole suite rerun (R100).

## Notes for later tasks

- **P2-T34:**
  - On Android, the device-credential fallback can open a separate activity (androidx.biometric before API 30), and React Native's AppState then reports `background`. The gate would count that as a new opening, drop the passing answer and ask again: a loop. Check it on a device, and if it happens, treat a `background` that starts while a prompt is up as part of that prompt.
  - Map every error code to an `AuthResult` and keep `canLock` a boolean (n1).
- **P6A (widgets):** the gate's reader of `LOCK_NAME` is inline (`LockGate.tsx:170-184`). The widget's lock face needs an exported reader with the same rule (unreadable counts as on), and to follow `useLockSetting().enabled` for "right after the lock is turned on over a mounted Home" (P6A plan lines 17, 65, 223).
- **P6B (beta extras):** the plan has `LockSettingsRow.tsx` export `useLockSetting(): { on: boolean; method: LockMethod | null }` (P6B plan lines 222 and 229). This task already exports a `useLockSetting()` of another shape from `LockGate.tsx` (ruling P4b). P6B's planner should reuse it (`enabled`, `namedMethod(availability)`) or pick another name.
- **1C-T9 and P6B-T8:** m1, the email code step under the cover.
- **P3 (photos):** `WalletReceiptViewer` plans the cover (plan line 935); until the photos area is on, `RecordReceipt`'s viewer is the live one (M1).
- **The rollout (P2-T38):** the `wallet` area is a one-way switch for the lock. A build with the area off, after people turned the lock on, opens without it and leaves the stored `'1'` alone (by plan; a case pins it).
- **Sign-out:** the erase removes the setting with the diary, but the gate keeps the lock on in memory until the next cold start, so a signed-out app still locks at each return. It fails closed; noted only.

## Compared with the first review (read after this review was written)

- **Same finding:** its m1 (Android's activity-based prompt loses its answer and asks again) is my P2-T34 note; its n4 (`asking` stuck on an answer outside `AuthResult`) is the first half of my n1.
- **Seen here, not listed:** its m3 (back in front before an earlier prompt answers, the new opening never asks by itself). I traced the same path and agree: it fails closed, a UX gap only. I did not check its m2, m4, n1 to n3, n5 or n6, and have nothing against them.
- **Not in the first review:** M1 (the receipt photo over the lock), which is why this verdict differs; m1 to m6; and n1's second half (`canLock` not a boolean).
