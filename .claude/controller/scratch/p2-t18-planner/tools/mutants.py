#!/usr/bin/env python3
"""P2-T18 mutation check (the wallet shell). Usage: python3 -I mutants.py <tree root> <log dir> [ids...]
                                            or: python3 -I mutants.py <tree root> --check

Applies each mutant alone to the tree, runs the test file that holds its guard (shellRoutes.test.ts and
spendLayoutOrder.test.ts with Node's test runner; WalletShell.render.test.tsx and SpendLayout.render.test.tsx in the
render suite), restores the file byte for byte (sha256 checked) and prints one line per mutant: KILLED or SURVIVED,
the test summary, the error kind of each failing case, and whether the restore matched. A kill is clean only when
every failing case fails on an AssertionError. The X mutants change the add tray host (P2-T16's file, read only in
this task): they show the shell's cases hold the bound's two guarantees. With ids, runs only those (the planner ran
them in batches; merge_mutants.py joins the batches). With --check, applies nothing and checks that every mutant's
text occurs exactly once. Exits 0 only when every mutant it ran is killed cleanly and every file is restored.
"""
from __future__ import annotations

import hashlib
import os
import re
import subprocess
import sys

ROUTES = 'apps/app/src/wallet/home/shellRoutes.ts'
BAR = 'apps/app/src/wallet/home/WalletTabBar.tsx'
ADD = 'apps/app/src/wallet/home/AddButton.tsx'
SHELL = 'apps/app/src/wallet/home/WalletShell.tsx'
COPY = 'apps/app/src/wallet/home/copy.ts'
LAYOUT = 'apps/app/app/spend/_layout.tsx'
ROUTE = 'apps/app/app/spend/add.tsx'
HOST = 'apps/app/src/wallet/add/AddTrayHost.tsx'

R_TEST = 'src/wallet/home/shellRoutes.test.ts'
ORDER = 'src/wallet/home/spendLayoutOrder.test.ts'
SHELL_TEST = 'src/wallet/home/WalletShell.render.test.tsx'
LAYOUT_TEST = 'src/screens/redesign/SpendLayout.render.test.tsx'

BRANCH_TAIL = '{ask ? <AnalyticsConsentScreen /> : <WalletShell><HistoryKeepProvider><Slot /></HistoryKeepProvider></WalletShell>}'
WALLET_LINE = "  if (isRedesignEnabled('wallet')) return <DeviceDiaryProvider><CompanionBoundary>" + BRANCH_TAIL + '</CompanionBoundary></DeviceDiaryProvider>;\n'
SCREENS = '  const screens = <DeviceDiaryProvider><CompanionBoundary>{ask ? <AnalyticsConsentScreen /> : <Slot />}</CompanionBoundary></DeviceDiaryProvider>;\n'
CORE_RETURN = "  return isRedesignEnabled('core') ? <SpendTabShell><HistoryKeepProvider>{screens}</HistoryKeepProvider></SpendTabShell> : screens;\n"
LEGACY = '  if (isLegacySpendEnabled()) return <Slot />;\n'
BLOCKED = '  const blocked = syncPlan(useDiaryView(), false, tc).upgrade;\n'
ON_SAVED = '  const onSaved = useCallback((saved: SavedEntry, context: SavedContext) => toast.show(noticeOf(saved, context.lookups, context.offline, tc)), [toast, tc]);\n'
ROOT = '    <View testID="wallet-shell" onMagicTap={openAdd} style={{ flex: 1, backgroundColor: colors.ground }}>\n      <View style={{ flex: 1 }}>\n'
WALLET_GATE = "  if (isRedesignEnabled('wallet') && !isLegacySpendEnabled()) return <WalletAdd />;\n"
ITEM_SIZE = 'minHeight: large ? 52 : 44, minWidth: large ? 64 : 56'

