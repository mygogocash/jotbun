#!/usr/bin/env python3
"""P2-T33 fix round's mutation check (R107).

Usage: python3 -I mutants.py <worktree root> <log dir> [--pins] [ids...]

Without --pins it runs MUTANTS on the round's final code: the first round's
121, re-aimed where the fix round moved their text, and the round's own 45.
With --pins it runs PINS on 5844e4c1's code with the round's tests (the RED
copy): the review survivors that the round's pins now kill, the code being
right already (the first review's M1, M2, M4, M6 and M7, the second's A2 and
A3, and G21 for n5's assertion made real).

Each mutant is applied alone, its tests run (the Node files lockModel.test.ts,
draftText.test.ts and lockCover.test.ts for the model, the copy, the root's
order and the Modal sweep; Lock.render.test.tsx for the gate, the screens, the
row, Settings, the cover, the sections, the port, the receipt photo, the quiet
helpers and the sync status; LockRoute.render.test.tsx for the route;
Sheet.render.test.tsx with the lock's render file for the Sheet), the file is
restored byte for byte (sha256 checked) and one line is printed per mutant.
RENDER_T, when set, is passed to vitest as -t (a test-name pattern), so a run
can leave out cases that fail anyway. Exits 0 only when every mutant ends as
expected.
"""
import hashlib
import os
import re
import subprocess
import sys

MODEL = 'apps/app/src/wallet/lock/lockModel.ts'
PORT = 'apps/app/src/wallet/lock/localAuthPort.ts'
COPY = 'apps/app/src/wallet/lock/copy.ts'
GATE = 'apps/app/src/wallet/lock/LockGate.tsx'
LOCKED = 'apps/app/src/wallet/lock/LockedScreen.tsx'
VIEW = 'apps/app/src/wallet/lock/LockSetupView.tsx'
SETUP = 'apps/app/src/wallet/lock/LockSetupScreen.tsx'
ROW = 'apps/app/src/wallet/lock/LockSettingsRow.tsx'
SECTIONS = 'apps/app/src/dev/catalogue/wallet/lockSections.tsx'
INDEX = 'apps/app/src/dev/catalogue/wallet/index.ts'
COVER = 'apps/app/src/ui/lockCover.tsx'
SHEET = 'apps/app/src/ui/Sheet.tsx'
ROOT = 'apps/app/src/wallet/WalletRoot.tsx'
SETTINGS = 'apps/app/src/screens/redesign/account/SettingsScreen.tsx'
DRAFT = 'apps/app/src/wallet/copy/draftText.test.ts'
RECEIPT = 'apps/app/src/screens/redesign/import/ReceiptParts.tsx'
A11Y = 'apps/app/src/ui/a11y.ts'
ANNOUNCE = 'apps/app/src/sync/announce.ts'
ROUTE = 'apps/app/app/settings/lock.tsx'
DATECHIP = 'apps/app/src/ui/DateChip.tsx'

NODE = ['npm', 'run', 'test:unit', '--', 'src/wallet/lock/lockModel.test.ts', 'src/wallet/copy/draftText.test.ts', 'src/ui/lockCover.test.ts']
LOCK = ['npx', 'vitest', 'run', '--config', 'vitest.render.config.ts', '--reporter=verbose', 'src/wallet/lock/Lock.render.test.tsx']
ROUTES = ['npx', 'vitest', 'run', '--config', 'vitest.render.config.ts', '--reporter=verbose', 'src/wallet/lock/LockRoute.render.test.tsx']
SHEETS = ['npx', 'vitest', 'run', '--config', 'vitest.render.config.ts', '--reporter=verbose', 'src/ui/Sheet.render.test.tsx', 'src/wallet/lock/Lock.render.test.tsx']

ON_BRANCH = ("          <LockGate port={getAppLocalAuth()}>\n"
             "            <PrivateModeProvider>{children}</PrivateModeProvider>\n"
             "          </LockGate>\n")
COVER_ART = ("      <View {...DECORATIVE} testID=\"lock-cover\" style={{ ...FILL, backgroundColor: colors.ground }} />\n"
             "      {screen ? <View style={FILL}>{screen}</View> : null}\n")