# (id, test file, description, file, [(old, new), ...][, 'equivalent']); each old occurs exactly once in its file.
# An equivalent mutant is expected to survive, for the reason its description gives.
MUTANTS = [
    # Where the bar shows, the inset and the add route's request (shellRoutes.ts), on the Node test.
    ('R1', R_TEST, "the bar shows on /spend/all (the plan's mutant)", ROUTES, [("  if (path === WALLET_TAB_ROUTES.wallets) return { visible: true, active: 'wallets' };\n", "  if (path === WALLET_TAB_ROUTES.wallets || path === '/spend/all') return { visible: true, active: 'wallets' };\n")]),
    ('R2', R_TEST, 'a trailing slash hides the bar', ROUTES, [("  const path = `/${pathname.split('/').filter((part) => part !== '').join('/')}`;\n", '  const path = pathname;\n')]),
    ('R3', R_TEST, 'Insights selects the wallets tab', ROUTES, [("  if (path === WALLET_TAB_ROUTES.insights) return { visible: true, active: 'insights' };\n", "  if (path === WALLET_TAB_ROUTES.insights) return { visible: true, active: 'wallets' };\n")]),
    ('R4', R_TEST, 'the bar shows everywhere', ROUTES, [('  return { visible: false, active: null };\n', '  return { visible: true, active: null };\n')]),
    ('R5', R_TEST, 'Insights is a History route', ROUTES, [("{ wallets: '/spend', insights: '/spend/insights' }", "{ wallets: '/spend', insights: '/spend/all' }")]),
    ('R6', R_TEST, 'a hidden bar keeps an inset', ROUTES, [('  if (!visible) return 0;\n', '')]),
    ('R7', R_TEST, 'the largest sizes keep the standard inset', ROUTES, [('  return large ? WALLET_TAB_INSET_LARGE : WALLET_TAB_INSET;\n', '  return WALLET_TAB_INSET;\n')]),
    ('R8', R_TEST, 'the standard inset is 83', ROUTES, [('export const WALLET_TAB_INSET = 84;\n', 'export const WALLET_TAB_INSET = 83;\n')]),
    ('R9', R_TEST, 'the largest inset is 84', ROUTES, [('export const WALLET_TAB_INSET_LARGE = 96;\n', 'export const WALLET_TAB_INSET_LARGE = 84;\n')]),
    ('R10', R_TEST, 'any type in the link passes', ROUTES, [('  const type = ADD_TYPES.find((each) => each === params.type);\n', "  const type = typeof params.type === 'string' ? (params.type as AddType) : undefined;\n")]),
    ('R11', R_TEST, 'an empty wallet or copy passes', ROUTES, [("    return typeof value === 'string' && value !== '' ? value : undefined;\n", "    return typeof value === 'string' ? value : undefined;\n")]),
    ('R12', R_TEST, "the link's wallet is dropped", ROUTES, [('    ...(walletId === undefined ? {} : { walletId }),\n', '')]),
    ('R13', R_TEST, "the link's copy is dropped", ROUTES, [('    ...(copyOf === undefined ? {} : { copyOf }),\n', '')]),
    # The bar (WalletTabBar.tsx), on the shell's render suite.
    ('B1', SHELL_TEST, 'ฉัน is a tab', BAR, [("            role={tab ? 'tab' : 'link'}\n            accessibilityRole={tab ? 'tab' : 'link'}\n", '            role="tab"\n            accessibilityRole="tab"\n')]),
    ('B2', SHELL_TEST, 'ฉัน says it is not selected', BAR, [("            {...(tab ? { accessibilityState: { selected }, 'aria-selected': selected } : {})}\n", "            {...{ accessibilityState: { selected }, 'aria-selected': selected }}\n")]),
    ('B3', SHELL_TEST, 'the wrong tab is selected', BAR, [('        const selected = tab && item.key === active;\n', '        const selected = tab && item.key !== active;\n')]),
    ('B4', SHELL_TEST, 'each place is one more', BAR, [("aria-valuetext={t('home.tabPlace', { n: item.place })}", "aria-valuetext={t('home.tabPlace', { n: item.place + 1 })}")]),
    ('B5', SHELL_TEST, 'no item says its place', BAR, [("            aria-valuetext={t('home.tabPlace', { n: item.place })}\n", '')]),
    ('B6', SHELL_TEST, 'ฉัน says it is second', BAR, [("  { key: 'me', name: 'home.tabMe', place: 3 },\n", "  { key: 'me', name: 'home.tabMe', place: 2 },\n")]),
    ('B7', SHELL_TEST, 'items are 40 pt tall', BAR, [(ITEM_SIZE, 'minHeight: large ? 52 : 40, minWidth: large ? 64 : 56')]),
    ('B8', SHELL_TEST, 'items are 44 pt wide', BAR, [(ITEM_SIZE, 'minHeight: large ? 52 : 44, minWidth: large ? 64 : 44')]),
    ('B9', SHELL_TEST, 'the largest sizes keep the standard items', BAR, [(ITEM_SIZE, 'minHeight: 44, minWidth: 56')]),
    ('B10', SHELL_TEST, 'the largest sizes keep the labels', BAR, [('            {large ? null : (\n', '            {false ? null : (\n')]),
    ('B11', SHELL_TEST, 'the largest sizes keep 24 pt icons', BAR, [('size={large ? 30 : 24}', 'size={24}')]),
    ('B12', SHELL_TEST, 'the selected label is quiet and the others ink', BAR, [("tone={selected ? 'ink' : 'quietOnGround'}", "tone={selected ? 'quietOnGround' : 'ink'}")]),
    ('B13', SHELL_TEST, 'a selected tab navigates again', BAR, [('    else if (item !== active) router.navigate(WALLET_TAB_ROUTES[item]);\n', '    else router.navigate(WALLET_TAB_ROUTES[item]);\n')]),
    ('B14', SHELL_TEST, 'ฉัน navigates in place of opening Settings over the shell', BAR, [("    if (item === 'me') router.push('/settings');\n", "    if (item === 'me') router.navigate('/settings');\n")]),
    ('B15', SHELL_TEST, 'the inset ignores the text size', BAR, [('  return walletTabInset(walletTab(pathname).visible, large);\n', '  return walletTabInset(walletTab(pathname).visible, false);\n')]),
    ('B16', SHELL_TEST, 'the inset ignores where the bar is', BAR, [('  return walletTabInset(walletTab(pathname).visible, large);\n', '  return walletTabInset(true, large);\n')]),
    ('B17', SHELL_TEST, 'the bar is no tablist', BAR, [('      role="tablist"\n      accessibilityRole="tablist"\n', '')]),
    ('B18', SHELL_TEST, "the bar ignores the phone's bottom inset", BAR, [('        paddingBottom: Math.max(insets.bottom, 6),\n', '        paddingBottom: 6,\n')]),
    ('B19', SHELL_TEST, "the labels grow past iOS's largest standard size", BAR, [(' maxFontSizeMultiplier={LARGEST_STANDARD_SCALE}', '')]),
    ('B20', SHELL_TEST, 'no large content viewer', BAR, [('            accessibilityShowsLargeContentViewer\n            accessibilityLargeContentTitle={name}\n', '')]),
    # The + (AddButton.tsx).
    ('A1', SHELL_TEST, 'the + is never disabled', ADD, [('      accessibilityState={{ disabled }}\n      aria-disabled={disabled}\n      disabled={disabled}\n', '      accessibilityState={{ disabled: false }}\n      aria-disabled={false}\n      disabled={false}\n')]),
    ('A2', SHELL_TEST, 'the + is 56 pt', ADD, [('export const ADD_BUTTON_SIZE = 60;\n', 'export const ADD_BUTTON_SIZE = 56;\n')]),
    ('A3', SHELL_TEST, 'the + is a card', ADD, [('        backgroundColor: colors.primary,\n', '        backgroundColor: colors.card,\n')]),
    ('A4', SHELL_TEST, 'the + is named by its hint', ADD, [("      accessibilityLabel={t('home.add')}\n", "      accessibilityLabel={t('home.addHint')}\n")]),
    ('A5', SHELL_TEST, 'the + has no hint', ADD, [("      accessibilityHint={t('home.addHint')}\n", '')]),
    ('A6', SHELL_TEST, 'the + sits at the left', ADD, [('        right: 18,\n', '        left: 18,\n')]),
    ('A7', SHELL_TEST, 'the + sits on the bar', ADD, [('        bottom: 16,\n', '        bottom: 0,\n')]),
    ('A8', SHELL_TEST, 'the + is in the flow', ADD, [("        position: 'absolute',\n", "        position: 'relative',\n")]),
    # The shell (WalletShell.tsx).
    ('S1', SHELL_TEST, "blocked reads only the outcome's status (the plan's mutant)", SHELL, [(BLOCKED, "  const blocked = useDiaryView().outcome?.status === 'upgrade_required';\n")]),
    ('S2', SHELL_TEST, 'never blocked', SHELL, [(BLOCKED, '  const blocked = false;\n')]),
    ('S3', SHELL_TEST, 'the host is never told it is blocked', SHELL, [('    <AddTrayHost onSaved={onSaved} blocked={blocked}>\n', '    <AddTrayHost onSaved={onSaved} blocked={false}>\n')]),
    ('S4', SHELL_TEST, 'the + is enabled while blocked', SHELL, [('      <ShellFrame blocked={blocked}>{children}</ShellFrame>\n', '      <ShellFrame blocked={false}>{children}</ShellFrame>\n')]),
    ('S5', SHELL_TEST, 'a save shows two notices at once (equivalent: React draws the two state changes of one save in one render, so one toast reads once)', SHELL, [(ON_SAVED, '  const onSaved = useCallback((saved: SavedEntry, context: SavedContext) => { toast.show(noticeOf(saved, context.lookups, context.offline, tc)); toast.show(noticeOf(saved, context.lookups, context.offline, tc)); }, [toast, tc]);\n')], 'equivalent'),
    ('S5b', SHELL_TEST, 'a save shows its notice again once the first has drawn', SHELL, [(ON_SAVED, '  const onSaved = useCallback((saved: SavedEntry, context: SavedContext) => { const notice = noticeOf(saved, context.lookups, context.offline, tc); toast.show(notice); setTimeout(() => toast.show(notice), 50); }, [toast, tc]);\n')]),
    ('S6', SHELL_TEST, 'a save shows nothing', SHELL, [(ON_SAVED, '  const onSaved = useCallback((saved: SavedEntry, context: SavedContext) => void [saved, context, toast, tc], [toast, tc]);\n')]),
    ('S7', SHELL_TEST, "a save kept on the phone is said as saved online", SHELL, [('noticeOf(saved, context.lookups, context.offline, tc)', 'noticeOf(saved, context.lookups, false, tc)')]),
    ('S8', SHELL_TEST, "no toast's host", SHELL, [('          <SavedToastHost>\n            <ShellTray>{children}</ShellTray>\n          </SavedToastHost>\n', '          <ShellTray>{children}</ShellTray>\n')]),
    ('S9', SHELL_TEST, 'no card frames', SHELL, [('        <CardFramesProvider>\n', ''), ('        </CardFramesProvider>\n', '')]),
    ('S10', ORDER, 'no looks kept by the shell', SHELL, [('      <WalletLooksProvider>\n', ''), ('      </WalletLooksProvider>\n', '')]),
    ('S11', ORDER, "the shell's screens on another route's resources", SHELL, [('    <SpendV1Provider resources={getSharedV1Resources()}>\n', ''), ('    </SpendV1Provider>\n', '')]),
    ('S12', ORDER, "the looks below the toast's host", SHELL, [('      <WalletLooksProvider>\n        <CardFramesProvider>\n          <SavedToastHost>\n            <ShellTray>{children}</ShellTray>\n          </SavedToastHost>\n        </CardFramesProvider>\n      </WalletLooksProvider>\n', '      <CardFramesProvider>\n        <SavedToastHost>\n          <WalletLooksProvider>\n            <ShellTray>{children}</ShellTray>\n          </WalletLooksProvider>\n        </SavedToastHost>\n      </CardFramesProvider>\n')]),
    ('S13', SHELL_TEST, "Magic Tap on the screen's View, not the root", SHELL, [(ROOT, '    <View testID="wallet-shell" style={{ flex: 1, backgroundColor: colors.ground }}>\n      <View onMagicTap={openAdd} style={{ flex: 1 }}>\n')]),
    ('S14', SHELL_TEST, 'Magic Tap opens income', SHELL, [('onMagicTap={openAdd}', "onMagicTap={() => tray.open({ type: 'income' })}")]),
    ('S15', SHELL_TEST, 'no Magic Tap', SHELL, [(' onMagicTap={openAdd}', '')]),
    ('S16', SHELL_TEST, 'the + where the bar is hidden', SHELL, [('        {visible ? <AddButton onPress={openAdd} disabled={blocked} /> : null}\n', '        <AddButton onPress={openAdd} disabled={blocked} />\n')]),
    ('S17', SHELL_TEST, 'the bar on every screen', SHELL, [('      {visible ? <WalletTabBar /> : null}\n', '      <WalletTabBar />\n')]),
    ('S18', SHELL_TEST, 'the + opens income', SHELL, [('  const openAdd = () => tray.open();\n', "  const openAdd = () => tray.open({ type: 'income' });\n")]),
    ('S19', SHELL_TEST, "the screens outside the add tray's host", SHELL, [('    <AddTrayHost onSaved={onSaved} blocked={blocked}>\n      <ShellFrame blocked={blocked}>{children}</ShellFrame>\n    </AddTrayHost>\n', '    <>\n      <AddTrayHost onSaved={onSaved} blocked={blocked}>{null}</AddTrayHost>\n      <ShellFrame blocked={blocked}>{children}</ShellFrame>\n    </>\n')]),
    # The copy (copy.ts).
    ('K1', SHELL_TEST, "the place's Thai line drops จาก", COPY, [("  'home.tabPlace': { th: '{n} จาก 3', en: '{n} of 3' },\n", "  'home.tabPlace': { th: '{n}/3', en: '{n} of 3' },\n")]),
    ('K2', SHELL_TEST, "the +'s Thai name is English", COPY, [("  'home.add': { th: 'จดรายการ', en: 'Add an entry' },\n", "  'home.add': { th: 'Add an entry', en: 'Add an entry' },\n")]),
    # The layout (_layout.tsx): the order test and the layout's cases.
    ('L1', ORDER, "the shell above the diary (the plan's mutant)", LAYOUT, [(WALLET_LINE, "  if (isRedesignEnabled('wallet')) return <WalletShell><DeviceDiaryProvider><CompanionBoundary>{ask ? <AnalyticsConsentScreen /> : <HistoryKeepProvider><Slot /></HistoryKeepProvider>}</CompanionBoundary></DeviceDiaryProvider></WalletShell>;\n")]),
    ('L2', ORDER, "the terms gate in the screens element only (the plan's mutant)", LAYOUT, [(SCREENS, '  const screens = <DeviceDiaryProvider><TermsGate><CompanionBoundary>{ask ? <AnalyticsConsentScreen /> : <Slot />}</CompanionBoundary></TermsGate></DeviceDiaryProvider>;\n')]),
    ('L3', ORDER, "the question in the screens element only (the plan's mutant)", LAYOUT, [(BRANCH_TAIL, '<WalletShell><HistoryKeepProvider><Slot /></HistoryKeepProvider></WalletShell>')]),
    ('L3b', LAYOUT_TEST, 'the question in the screens element only, in the wallet area', LAYOUT, [(BRANCH_TAIL, '<WalletShell><HistoryKeepProvider><Slot /></HistoryKeepProvider></WalletShell>')]),
    ('L4', ORDER, "the question inside the shell (the plan's mutant): the order's consent case", LAYOUT, [(BRANCH_TAIL, '<WalletShell>{ask ? <AnalyticsConsentScreen /> : <HistoryKeepProvider><Slot /></HistoryKeepProvider>}</WalletShell>')]),
    ('L4b', LAYOUT_TEST, "the question inside the shell (the plan's mutant): the layout's consent case", LAYOUT, [(BRANCH_TAIL, '<WalletShell>{ask ? <AnalyticsConsentScreen /> : <HistoryKeepProvider><Slot /></HistoryKeepProvider>}</WalletShell>')]),
    ('L5', ORDER, 'the wallet branch after the core branch', LAYOUT, [(WALLET_LINE, ''), (CORE_RETURN, "  if (isRedesignEnabled('core')) return <SpendTabShell><HistoryKeepProvider>{screens}</HistoryKeepProvider></SpendTabShell>;\n" + WALLET_LINE + '  return screens;\n')]),
    ('L5b', LAYOUT_TEST, 'the wallet branch after the core branch, in the wallet area', LAYOUT, [(WALLET_LINE, ''), (CORE_RETURN, "  if (isRedesignEnabled('core')) return <SpendTabShell><HistoryKeepProvider>{screens}</HistoryKeepProvider></SpendTabShell>;\n" + WALLET_LINE + '  return screens;\n')]),
    ('L6', ORDER, 'the wallet branch before the legacy build', LAYOUT, [(LEGACY, ''), (WALLET_LINE, WALLET_LINE + LEGACY)]),
    ('L6b', LAYOUT_TEST, 'the wallet branch before the legacy build, in the wallet area', LAYOUT, [(LEGACY, ''), (WALLET_LINE, WALLET_LINE + LEGACY)]),
    ('L7', ORDER, "History's keep around the shell", LAYOUT, [('<WalletShell><HistoryKeepProvider><Slot /></HistoryKeepProvider></WalletShell>', '<HistoryKeepProvider><WalletShell><Slot /></WalletShell></HistoryKeepProvider>')]),
    ('L8', ORDER, 'no History keep in the wallet area', LAYOUT, [('<WalletShell><HistoryKeepProvider><Slot /></HistoryKeepProvider></WalletShell>', '<WalletShell><Slot /></WalletShell>')]),
    ('L9', ORDER, 'the wallet branch asks on a condition of its own', LAYOUT, [('{ask ? <AnalyticsConsentScreen /> : <WalletShell>', "{status === 'unanswered' ? <AnalyticsConsentScreen /> : <WalletShell>")]),
    # The add route (add.tsx), on the layout's cases.
    ('D1', LAYOUT_TEST, 'the wallet area ignores the legacy build', ROUTE, [(WALLET_GATE, "  if (isRedesignEnabled('wallet')) return <WalletAdd />;\n")]),
    ('D2', LAYOUT_TEST, 'the wallet area keeps Quick add', ROUTE, [(WALLET_GATE, '')]),
    ('D3', LAYOUT_TEST, "the link's type is lost", ROUTE, [('    tray.open(addRequestOf(params));\n', '    tray.open();\n')]),
    ('D4', LAYOUT_TEST, 'the route stays in place of Home', ROUTE, [("    router.replace('/spend');\n", '')]),
    ('D5', LAYOUT_TEST, 'Home is pushed over the route', ROUTE, [("    router.replace('/spend');\n", "    router.push('/spend');\n")]),
    ('D6', LAYOUT_TEST, 'the route opens the tray again at each redraw', ROUTE, [('    if (started.current) return;\n', '')]),
    ('D7', LAYOUT_TEST, "the link's copy is dropped by the route", ROUTE, [('    tray.open(addRequestOf(params));\n', '    tray.open({ ...addRequestOf(params), copyOf: undefined });\n')]),
    # The add tray host's bound (P2-T16's guarantees, its confirming review's m2), on the shell's cases.
    ('X1', SHELL_TEST, 'closed is not a useCallback', HOST, [('  const closed = useCallback((gone: Entry) => {\n', '  const closed = (gone: Entry) => {\n'), ('    for (const run of queue.current.splice(0)) run();\n  }, [show]);\n', '    for (const run of queue.current.splice(0)) run();\n  };\n')]),
    ('X2', SHELL_TEST, 'leave is not a useCallback', HOST, [('  const leave = useCallback(() => onClosed(entry), [onClosed, entry]);\n', '  const leave = () => onClosed(entry);\n')]),
    ('X3', SHELL_TEST, 'show is not a useCallback', HOST, [('  const show = useCallback((next: Entry | null, shown: boolean) => {\n', '  const show = (next: Entry | null, shown: boolean) => {\n'), ('    setVisible(shown);\n  }, []);\n', '    setVisible(shown);\n  };\n')]),
    ('X7', SHELL_TEST, 'the bound armed on iOS only', HOST, [("import { ActivityIndicator, View } from 'react-native';\n", "import { ActivityIndicator, Platform, View } from 'react-native';\n"), ('    if (visible) return undefined;\n    const timer = setTimeout(leave, CLOSED_BOUND_MS);\n', "    if (visible || Platform.OS !== 'ios') return undefined;\n    const timer = setTimeout(leave, CLOSED_BOUND_MS);\n")]),
]

VITEST_SUMMARY = re.compile(r'^\s*Tests  (.+?)\s*$', re.M)
NODE_COUNTS = re.compile(r'^ℹ (tests|pass|fail) (\d+)$', re.M)


def sha(path):
    with open(path, 'rb') as handle:
        return hashlib.sha256(handle.read()).hexdigest()


def kinds_of(text):
    """The error kind of each failing case (see first_errors.py)."""
    kinds = []
    if 'Failed Tests' in text:
        tail = text.split('Failed Tests', 1)[1]
        for block in re.split(r'^⎯+\[\d+/\d+\]⎯*$', tail, flags=re.M):
            cases = re.findall(r'^ FAIL  .+$', block, re.M)
            error = re.search(r'^(\w*Error)\b', block, re.M)
            kinds += [error.group(1) if error else 'unknown'] * len(cases)
    elif 'failing tests:' in text:
        for block in re.split(r'^✖ ', text.split('failing tests:', 1)[1], flags=re.M)[1:]:
            error = re.search(r'^\s+(\w*Error)\b', block, re.M)
            kinds.append(error.group(1) if error else 'unknown')
    return kinds


def run_tests(app, test_file):
    if test_file.endswith('.test.ts'):
        command = ['node', 'scripts/test-unit.mjs', test_file]
    else:
        command = ['npx', 'vitest', 'run', '--config', 'vitest.render.config.ts', '--reporter=verbose', test_file]
    run = subprocess.run(command, cwd=app, capture_output=True, text=True, timeout=900)
    return run.returncode, run.stdout + run.stderr