# (id, expectation, description, file, tests, [(old, new), ...]); each old must occur exactly once.
MUTANTS = [
    # lockModel.ts: the Node file
    ('F1', 'killed', "background gets a grace time: it covers but does not lock (the plan's mutant)", MODEL, NODE, [("    case 'background':\n      return enabled ? { locked: true, covered: true } : view;", "    case 'background':\n      return enabled ? { locked: view.locked, covered: true } : view;")]),
    ('F2', 'killed', 'a cold start does not lock', MODEL, NODE, [("      return enabled ? { locked: true, covered: view.covered } : view;", "      return enabled ? { locked: false, covered: view.covered } : view;")]),
    ('F3', 'killed', 'a cold start drops a cover the app has', MODEL, NODE, [("      return enabled ? { locked: true, covered: view.covered } : view;", "      return enabled ? { locked: true, covered: false } : view;")]),
    ('F4', 'killed', 'inactive locks too (the prompt would loop)', MODEL, NODE, [("      return enabled ? { locked: view.locked, covered: true } : view;", "      return enabled ? { locked: true, covered: true } : view;")]),
    ('F5', 'killed', 'inactive does not cover', MODEL, NODE, [("      return enabled ? { locked: view.locked, covered: true } : view;", "      return enabled ? { locked: view.locked, covered: false } : view;")]),
    ('F6', 'killed', 'active unlocks', MODEL, NODE, [("      return { locked: view.locked, covered: false };", "      return { locked: false, covered: false };")]),
    ('F7', 'killed', 'active keeps the cover', MODEL, NODE, [("      return { locked: view.locked, covered: false };", "      return { locked: view.locked, covered: view.covered };")]),
    ('F8', 'killed', 'unlocked drops the cover while the app is away', MODEL, NODE, [("      return { locked: false, covered: view.covered };", "      return { locked: false, covered: false };")]),
    ('F9', 'killed', 'unlocked does not unlock', MODEL, NODE, [("      return { locked: false, covered: view.covered };", "      return view;")]),
    ('F10', 'killed', 'disabled keeps the lock', MODEL, NODE, [("    case 'disabled':\n      return UNLOCKED;", "    case 'disabled':\n      return view;")]),
    ('F11', 'killed', 'with the lock off a cold start locks', MODEL, NODE, [("      return enabled ? { locked: true, covered: view.covered } : view;", "      return { locked: true, covered: view.covered };")]),
    ('F12', 'killed', 'with the lock off the background covers and locks', MODEL, NODE, [("      return enabled ? { locked: true, covered: true } : view;", "      return { locked: true, covered: true };")]),
    ('F13', 'killed', 'with the lock off inactive covers', MODEL, NODE, [("      return enabled ? { locked: view.locked, covered: true } : view;", "      return { locked: view.locked, covered: true };")]),
    ('F14', 'killed', "AppState's unknown counts as in front", MODEL, NODE, [("  return null;\n}\n\n/** What the locked screen says", "  return { type: 'active' };\n}\n\n/** What the locked screen says")]),
    ('F15', 'killed', "AppState's inactive says nothing", MODEL, NODE, [("status === 'active' || status === 'inactive' || status === 'background'", "status === 'active' || status === 'background'")]),
    ('F16', 'killed', 'a cancel unlocks', MODEL, NODE, [("    case 'cancelled':\n    case 'failed':\n      return { step: 'stay', note: 'lock.tryAgain' };", "    case 'cancelled':\n      return { step: 'unlock' };\n    case 'failed':\n      return { step: 'stay', note: 'lock.tryAgain' };")]),
    ('F17', 'killed', 'a failure says lockout', MODEL, NODE, [("    case 'cancelled':\n    case 'failed':\n      return { step: 'stay', note: 'lock.tryAgain' };", "    case 'cancelled':\n      return { step: 'stay', note: 'lock.tryAgain' };\n    case 'failed':\n      return { step: 'stay', note: 'lock.lockout' };")]),
    ('F18', 'killed', 'a lockout says try again', MODEL, NODE, [("      return { step: 'stay', note: 'lock.lockout' };", "      return { step: 'stay', note: 'lock.tryAgain' };")]),
    ('F19', 'killed', 'unavailable stays without reading the phone again', MODEL, NODE, [("      return { step: 'recheck' };", "      return { step: 'stay', note: 'lock.tryAgain' };")]),
    ('F20', 'killed', 'a phone that could not be read turns the lock off', MODEL, NODE, [("phone !== null && phone.canLock === false ? { step: 'turnOff' }", "phone === null || phone.canLock === false ? { step: 'turnOff' }")]),
    ('F21', 'killed', 'a phone that cannot lock stays locked', MODEL, NODE, [("phone !== null && phone.canLock === false ? { step: 'turnOff' }", "phone !== null && phone.canLock === false ? { step: 'stay', note: 'lock.tryAgain' }")]),
    ('F22', 'killed', "a phone that has not said is named by Face ID", MODEL, NODE, [("return phone?.method ?? 'passcode';", "return phone?.method ?? 'face';")]),
    ('F23', 'killed', "a fingerprint phone's body says to scan a face", MODEL, NODE, [("body: 'lock.bodyFingerprint'", "body: 'lock.body'")]),
    ('F24', 'killed', 'the switch does not wait for the phone', MODEL, NODE, [("disabled: !enabled && (phone === null || cannot)", "disabled: !enabled && cannot")]),
    ('F25', 'killed', 'a lock that is on cannot be turned off on a phone that cannot lock', MODEL, NODE, [("disabled: !enabled && (phone === null || cannot)", "disabled: phone === null || cannot")]),
    ('F26', 'killed', 'the passcode line shows while the lock is on', MODEL, NODE, [("needsPasscode: !enabled && cannot", "needsPasscode: cannot")]),
    # WalletRoot.tsx: the Node file reads its order
    ('R1', 'killed', "the lock inside private mode (the plan's mutant)", ROOT, NODE, [(ON_BRANCH, "          <PrivateModeProvider>\n            <LockGate port={getAppLocalAuth()}>{children}</LockGate>\n          </PrivateModeProvider>\n")]),
    ('R2', 'killed', "the motion answer outside the gesture root (P2-T10's R9)", ROOT, NODE, [("    <GestureHandlerRootView style={{ flex: 1 }}>\n      <WalletMotionProvider>\n", "    <WalletMotionProvider>\n      <GestureHandlerRootView style={{ flex: 1 }}>\n"), ("      </WalletMotionProvider>\n    </GestureHandlerRootView>\n", "      </GestureHandlerRootView>\n    </WalletMotionProvider>\n")]),
    ('R3', 'killed', 'the lock in every build, behind an approved area', ROOT, NODE, [("isRedesignEnabled('wallet')", "isRedesignEnabled('companion')")]),
    # LockGate.tsx
    ('G1', 'killed', "the first unavailable turns the lock off, with no second read (the plan's mutant)", GATE, LOCK, [("const then = answer.step === 'recheck' ? afterRecheck(await readPhone()) : answer;", "const then = answer.step === 'recheck' ? ({ step: 'turnOff' } as const) : answer;")]),
    ('G2', 'killed', 'the app shows before the setting is read', GATE, LOCK, [("const hidden = !setting.ready || view.locked || view.covered;", "const hidden = view.locked || view.covered;")]),
    ('G3', 'killed', 'a setting that cannot be read counts as off', GATE, LOCK, [("() => ({ on: true, read: false })", "() => ({ on: false, read: false })")]),
    ('G4', 'killed', 'becoming locked asks nothing by itself', GATE, LOCK, [("    void unlock();\n  }, [view.locked, front, settled, busy, unlock]);", "  }, [view.locked, front, settled, busy, unlock]);")]),
    ('G5', 'killed', 'the gate asks while the app is not in front', GATE, LOCK, [("if (!view.locked || !front || !settled || asked.current === opening.current) return;", "if (!view.locked || !settled || asked.current === opening.current) return;")]),
    ('G6', 'killed', 'the gate asks again each time the app is back in front (the prompt loops)', GATE, LOCK, [("if (!view.locked || !front || !settled || asked.current === opening.current) return;", "if (!view.locked || !front || !settled) return;")]),
    ('G7', 'killed', "the prompt's own inactive starts a new opening", GATE, LOCK, [("if (on && (event.type === 'start' || event.type === 'background')) {", "if (on && (event.type === 'start' || event.type === 'background' || event.type === 'inactive')) {")]),
    ('G8', 'killed', 'a return from the background is not a new opening', GATE, LOCK, [("if (on && (event.type === 'start' || event.type === 'background')) {", "if (on && event.type === 'start') {")]),
    ('G9', 'killed', 'an answer to an earlier opening applies', GATE, LOCK, [("      if (at !== opening.current) return;\n", "")]),
    ('G10', 'killed', 'a new opening keeps the last note', GATE, LOCK, [("      opening.current += 1;\n      setNote(null);\n", "      opening.current += 1;\n")]),
    ('G11', 'killed', 'a cancel says nothing', GATE, LOCK, [("        setNote(then.note);\n", "")]),
    ('G12', 'killed', 'iOS hears no note', GATE, LOCK, [("        announceOverLockCover(t(then.note));\n", "")]),
    ('G13', 'killed', 'the lock turned off keeps its setting', GATE, LOCK, [("    void walletDeviceStore().remove(LOCK_NAME).catch(() => undefined);\n", "")]),
    ('G14', 'killed', 'the lock turned off says nothing', GATE, LOCK, [("    setNotice('lock.turnedOff');\n", "")]),
    ('G15', 'killed', 'the lock turned off does not unlock', GATE, LOCK, [("    dispatch({ type: 'disabled' });\n", "")]),
    ('G16', 'killed', 'iOS does not hear that the lock turned off', GATE, LOCK, [("    announceOverLockCover(t('lock.turnedOff'));\n", "")]),
    ('G17', 'killed', 'the notice cannot be closed', GATE, LOCK, [("onClose={() => setNotice(null)}", "onClose={() => undefined}")]),
    ('G18', 'killed', 'the notice is not a polite status', GATE, LOCK, [("      testID={testID}\n      {...POLITE_LIVE_REGION}\n", "      testID={testID}\n")]),
    ('G19', 'killed', 'a prompt that throws unlocks', GATE, LOCK, [("    } catch {\n      return 'failed';\n    }", "    } catch {\n      return 'success';\n    }")]),
    ('G20', 'killed', 'a phone that cannot be read counts as one that cannot lock', GATE, LOCK, [("    } catch {\n      return null;\n    }", "    } catch {\n      return { canLock: false, method: null };\n    }")]),
    ('G21', 'killed', 'the app below stays readable under the cover', GATE, LOCK, [("{...(hidden ? UNSEEN : SEEN)}", "{...SEEN}")]),
    ('G22', 'killed', 'only a locked app is covered at the root', GATE, LOCK, [("        {hidden ? <LockCoverArt /> : null}\n", "        {view.locked ? <LockCoverArt /> : null}\n")]),
    ('G23', 'killed', 'the cover carries no lock screen', GATE, LOCK, [("() => ({ hidden, screen }), [hidden, screen]", "() => ({ hidden }), [hidden]")]),
    ('G24', 'killed', 'the lock screen shows while the app is only covered', GATE, LOCK, [("(view.locked ? <LockedScreen", "(hidden ? <LockedScreen")]),
    ('G25', 'killed', "Android's back reaches the app under the lock", GATE, LOCK, [("BackHandler.addEventListener('hardwareBackPress', () => true)", "BackHandler.addEventListener('hardwareBackPress', () => false)")]),
    ('G26', 'killed', "Android's back is held after the lock lifts", GATE, LOCK, [("if (!hidden || Platform.OS !== 'android') return undefined;", "if (Platform.OS !== 'android') return undefined;")]),
    ('G27', 'killed', 'back in front, the phone is not read again', GATE, LOCK, [("      if (event.type === 'active') void readPhone();\n", "")]),
    ('G28', 'killed', 'the phone is not read when the gate opens', GATE, LOCK, [("    void readPhone().then(() => {\n", "    void Promise.resolve().then(() => {\n")]),
    ('G29', 'killed', 'the gate turns the lock on for a phone that has not said it can lock', GATE, LOCK, [("    if (on && known.current?.canLock !== true) return;\n", "")]),
    ('G30', 'killed', 'the switch turns the lock on with no prompt', GATE, LOCK, [("const result = await prompt(t('lock.switch', { method: t(METHOD_KEYS[namedMethod(known.current)].name) }));", "const result: AuthResult = 'success';")]),
    ('G31', 'killed', 'the switch keeps no setting', GATE, LOCK, [("        const stored = await store.set(LOCK_NAME, '1').then(() => true, () => false);\n", "        const stored = true;\n")]),
    ('G32', 'killed', 'the switch keeps no answer', GATE, LOCK, [("      void store.set(LOCK_ANSWERED_NAME, '1').catch(() => undefined);\n", "")]),
    ('G33', 'killed', 'the switch asks again while its prompt is up', GATE, LOCK, [("if (asking.current || on === enabled.current) return;", "if (on === enabled.current) return;")]),
    ('G34', 'killed', 'the locked screen asks again while a prompt is up', GATE, LOCK, [("  const unlock = useCallback(async () => {\n    if (asking.current) return;\n", "  const unlock = useCallback(async () => {\n")]),
    ('G35', 'killed', 'turning the lock on, a phone that can no longer lock says the lock turned off', GATE, LOCK, [(".step === 'turnOff' && enabled.current;", ".step === 'turnOff';")]),
    ('G36', 'killed', 'turning the lock off, a phone that can no longer lock leaves it on', GATE, LOCK, [("      if (gone) {\n        turnOff();\n        return;\n      }\n", "      if (gone) return;\n")]),
    ('G37', 'killed', "the prompt's fallback is not the passcode", GATE, LOCK, [("fallback: t('lock.usePasscode')", "fallback: cancel")]),
    ('G38', 'killed', "the unlock prompt does not say the method's line", GATE, LOCK, [("await prompt(t(METHOD_KEYS[namedMethod(known.current)].line))", "await prompt(t('lock.lockedTitle'))")]),
    ('G39', 'killed', "the prompt's cancel is not today's Cancel", GATE, LOCK, [("translateCopy('Cancel', locale)", "translateCopy('Close', locale)")]),
    ('G40', 'killed', 'the switch never says it is busy', GATE, LOCK, [("    asking.current = true;\n    setBusy(true);\n    setNotice(null);\n", "    asking.current = true;\n    setNotice(null);\n")]),
    # LockedScreen.tsx
    ('L1', 'killed', 'a fingerprint phone has no passcode link', LOCKED, LOCK, [("{method === 'passcode' ? null : <TextLink", "{method !== 'face' ? null : <TextLink")]),
    ('L2', 'killed', 'a passcode phone has a passcode link too', LOCKED, LOCK, [("{method === 'passcode' ? null : <TextLink", "{false ? null : <TextLink")]),
    ('L3', 'killed', 'the note is not a polite status', LOCKED, LOCK, [('<View testID="lock-note" {...POLITE_LIVE_REGION} style', '<View testID="lock-note" style')]),
    ('L4', 'killed', 'the title is not a heading', LOCKED, LOCK, [('<WalletText role="h1" accessibilityRole="header" style={{ marginTop: 10', '<WalletText role="h1" style={{ marginTop: 10')]),
    ('L5', 'killed', "the line is Face ID's for every method", LOCKED, LOCK, [("{t(keys.line)}", "{t('lock.lineFace')}")]),
    ('L6', 'killed', 'the main button names Face ID for every method', LOCKED, LOCK, [("t('lock.unlock', { method: t(keys.name) })", "t('lock.unlock', { method: 'Face ID' })")]),
    ('L7', 'killed', 'the passcode link opens nothing', LOCKED, LOCK, [("label={t('lock.usePasscode')} onPress={onUnlock}", "label={t('lock.usePasscode')} onPress={() => undefined}")]),
    ('L8', 'killed', 'the locked screen on the card colour', LOCKED, LOCK, [("<View testID=\"locked-screen\" style={{ flex: 1, backgroundColor: colors.ground }}>", "<View testID=\"locked-screen\" style={{ flex: 1, backgroundColor: colors.card }}>")]),
    ('L9', 'killed', 'the passcode link in violet', LOCKED, LOCK, [('<TextLink tone="ink"', '<TextLink tone="violet"')]),
    # LockSetupView.tsx and LockSetupScreen.tsx
    ('S1', 'killed', 'the switch asks nothing', VIEW, LOCK, [("onPress={() => void lock.change(!lock.enabled)}", "onPress={() => undefined}")]),
    ('S2', 'killed', 'the switch only ever turns the lock on', VIEW, LOCK, [("onPress={() => void lock.change(!lock.enabled)}", "onPress={() => void lock.change(true)}")]),
    ('S3', 'killed', 'the switch is never disabled', VIEW, LOCK, [("disabled={toggle.disabled || lock.busy}", "disabled={lock.busy}")]),
    ('S4', 'killed', 'nothing says why the lock cannot go on', VIEW, LOCK, [("{toggle.needsPasscode ? <WalletText role=\"label\">{t('lock.needsPasscode')}</WalletText> : null}", "{null}")]),
    ('S5', 'killed', 'a passcode phone gets the fallback line', VIEW, LOCK, [("const line = method === 'passcode' ? null : t('lock.fallbackLine');", "const line = t('lock.fallbackLine');")]),
    ('S6', 'killed', "the body is Face ID's for every method", VIEW, LOCK, [("{t(keys.body)}", "{t('lock.body')}")]),
    ('S7', 'killed', 'the step line shows from Settings too', VIEW, LOCK, [("{setup ? <WalletText role=\"label\" tone=\"violet\">", "{true ? <WalletText role=\"label\" tone=\"violet\">")]),
    ('S8', 'killed', 'Next shows from Settings too', VIEW, LOCK, [("      {setup ? (\n        <Pressable", "      {true ? (\n        <Pressable")]),
    ('S9', 'killed', 'Next keeps no answer', VIEW, LOCK, [("    lock.answer();\n    onNext();\n", "    onNext();\n")]),
    ('S10', 'killed', 'Next goes nowhere', VIEW, LOCK, [("    lock.answer();\n    onNext();\n", "    lock.answer();\n")]),
    ('S11', 'killed', 'the preview card shows its amount', VIEW, LOCK, [("get: async (name) => (name === PRIVATE_MODE_NAME ? '1' : null),", "get: async () => null,")]),
    ('S12', 'killed', 'screen readers stop on the preview', VIEW, LOCK, [('<View {...DECORATIVE} testID="lock-preview"', '<View testID="lock-preview"')]),
    ('S13', 'killed', 'the switch track is ink when off', VIEW, LOCK, [("backgroundColor: on ? colors.primary : colors.quiet", "backgroundColor: colors.primary")]),
    ('S14', 'killed', 'back goes nowhere', VIEW, LOCK, [("<IconButton label={t('common.back')} onPress={onBack}>", "<IconButton label={t('common.back')} onPress={() => undefined}>")]),
    ('S15', 'killed', "the question names Face ID for every method", VIEW, LOCK, [("t('lock.question', { method: name })", "t('lock.question', { method: 'Face ID' })")]),
    ('S16', 'killed', 'the switch names Face ID for every method', VIEW, LOCK, [("const label = t('lock.switch', { method: name });", "const label = t('lock.switch', { method: 'Face ID' });")]),
    ('S17', 'killed', 'the screen does not read the phone when it opens', VIEW, LOCK, [("  useEffect(() => {\n    recheck();\n  }, [recheck]);\n", "")]),
    ('S18', 'killed', 'the step line in ink', VIEW, LOCK, [("<WalletText role=\"label\" tone=\"violet\">{t('lock.step')}", "<WalletText role=\"label\">{t('lock.step')}")]),
    ('S19', 'killed', 'the switch row on the ground colour', VIEW, LOCK, [("            borderRadius: 18,\n            backgroundColor: colors.card,", "            borderRadius: 18,\n            backgroundColor: colors.ground,")]),
    ('N1', 'killed', 'the setup step opened on its own goes back to Settings', SETUP, LOCK, [("const fallback: Href = setup ? '/spend' : '/settings';", "const fallback: Href = '/settings';")]),
    ('N2', 'killed', 'back always replaces the screen', SETUP, LOCK, [("    if (router.canGoBack()) router.back();\n    else router.replace(fallback);\n", "    router.replace(fallback);\n")]),
    # LockSettingsRow.tsx and SettingsScreen.tsx
    ('W1', 'killed', 'the row shows without the wallet area', ROW, LOCK, [("  if (!isRedesignEnabled('wallet')) return null;\n", "")]),
    ('W2', 'killed', 'the row always says off', ROW, LOCK, [("t(lock.enabled ? 'lock.on' : 'lock.off')", "t('lock.off')")]),
    ('W3', 'killed', 'the row opens Settings', ROW, LOCK, [("router.push('/settings/lock')", "router.push('/settings')")]),
    ('W4', 'killed', "the row's heading names Face ID whatever the phone", ROW, LOCK, [("const method = t(METHOD_KEYS[namedMethod(lock.availability)].name);", "const method = 'Face ID ';")]),
    ('E1', 'killed', 'the lock row before Haptics', SETTINGS, LOCK, [("          <HapticsChoice />\n          <LockSettingsRow />\n", "          <LockSettingsRow />\n          <HapticsChoice />\n")]),
    ('E2', 'killed', 'Settings draws no lock row', SETTINGS, LOCK, [("          <LockSettingsRow />\n", "")]),
    # Sheet.tsx
    ('H1', 'killed', "the sheet ignores the cover (the plan's mutant)", SHEET, SHEETS, [("  const { hidden } = useLockCover();\n", "  const hidden = false;\n")]),
    ('H2', 'killed', "Android's back closes a covered sheet", SHEET, SHEETS, [("    if (!hidden) onClose();\n", "    onClose();\n")]),
    ('H3', 'killed', 'a covered sheet is still named', SHEET, SHEETS, [("{ 'aria-label': hidden ? undefined : title }", "{ 'aria-label': title }")]),
    ('H4', 'killed', "the sheet's backdrop is a tab stop", SHEET, SHEETS, [("            focusable={false}\n            tabIndex={-1}\n", "            focusable={false}\n")]),
    # lockCover.tsx
    ('C1', 'killed', 'the cover draws no lock screen', COVER, LOCK, [("      {screen ? <View style={FILL}>{screen}</View> : null}\n", "")]),
    ('C2', 'killed', "the lock screen inside the cover's art, out of screen readers' reach", COVER, LOCK, [(COVER_ART, "      <View {...DECORATIVE} testID=\"lock-cover\" style={{ ...FILL, backgroundColor: colors.ground }}>\n        {screen ? <View style={FILL}>{screen}</View> : null}\n      </View>\n")]),
    # lockSections.tsx and index.ts
    ('K1', 'killed', "the lock's sections not in the wallet list", INDEX, LOCK, [("  ...WALLET_LOCK_SECTIONS,\n", "")]),
    # Anchored on the list's opening line, not on the spread before the lock's: P2-T14's spread may be there.
    ('K2', 'killed', "the lock's sections before the tray's", INDEX, LOCK, [("  ...WALLET_LOCK_SECTIONS,\n", ""), ("readonly CatalogueSection[] = [\n", "readonly CatalogueSection[] = [\n  ...WALLET_LOCK_SECTIONS,\n")]),
    ('K3', 'killed', 'the no-passcode section on a phone that can lock', SECTIONS, LOCK, [("<HeldSetting phone={NO_PASSCODE}>", "<HeldSetting phone={FACE}>")]),
    ('K4', 'killed', 'the fingerprint section without its note', SECTIONS, LOCK, [("note={t('lock.tryAgain')}", "note={null}")]),
    ('K5', 'killed', 'the setup section is not the setup step', SECTIONS, LOCK, [("<LockSetupView setup onBack={stay} onNext={stay} />", "<LockSetupView setup={false} onBack={stay} onNext={stay} />")]),
    # localAuthPort.ts
    ('P1', 'killed', "the app's port can lock before P2-T34", PORT, LOCK, [("  availability: async () => ({ canLock: false, method: null }),\n", "  availability: async () => ({ canLock: true, method: 'passcode' }),\n")]),
    # copy.ts and the draft check
    ('T1', 'killed', 'Face ID spelled in Thai letters', COPY, LOCK, [("'lock.methodFace': { th: 'Face ID', en: 'Face ID' }", "'lock.methodFace': { th: 'เฟซไอดี', en: 'Face ID' }")]),
    ('T2', 'killed', "the locked screen's title not the board's", COPY, NODE, [("'lock.lockedTitle': { th: 'Jotbun ล็อกอยู่'", "'lock.lockedTitle': { th: 'Jotbun ถูกล็อก'")]),
    ('T3', 'killed', "the try-again note not the plan's", COPY, NODE, [("'lock.tryAgain': { th: 'ลองอีกครั้ง หรือใช้รหัสผ่าน'", "'lock.tryAgain': { th: 'ลองใหม่อีกครั้ง'")]),
    ('T4', 'killed', 'Face ID loses its exemption from the draft check', DRAFT, NODE, [("LATIN_LINES.add('lock.methodFace');\n", "")]),
    # The fix round (R107). The receipt photo (the second review's M1).
    ('RV1', 'killed', "the receipt photo ignores the cover (the second review's M1)", RECEIPT, LOCK, [("  const { hidden } = useLockCover();\n", "  const hidden = false;\n")]),
    ('RV2', 'killed', "Android's back closes the covered photo", RECEIPT, LOCK, [("    if (!hidden) onClose();\n", "    onClose();\n")]),
    ('RV3', 'killed', "the covered photo's layer is still named", RECEIPT, LOCK, [("{ 'aria-label': hidden ? undefined : title }", "{ 'aria-label': title }")]),
    # The Modal sweep, read from the sources.
    ('MS1', 'killed', 'a new Modal that draws no cover', DATECHIP, NODE, [("import { Sheet } from './Sheet';\n", "import { Sheet } from './Sheet';\n\nexport const Probe = () => <Modal visible />;\n")]),
    ('MS2', 'killed', "a legacy Modal reached from today's screens", DATECHIP, NODE, [("import { Sheet } from './Sheet';\n", "import { Sheet } from './Sheet';\nimport { SpendDatePicker } from '@mobile/components/SpendDatePicker';\n")]),
    # The app below kept quiet on iOS (the second review's m4).
    ('QT1', 'killed', 'the app below speaks under the cover', A11Y, LOCK, [("  if (!quietUnderLockCover) announceOverLockCover(text);\n", "  announceOverLockCover(text);\n")]),
    ('QT2', 'killed', 'the gate never quiets the app below', GATE, LOCK, [("  useLayoutEffect(() => {\n    setQuietUnderLockCover(hidden);\n    return () => setQuietUnderLockCover(false);\n  }, [hidden]);\n", "")]),
    ('QT3', 'killed', "the lock's own notes are quiet under its cover", GATE, LOCK, [("import { announceOverLockCover, POLITE_LIVE_REGION, setQuietUnderLockCover } from '@mobile/ui/a11y';", "import { announceOverLockCover, announcePolitely, POLITE_LIVE_REGION, setQuietUnderLockCover } from '@mobile/ui/a11y';"), ("        announceOverLockCover(t(then.note));\n", "        announcePolitely(t(then.note));\n")]),
    ('QT4', 'killed', 'a gate that goes while its cover is up leaves the app quiet', GATE, LOCK, [("    return () => setQuietUnderLockCover(false);\n", "")]),
    ('QT5', 'killed', 'the sync status speaks past the cover', ANNOUNCE, LOCK, [("import { announcePolitely } from '@mobile/ui/a11y';\n", "import { AccessibilityInfo, Platform } from 'react-native';\n"), ("  announcePolitely(text);\n", "  if (Platform.OS === 'ios' && text) AccessibilityInfo.announceForAccessibility(text);\n")]),
    ('QT6', 'killed', 'the app below is quieted only after its own effects ran', GATE, LOCK, [("  useLayoutEffect(() => {\n    setQuietUnderLockCover(hidden);\n", "  useEffect(() => {\n    setQuietUnderLockCover(hidden);\n")]),
    # The keyboard (the second review's m5).
    ('KB1', 'killed', 'becoming hidden leaves the keyboard up', GATE, LOCK, [("    if (hidden) Keyboard.dismiss();\n", "")]),
    ('KB2', 'killed', 'the keyboard goes only when the app locks, not when it is only covered', GATE, LOCK, [("    if (hidden) Keyboard.dismiss();\n", "    if (view.locked) Keyboard.dismiss();\n")]),
    # The first ask and the openings (the first review's m2 and m3), and unlock's reset (n4).
    ('FP1', 'killed', "the first ask does not wait for the phone (the first review's m2)", GATE, LOCK, [("if (!view.locked || !front || !settled || asked.current === opening.current) return;", "if (!view.locked || !front || asked.current === opening.current) return;")]),
    ('FP2', 'killed', 'a phone that cannot be read holds the first ask for good', GATE, LOCK, [("    void readPhone().then(() => {\n      if (live) setSettled(true);\n", "    void readPhone().then((answer) => {\n      if (live && answer !== null) setSettled(true);\n")]),
    ('AO1', 'killed', "the ask does not look again once a prompt answers (the first review's m3)", GATE, LOCK, [("  }, [view.locked, front, settled, busy, unlock]);", "  }, [view.locked, front, settled, unlock]);")]),
    ('AO2', 'killed', 'an opening counts as asked before its prompt starts', GATE, LOCK, [("    const at = opening.current;\n    asked.current = at;\n", "    const at = opening.current;\n"), ("    void unlock();\n  }, [view.locked, front, settled, busy, unlock]);", "    asked.current = opening.current;\n    void unlock();\n  }, [view.locked, front, settled, busy, unlock]);")]),
    ('FIN1', 'killed', "unlock lets the next ask go only on a normal end (the first review's n4)", GATE, LOCK, [("      }\n    } finally {\n      // However the answer went, the next press, or the next opening, can ask.\n      asking.current = false;\n      setBusy(false);\n    }\n", "      }\n      asking.current = false;\n      setBusy(false);\n    } finally {\n    }\n")]),
    ('FIN2', 'killed', 'the switch lets the next ask go only on a normal end', GATE, LOCK, [("      void store.set(LOCK_ANSWERED_NAME, '1').catch(() => undefined);\n    } finally {\n      asking.current = false;\n      setBusy(false);\n    }\n", "      void store.set(LOCK_ANSWERED_NAME, '1').catch(() => undefined);\n      asking.current = false;\n      setBusy(false);\n    } finally {\n    }\n")]),
    # The port's types (the second review's n1).
    ('N1A', 'killed', "the gate takes the port's answer as it is (the second review's n1)", GATE, LOCK, [("return authResultOf(await port.authenticate({ prompt: words, cancel, fallback: t('lock.usePasscode') }));", "return await port.authenticate({ prompt: words, cancel, fallback: t('lock.usePasscode') });")]),
    ('N1B', 'killed', "the gate takes the port's reading as it is", GATE, LOCK, [("      const answer = availabilityOf(await port.availability());\n      if (answer === null) return null;\n", "      const { canLock, method } = await port.availability();\n      const answer = { canLock, method };\n")]),
    ('AR1', 'killed', 'an answer outside the types passes as it is', MODEL, NODE, [("  return AUTH_RESULTS.find((result) => result === answer) ?? 'failed';\n", "  return answer as AuthResult;\n")]),
    ('AR2', 'killed', 'an answer outside the types counts as a success', MODEL, NODE, [("result === answer) ?? 'failed';", "result === answer) ?? 'success';")]),
    ('AV1', 'killed', 'a reading with no boolean canLock passes', MODEL, NODE, [("  if (typeof canLock !== 'boolean') return null;\n", "")]),
    ('AV2', 'killed', 'a reading with a method outside the types passes', MODEL, NODE, [("  if (method !== null && !LOCK_METHODS.some((known) => known === method)) return null;\n", "")]),
    ('AV3', 'killed', "a method is looked up through the prototype chain ('toString' passes)", MODEL, NODE, [("!LOCK_METHODS.some((known) => known === method)", "!(typeof method === 'string' && method in METHOD_KEYS)")]),
    ('RC1', 'killed', 'any falsy canLock counts as a phone that cannot lock', MODEL, NODE, [("phone !== null && phone.canLock === false ?", "phone !== null && !phone.canLock ?")]),
    # Turning the lock on is stored fail-closed (the second review's m3).
    ('WS1', 'killed', "turning the lock on does not wait for the store (the second review's m3)", GATE, LOCK, [("        const stored = await store.set(LOCK_NAME, '1').then(() => true, () => false);\n", "        void store.set(LOCK_NAME, '1').catch(() => undefined);\n        const stored = true;\n")]),
    ('WS2', 'killed', 'a lock the store could not keep turns on anyway', GATE, LOCK, [("          announceOverLockCover(t('lock.notStored'));\n          return;\n", "          announceOverLockCover(t('lock.notStored'));\n")]),
    ('WS3', 'killed', 'a lock the store could not keep says nothing', GATE, LOCK, [("          setNotice('lock.notStored');\n", "")]),
    ('WS4', 'killed', 'iOS does not hear that the lock could not be kept on', GATE, LOCK, [("          announceOverLockCover(t('lock.notStored'));\n", "")]),
    ('WS5', 'killed', 'a new turn keeps the last notice', GATE, LOCK, [("    setBusy(true);\n    setNotice(null);\n", "    setBusy(true);\n")]),
    ('WS6', 'killed', 'turning the lock off keeps the setting', GATE, LOCK, [("        void store.remove(LOCK_NAME).catch(() => undefined);\n", "")]),
    ('T5', 'killed', "the not-kept line not the brief's", COPY, NODE, [("'lock.notStored': { th: 'เปิดการล็อกไม่สำเร็จ ลองอีกครั้ง'", "'lock.notStored': { th: 'เปิดล็อกไม่ได้'")]),
    # A setting that cannot be read (the first review's n6).
    ('N6A', 'killed', "a lock that was on only because its setting could not be read says it turned off (the first review's n6)", GATE, LOCK, [("    if (assumed.current) return;\n", "")]),
    ('N6B', 'killed', "a setting that could not be read is taken as the person's", GATE, LOCK, [("        assumed.current = !read;\n", "        assumed.current = false;\n")]),
    ('N6C', 'killed', 'a lock the person turns on after an unreadable setting turns off without a word', GATE, LOCK, [("      assumed.current = false;\n", "")]),
    # The review survivors, on the final code (PINS runs them on 5844e4c1's).
    ('TM1', 'killed', "the turned-off notice goes after three seconds (the first review's M1, m4)", GATE, LOCK, [("    setNotice('lock.turnedOff');\n", "    setNotice('lock.turnedOff');\n    setTimeout(() => setNotice(null), 3000);\n")]),
    ('SG1', 'killed', "the switch asks while the lock is already as asked (the first review's M2, n3)", GATE, LOCK, [("if (asking.current || on === enabled.current) return;", "if (asking.current) return;")]),
    ('LB1', 'killed', "an app launched behind counts as in front (the first review's M4, n1)", GATE, LOCK, [("useState(() => AppState.currentState === 'active')", "useState(true)")]),
    ('RT1', 'killed', "the route shows the setup screen without the wallet area (the first review's M6, n2)", ROUTE, ROUTES, [("  if (!isRedesignEnabled('wallet')) return <Redirect href=\"/settings\" />;\n", "")]),
    ('RT2', 'killed', "the route ignores ?setup=1 (the first review's M7, n2)", ROUTE, ROUTES, [("setup={setup === '1'}", "setup={false}")]),
    ('RT3', 'killed', 'any ?setup value is the setup step', ROUTE, ROUTES, [("setup={setup === '1'}", "setup={setup !== undefined}")]),
    ('SW1', 'killed', "a failed scan or a lockout changes the lock (the second review's A2, m2)", GATE, LOCK, [("      if (result !== 'success') return;\n", "      if (result === 'cancelled' || result === 'unavailable') return;\n")]),
    ('SW2', 'killed', "turning the lock off, unavailable ignores the phone's reading (the second review's A3, m2)", GATE, LOCK, [("const gone = result === 'unavailable' && afterRecheck(await readPhone()).step === 'turnOff' && enabled.current;", "const gone = result === 'unavailable' && (await readPhone(), true) && enabled.current;")]),
]

# The review survivors on 5844e4c1's code (the RED copy, with the round's tests): each is killed by its new pin. The
# code is right already, so this is those pins' RED. G21 shows n5's assertion is now real: its first failure is it.
PINS = [
    ('TM1', 'killed', "the turned-off notice goes after three seconds (the first review's M1, m4)", GATE, LOCK, [("    setTurnedOff(true);\n", "    setTurnedOff(true);\n    setTimeout(() => setTurnedOff(false), 3000);\n")]),
    ('SG1', 'killed', "the switch asks while the lock is already as asked (the first review's M2, n3)", GATE, LOCK, [("if (asking.current || on === enabled.current) return;", "if (asking.current) return;")]),
    ('LB1', 'killed', "an app launched behind counts as in front (the first review's M4, n1)", GATE, LOCK, [("useState(() => AppState.currentState === 'active')", "useState(true)")]),
    ('RT1', 'killed', "the route shows the setup screen without the wallet area (the first review's M6, n2)", ROUTE, ROUTES, [("  if (!isRedesignEnabled('wallet')) return <Redirect href=\"/settings\" />;\n", "")]),
    ('RT2', 'killed', "the route ignores ?setup=1 (the first review's M7, n2)", ROUTE, ROUTES, [("setup={setup === '1'}", "setup={false}")]),
    ('RT3', 'killed', 'any ?setup value is the setup step', ROUTE, ROUTES, [("setup={setup === '1'}", "setup={setup !== undefined}")]),
    ('SW1', 'killed', "a failed scan or a lockout changes the lock (the second review's A2, m2)", GATE, LOCK, [("    if (result !== 'success') return;\n", "    if (result === 'cancelled' || result === 'unavailable') return;\n")]),
    ('SW2', 'killed', "turning the lock off, unavailable ignores the phone's reading (the second review's A3, m2)", GATE, LOCK, [("const gone = result === 'unavailable' && afterRecheck(await readPhone()).step === 'turnOff' && enabled.current;", "const gone = result === 'unavailable' && (await readPhone(), true) && enabled.current;")]),
    ('G21', 'killed', 'the app below stays readable under the cover (n5: the real assertion fails first)', GATE, LOCK, [("{...(hidden ? UNSEEN : SEEN)}", "{...SEEN}")]),
]