def summary_of(output, test_file):
    if test_file.endswith('.test.ts'):
        counts = dict(NODE_COUNTS.findall(output))
        return f"tests {counts.get('tests', '?')} pass {counts.get('pass', '?')} fail {counts.get('fail', '?')}"
    found = VITEST_SUMMARY.findall(output)
    if found:
        return found[-1]
    return 'no tests (the file failed to load)' if 'Test Files' in output else 'no summary'


def mutated(root, rel, edits):
    with open(os.path.join(root, rel), 'rb') as handle:
        original = handle.read()
    text = original.decode('utf-8')
    for old, new in edits:
        count = text.count(old)
        if count != 1:
            return original, None, f'{count} matches for {old!r} in {rel}'
        text = text.replace(old, new)
    return original, text, None


def main():
    root = sys.argv[1]
    if sys.argv[2:] == ['--check']:
        bad = 0
        for ident, _test, _description, rel, edits, *_expects in MUTANTS:
            _original, _text, problem = mutated(root, rel, edits)
            if problem:
                bad += 1
                print(f'{ident} SETUP ERROR: {problem}')
        print(f'{len(MUTANTS)} mutants, {bad} that do not apply')
        sys.exit(1 if bad else 0)
    logs = sys.argv[2]
    os.makedirs(logs, exist_ok=True)
    app = os.path.join(root, 'apps/app')
    wanted = sys.argv[3:]
    unknown = [ident for ident in wanted if ident not in {m[0] for m in MUTANTS}]
    if unknown:
        raise SystemExit(f'unknown mutants: {unknown}')
    unexpected = killed = survived = 0
    for ident, test_file, description, rel, edits, *expects in MUTANTS:
        if wanted and ident not in wanted:
            continue
        equivalent = expects == ['equivalent']
        path = os.path.join(root, rel)
        original, text, problem = mutated(root, rel, edits)
        if problem:
            print(f'{ident} SETUP ERROR: {problem}', flush=True)
            sys.exit(2)
        before = hashlib.sha256(original).hexdigest()
        try:
            with open(path, 'wb') as handle:
                handle.write(text.encode('utf-8'))
            code, output = run_tests(app, test_file)
        finally:
            with open(path, 'wb') as handle:
                handle.write(original)
        after = sha(path)
        with open(os.path.join(logs, f'{ident}.log'), 'w', encoding='utf-8') as handle:
            handle.write(output)
        kinds = kinds_of(output)
        if code == 0:
            outcome, clean = ('SURVIVED (equivalent)', True) if equivalent else ('SURVIVED', False)
            survived += 1
        else:
            killed += 1
            outcome = 'KILLED'
            clean = not equivalent and bool(kinds) and all(kind == 'AssertionError' for kind in kinds)
        restored = 'restored sha256 equal' if after == before else f'RESTORE MISMATCH {after}'
        kind_text = ', '.join(f'{kinds.count(kind)} {kind}' for kind in sorted(set(kinds))) or 'no failing case'
        print(f'{ident} {outcome}: {description} [{os.path.basename(rel)} / {os.path.basename(test_file)}] -> Tests {summary_of(output, test_file)}; {kind_text}; {restored}', flush=True)
        if not clean or after != before:
            unexpected += 1
    print(f'{killed} killed, {survived} survived, {unexpected} not as expected')
    sys.exit(1 if unexpected else 0)


if __name__ == '__main__':
    main()