SUMMARY = re.compile(r'^\s*Tests  (.+?)\s*$', re.M)
FAILED = re.compile(r'^\s*×\s+\S+\s+>\s+(.+?)\s+\d+ms\s*$', re.M)
NODE_FAIL = re.compile(r'^ℹ (tests|pass|fail) (\d+)', re.M)
NODE_FAILED = re.compile(r'^✖ (.+?) \([\d.]+ms\)$', re.M)


def sha(path):
    with open(path, 'rb') as handle:
        return hashlib.sha256(handle.read()).hexdigest()


def main():
    root, logs = sys.argv[1], sys.argv[2]
    os.makedirs(logs, exist_ok=True)
    app = os.path.join(root, 'apps/app')
    rest = sys.argv[3:]
    pins = '--pins' in rest
    wanted = {ident for ident in rest if ident != '--pins'}
    mutants = PINS if pins else MUTANTS
    pattern = os.environ.get('RENDER_T')
    # Every mutant's text is checked first, so a typo stops the run before anything is changed.
    for ident, _expect, _description, rel, _command, edits in mutants:
        if wanted and ident not in wanted:
            continue
        text = open(os.path.join(root, rel), encoding='utf-8').read()
        for old, new in edits:
            count = text.count(old)
            if count != 1:
                print(f'{ident} SETUP ERROR: {count} matches for {old!r} in {rel}', flush=True)
                sys.exit(2)
            text = text.replace(old, new)
    unexpected = 0
    killed = survived = 0
    for ident, expect, description, rel, command, edits in mutants:
        if wanted and ident not in wanted:
            continue
        path = os.path.join(root, rel)
        with open(path, 'rb') as handle:
            original = handle.read()
        before = hashlib.sha256(original).hexdigest()
        text = original.decode('utf-8')
        for old, new in edits:
            text = text.replace(old, new)
        try:
            with open(path, 'wb') as handle:
                handle.write(text.encode('utf-8'))
            argv = command + ['-t', pattern] if pattern and command is not NODE else command
            run = subprocess.run(argv, cwd=app, capture_output=True, text=True, timeout=900)
            output = run.stdout + run.stderr
        finally:
            with open(path, 'wb') as handle:
                handle.write(original)
        after = sha(path)
        with open(os.path.join(logs, f'{ident}.log'), 'w', encoding='utf-8') as handle:
            handle.write(output)
        if command is NODE:
            totals = dict(NODE_FAIL.findall(output))
            summary = f"{totals.get('fail', '?')} failed | {totals.get('pass', '?')} passed ({totals.get('tests', '?')})"
            failed = NODE_FAILED.findall(output)
        else:
            found = SUMMARY.findall(output)
            summary = found[-1] if found else 'no summary'
            failed = FAILED.findall(output)
        assertions = output.count('AssertionError')
        outcome = 'killed' if run.returncode != 0 else 'survived'
        if outcome == 'killed':
            killed += 1
        else:
            survived += 1
        mark = 'KILLED' if outcome == 'killed' else 'SURVIVED' + (' (equivalent)' if expect == 'survived' else '')
        first = f'; first failing: "{failed[0].strip()}"' if failed else ''
        restored = 'restored sha256 equal' if after == before else f'RESTORE MISMATCH {after}'
        print(f'{ident} {mark}: {description} [{os.path.basename(rel)}] -> Tests {summary}{first}; AssertionError x{assertions}; {restored}', flush=True)
        if outcome != expect or after != before:
            unexpected += 1
    print(f'{killed} killed, {survived} survived, {unexpected} not as expected')
    sys.exit(1 if unexpected else 0)


if __name__ == '__main__':
    main()
