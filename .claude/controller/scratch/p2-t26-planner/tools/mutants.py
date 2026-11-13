#!/usr/bin/env python3
"""P2-T26 mutation check. Usage: python3 -I mutants.py <tree root> <log dir> [ids...]

Applies each mutant alone to the tree, runs the test file that holds its guard
(WalletRecord.render.test.tsx for the screen, the tray, the bar, the copy and
the sections; SpendRoutes.render.test.tsx for the route; dateStep.test.ts, a
Node test, for the date; walletHarness.render.test.tsx for the lazy load),
restores the file byte for byte (sha256 checked) and prints one line per
mutant: KILLED or SURVIVED, the test summary, the error kind of each failing
case, and whether the restore matched. A kill is clean when every failing case
fails on an AssertionError; C1 is killed by its suite failing to load (the
kit's suites cannot load expo-router), which it expects. Exits 0 only when
every mutant is killed as it expects and every file is restored.
"""
import hashlib
import os
import re
import subprocess
import sys

SCREEN = 'apps/app/src/wallet/records/WalletRecordScreen.tsx'
TRAY = 'apps/app/src/wallet/records/RecordActionsTray.tsx'
BAR = 'apps/app/src/wallet/records/WalletUndoBar.tsx'
COPY = 'apps/app/src/wallet/records/copy.ts'
ROUTE = 'apps/app/app/spend/record/[id].tsx'
SECTIONS = 'apps/app/src/dev/catalogue/wallet/recordSections.tsx'
STAGES = 'apps/app/src/dev/catalogue/wallet/recordScreens.tsx'
DATE = 'apps/app/src/ui/dateStep.ts'

RECORD = 'src/wallet/records/WalletRecord.render.test.tsx'
ROUTES = 'src/screens/redesign/SpendRoutes.render.test.tsx'
HARNESS = 'src/wallet/testing/walletHarness.render.test.tsx'
DATE_TEST = 'src/ui/dateStep.test.ts'

TITLE = "  const title = shown ? (hidden ? shown.detail.title : valueOf(shown.detail, 'merchant') ?? shown.detail.title) : '';\n"
UNDO_SHOWN = "  const undoShown = undoKey !== null && (undoGone !== undoKey || busy || pending === 'restore');\n"
RECORD_FOOTER = "        <View testID=\"wallet-record-actions\" style={{ flexDirection: large ? 'column' : 'row', gap: 8 }}>\n          <PageButton testID=\"wallet-record-edit\""
COPY_ROW = "label={`${t('records.actionCopy')} ${t('records.actionCopyLine')} ${spoken}`}"

# (id, test file, description, file, [(old, new), ...], expected kill: 'assert' or 'load'); each old occurs once.
MUTANTS = [
    # The plan's two (Step 5).
    ('S1', RECORD, "the date shows a time (the plan's mutant)", SCREEN, [('              {shortDateWithYear(shown.occurredOn, locale)}\n', '              {`${shortDateWithYear(shown.occurredOn, locale)} · 12:10`}\n')], 'assert'),
    ('S2', RECORD, "Undo restores with version 1 (the plan's mutant)", SCREEN, [('onUndo={() => void restore(deleted)}', 'onUndo={() => void restore({ id: deleted.id, version: 1 })}')], 'assert'),
    # The page.
    ('S3', RECORD, "Undo restores with the record's version, not the delete's", SCREEN, [('onUndo={() => void restore(deleted)}', 'onUndo={() => void restore({ id: deleted.id, version: record.version })}')], 'assert'),
    ('S4', RECORD, 'the merchant is the title in private mode', SCREEN, [(TITLE, "  const title = shown ? (valueOf(shown.detail, 'merchant') ?? shown.detail.title) : '';\n")], 'assert'),
    ('S5', RECORD, 'the title is never the merchant', SCREEN, [(TITLE, "  const title = shown ? shown.detail.title : '';\n")], 'assert'),
    ('S6', RECORD, 'income drawn as an expense', SCREEN, [("  const sign: MoneySign = shown?.type === 'income' ? 'income' : 'none';\n", "  const sign: MoneySign = 'none';\n")], 'assert'),
    ('S7', RECORD, 'an entry already deleted reads as live', SCREEN, [('(record.deleted_at !== null || gone)', '(gone)')], 'assert'),
    ('S8', RECORD, 'an unconfirmed delete is not frozen', SCREEN, [('  const frozen = pending !== null;\n', '  const frozen = false;\n')], 'assert'),
    ('S9', RECORD, 'a tray opened again keeps the action it was leaving for', SCREEN, [('    after.current = null;\n    setActionsOpen(true);\n', '    setActionsOpen(true);\n')], 'assert'),
    ('S10', RECORD, "the tray's copy opens the add tray at once (R69)", SCREEN, [("onCopy={() => closeFor('copy')}", 'onCopy={() => { setActionsOpen(false); addTray.open({ copyOf: shown.detail.recordId }); }}')], 'assert'),
    ('S11', RECORD, "the tray's edit starts at once (R69)", SCREEN, [("onEdit={() => closeFor('edit')}", 'onEdit={() => { setActionsOpen(false); startEditing(); }}')], 'assert'),
    ('S12', RECORD, "the tray's copy never runs", SCREEN, [("    if (after.current === 'copy' && shown) addTray.open({ copyOf: shown.detail.recordId });\n    else if (after.current === 'edit') startEditing();\n", "    if (after.current === 'edit') startEditing();\n")], 'assert'),
    ('S13', RECORD, "the tray's edit never runs", SCREEN, [("    else if (after.current === 'edit') startEditing();\n", '')], 'assert'),
    ('S14', RECORD, "the tray's delete leaves the tray open", SCREEN, [('            setActionsOpen(false);\n            void remove(live);\n', '            void remove(live);\n')], 'assert'),
    ('S15', RECORD, "the tray's delete deletes nothing", SCREEN, [('            void remove(live);\n', '            void live;\n')], 'assert'),
    ('S16', RECORD, 'any draft can be removed', SCREEN, [('        {shown.detail.actions.undo ? (\n', '        {true ? (\n')], 'assert'),
    ('S17', RECORD, 'any draft can be discarded', SCREEN, [('        {shown.detail.actions.discard ? (\n', '        {true ? (\n')], 'assert'),
    ('S18', RECORD, 'Remove discards', SCREEN, [("settleDraft(commandId, 'remove')", "settleDraft(commandId, 'discard')")], 'assert'),
    ('S19', RECORD, 'Discard removes', SCREEN, [("settleDraft(commandId, 'discard')", "settleDraft(commandId, 'remove')")], 'assert'),
    ('S20', RECORD, "a draft's ทำซ้ำวันนี้ does nothing", SCREEN, [('onPress={() => addTray.open({ copyOf })}', 'onPress={() => undefined}')], 'assert'),
    ('S21', RECORD, "the page's ทำซ้ำวันนี้ does nothing", SCREEN, [('onPress={() => addTray.open({ copyOf: record.id })}', 'onPress={() => undefined}')], 'assert'),
    ('S22', RECORD, "the page's แก้ไข does nothing", SCREEN, [('onPress={() => startEditing()}', 'onPress={() => undefined}')], 'assert'),
    ('S23', RECORD, "the page's ลบ does nothing", SCREEN, [("label={t('records.delete')} disabled={busy} onPress={() => void remove(record)}", "label={t('records.delete')} disabled={busy} onPress={() => undefined}")], 'assert'),
    ('S24', RECORD, 'แก้ไข works while a delete is on its way', SCREEN, [("label={t('records.edit')} disabled={busy}", "label={t('records.edit')} disabled={false}")], 'assert'),
    ('S25', RECORD, 'ลบ works while a delete is on its way', SCREEN, [("label={t('records.delete')} disabled={busy}", "label={t('records.delete')} disabled={false}")], 'assert'),
    ('S26', RECORD, 'more works while a delete is on its way', SCREEN, [("<IconButton label={t('records.more')} disabled={busy}", "<IconButton label={t('records.more')} disabled={false}")], 'assert'),
    ('S27', RECORD, 'ทำซ้ำวันนี้ waits for a delete on its way', SCREEN, [("label={t('records.copyToday')} onPress={() => addTray.open({ copyOf: record.id })}", "label={t('records.copyToday')} disabled={busy} onPress={() => addTray.open({ copyOf: record.id })}")], 'assert'),
    ('S28', RECORD, 'the buttons never stack', SCREEN, [(RECORD_FOOTER, RECORD_FOOTER.replace("large ? 'column' : 'row'", "'row'"))], 'assert'),
    ('S29', RECORD, 'stacked, แก้ไข still shares the row', SCREEN, [("grow={!large} label={t('records.edit')}", "grow label={t('records.edit')}")], 'assert'),
    ('S30', RECORD, 'more on every entry, live or not', SCREEN, [("          {live ? (\n            <IconButton label={t('records.more')}", "          {shown ? (\n            <IconButton label={t('records.more')}")], 'assert'),
    # The undo bar on the page.
    ('S31', RECORD, 'the undo bar never goes', SCREEN, [(UNDO_SHOWN, "  const undoShown = undoKey !== null && (true || busy || pending === 'restore');\n")], 'assert'),
    ('S32', RECORD, 'the undo bar goes while its undo is unconfirmed', SCREEN, [(UNDO_SHOWN, '  const undoShown = undoKey !== null && (undoGone !== undoKey || busy);\n')], 'assert'),
    ('S33', RECORD, 'the undo bar goes while its undo is on its way', SCREEN, [(UNDO_SHOWN, "  const undoShown = undoKey !== null && (undoGone !== undoKey || pending === 'restore');\n")], 'assert'),
    ('S34', RECORD, 'nothing says the entry was deleted once the bar has gone', SCREEN, [("          {undoShown ? null : <Notice message={tc('Entry deleted')} />}\n", '')], 'assert'),
    ('S35', RECORD, 'the page says the entry was deleted beside the bar', SCREEN, [("          {undoShown ? null : <Notice message={tc('Entry deleted')} />}\n", "          {<Notice message={tc('Entry deleted')} />}\n")], 'assert'),
    ('S36', RECORD, "the bar's words ignore private mode", SCREEN, [('deletedBarText(title, shown.amountMinor, hidden, t)', 'deletedBarText(title, shown.amountMinor, false, t)')], 'assert'),
    ('S37', RECORD, "the bar's amount keeps its .00", SCREEN, [("t('records.deletedBar', { title, amount: walletMoneyText(amountMinor) })", "t('records.deletedBar', { title, amount: walletMoneyText(amountMinor, { exact: true }) })")], 'assert'),
    ('S38', RECORD, "private mode's words carry the amount", SCREEN, [("hidden ? t('records.deletedBarHidden', { title }) :", "hidden ? t('records.deletedBar', { title, amount: walletMoneyText(amountMinor) }) :")], 'assert'),
    # The head and the ghost.
    ('S39', RECORD, 'the ghost ignores private mode', SCREEN, [('{hidden ? HIDDEN_AMOUNT : walletMoneyText(shown.amountMinor, { exact: true })}', '{walletMoneyText(shown.amountMinor, { exact: true })}')], 'assert'),
    ('S40', RECORD, 'the ghost is read', SCREEN, [('<View {...DECORATIVE} testID="wallet-record-ghost"', '<View testID="wallet-record-ghost"')], 'assert'),
    ('S41', RECORD, 'the ghost drops its .00', SCREEN, [('{hidden ? HIDDEN_AMOUNT : walletMoneyText(shown.amountMinor, { exact: true })}', '{hidden ? HIDDEN_AMOUNT : walletMoneyText(shown.amountMinor)}')], 'assert'),
    ('S42', RECORD, 'the amount drops its .00', SCREEN, [('size={44} exact sign={sign}', 'size={44} sign={sign}')], 'assert'),
    ('S43', RECORD, 'the amount does not say its kind', SCREEN, [(' label={tc(KIND_WORDS[shown.type])} />', ' />')], 'assert'),
    ('S44', RECORD, 'the note is drawn in private mode', SCREEN, [("hidden ? t('records.noteHidden') : noteText", 'noteText')], 'assert'),
    ('S45', RECORD, 'a note row with no note', SCREEN, [('            {shownNote === null ? null : (\n', '            {false ? null : (\n')], 'assert'),
    ('S46', RECORD, 'no category row', SCREEN, [('            {categoryText === null ? null : (\n', '            {true ? null : (\n')], 'assert'),
    ('S47', RECORD, 'a category row for a move', SCREEN, [('            {categoryText === null ? null : (\n', '            {false ? null : (\n')], 'assert'),
    ('S48', RECORD, "a move's two wallets are not said", SCREEN, [("valueOf(shown.detail, 'wallet') ?? valueOf(shown.detail, 'from_to') ?? ''", "valueOf(shown.detail, 'wallet') ?? ''")], 'assert'),
    ('S49', RECORD, 'a move draws a swatch', SCREEN, [('{shown.walletId === null ? null : <WalletSwatch walletId={shown.walletId} />}', "{<WalletSwatch walletId={shown.walletId ?? ''} />}")], 'assert'),
    ('S50', RECORD, "the swatch ignores the wallet's kept look", SCREEN, [
        ("import { useWalletLooks } from '../looks/WalletLooksProvider';\n", "import { useWalletLooks } from '../looks/WalletLooksProvider';\nimport { derivedLook } from '../looks/walletLooks';\n"),
        ('material={lookOf(walletId).material}', 'material={derivedLook(walletId).material}'),
    ], 'assert'),
    ('S51', RECORD, 'a fact is not read as one', SCREEN, [('      accessible\n      accessibilityLabel={`${label} ${spoken}`}\n', '')], 'assert'),
    ('S52', RECORD, 'a saved entry says no status', SCREEN, [("shown.detail.stateText ?? tc('Saved')", "shown.detail.stateText ?? ''")], 'assert'),
    ('S53', RECORD, 'a draft says it is saved', SCREEN, [("shown.detail.stateText ?? tc('Saved')", "tc('Saved')")], 'assert'),
    ('S54', RECORD, 'no saved check', SCREEN, [('{confirmed ? <Glyph d="M5 12.5l4.5 4.5L19 7.5"', '{false ? <Glyph d="M5 12.5l4.5 4.5L19 7.5"')], 'assert'),
    ('S55', RECORD, 'a draft has the saved check', SCREEN, [('{confirmed ? <Glyph d="M5 12.5l4.5 4.5L19 7.5"', '{true ? <Glyph d="M5 12.5l4.5 4.5L19 7.5"')], 'assert'),
    ('S56', RECORD, "the tile is never the category's", SCREEN, [("      {shown.type !== 'transfer' && shown.category ? (\n", '      {false ? (\n')], 'assert'),
    ('S57', RECORD, "a move's tile is an initial", SCREEN, [("          {shown.type === 'transfer' ? (\n            <CategoryGlyph", '          {false ? (\n            <CategoryGlyph')], 'assert'),
    # Deleted elsewhere, frozen, load problems, the receipt.
    ('S58', RECORD, 'the last day reads as days left', SCREEN, [("restorable.daysLeft === 1 ? t('records.lastDay') :", "false ? t('records.lastDay') :")], 'assert'),
    ('S59', RECORD, 'Restore sends version 1', SCREEN, [('restore({ id: record.id, version: restorable.version })', 'restore({ id: record.id, version: 1 })')], 'assert'),
    ('S60', RECORD, 'an unconfirmed Restore still says Restore', SCREEN, [("label={pending === 'restore' ? tc('Try again') : tc('Restore')}", "label={tc('Restore')}")], 'assert'),
    ('S61', RECORD, "a frozen delete's Try again sends nothing", SCREEN, [("onPress: () => void remove(record) } : undefined}", 'onPress: () => undefined } : undefined}')], 'assert'),
    ('S62', RECORD, 'a missing entry reads as a load problem', SCREEN, [("    const missing = loaded.error instanceof V1Error && (loaded.error.outcome === 'not_found' || loaded.error.outcome === 'deleted');\n", '    const missing = false;\n')], 'assert'),
    ('S63', RECORD, 'a failed load has no Try again', SCREEN, [("action={problem.retry ? { label: tc('Try again'), onPress: () => void load() } : undefined}", 'action={undefined}')], 'assert'),
    ('S64', RECORD, "no receipt section (W15)", SCREEN, [('          <RecordReceipt recordId={record.id} version={record.version} attachmentId={record.attachment_id ?? null} onChanged={() => void load()} />\n', '')], 'assert'),
    ('S65', RECORD, "a receipt change does not read the record again", SCREEN, [('onChanged={() => void load()}', 'onChanged={() => undefined}')], 'assert'),
    ('S66', RECORD, "the receipt section is not told the record's receipt", SCREEN, [('attachmentId={record.attachment_id ?? null}', 'attachmentId={undefined}')], 'assert'),
    # The actions tray.
    ('T1', RECORD, 'rows of 60 pt', TRAY, [('        minHeight: 66,\n', '        minHeight: 60,\n')], 'assert'),
    ('T2', RECORD, 'the copy row says the amount in private mode', TRAY, [("  const spoken = hidden ? t('common.amountHidden') : spokenMoney(amountMinor, t);\n", '  const spoken = spokenMoney(amountMinor, t);\n')], 'assert'),
    ('T3', RECORD, 'the copy row says no amount', TRAY, [(COPY_ROW, "label={`${t('records.actionCopy')} ${t('records.actionCopyLine')}`}")], 'assert'),
    ('T4', RECORD, 'the drawn title is read again', TRAY, [('        <View {...DECORATIVE}>\n          <WalletText role="h2"', '        <View>\n          <WalletText role="h2"')], 'assert'),
    ('T5', RECORD, 'no tile in the header', TRAY, [('      {art}\n', '')], 'assert'),
    ('T6', RECORD, "the header's amount ignores the sign", TRAY, [('<WalletAmount minor={amountMinor} size={28} sign={sign} />', '<WalletAmount minor={amountMinor} size={28} />')], 'assert'),
    ('T7', RECORD, "the copy row's amount ignores the sign", TRAY, [('<WalletAmount minor={amountMinor} size={13} sign={sign} />', '<WalletAmount minor={amountMinor} size={13} />')], 'assert'),
    ('T8', RECORD, 'the edit row copies', TRAY, [('          onPress={onEdit}\n', '          onPress={onCopy}\n')], 'assert'),
    ('T9', RECORD, 'the copy row edits', TRAY, [('          onPress={onCopy}\n', '          onPress={onEdit}\n')], 'assert'),
    ('T10', RECORD, 'the delete row does nothing', TRAY, [('          onPress={onDelete}\n', '          onPress={() => undefined}\n')], 'assert'),
    ('T11', RECORD, 'the tray never says it has gone', TRAY, [('      onClosed={onClosed}\n', '')], 'assert'),
    ('T12', RECORD, "the header's amount at 22 pt", TRAY, [('size={28} sign={sign}', 'size={22} sign={sign}')], 'assert'),
    ('T13', RECORD, 'no wallet and day in the header', TRAY, [('        <WalletText role="caption" tone="quiet">{detail}</WalletText>\n', '')], 'assert'),
    # The undo bar.
    ('U1', RECORD, "the bar's time is the short toast's", BAR, [('dismiss.current(), motion.duration.toastLong);', 'dismiss.current(), motion.duration.toast);')], 'assert'),
    ('U2', RECORD, 'the time runs under a screen reader', BAR, [('    if (screenReader !== false) return undefined;\n', '    if (screenReader === null) return undefined;\n')], 'assert'),
    ('U3', RECORD, 'no answer counts as a screen reader', BAR, [('() => setRunning(false));', '() => setRunning(true));')], 'assert'),
    ('U4', RECORD, 'the bar never hears a change', BAR, [('(enabled: boolean) => setRunning(enabled));', '(enabled: boolean) => undefined);')], 'assert'),
    ('U5', RECORD, 'the listener outlives the bar', BAR, [('    return () => subscription.remove();\n', '    return () => undefined;\n')], 'assert'),
    ('U6', RECORD, 'the first onDismiss for good', BAR, [('  useEffect(() => {\n    dismiss.current = onDismiss;\n  });\n', '')], 'assert'),
    ('U7', RECORD, 'drawing it again restarts the time', BAR, [('  }, [screenReader]);\n', '  }, [screenReader, onDismiss]);\n')], 'assert'),
    ('U8', RECORD, 'the time is never stopped', BAR, [('    return () => clearTimeout(timer);\n', '    return undefined;\n')], 'assert'),
    ('U9', RECORD, 'Undo plays no haptic', BAR, [("          playHaptic('undoDone');\n", '')], 'assert'),
    ('U10', RECORD, 'Undo does nothing', BAR, [('          onUndo();\n', '')], 'assert'),
    ('U11', RECORD, 'not a live region', BAR, [('      {...POLITE_LIVE_REGION}\n', '')], 'assert'),
    ('U12', RECORD, 'not said on iOS', BAR, [('  useAnnouncement(message);\n', '')], 'assert'),
    ('U13', RECORD, 'a 40 pt Undo', BAR, [('          minHeight: 44,\n', '          minHeight: 40,\n')], 'assert'),
    ('U14', RECORD, "Undo's words in ink", BAR, [('<WalletText role="label" tone="onToast">{t(\'common.undo\')}</WalletText>', '<WalletText role="label" tone="ink">{t(\'common.undo\')}</WalletText>')], 'assert'),
    ('U15', RECORD, 'the words in ink', BAR, [('tone="onToast" style={{ flex: 1', 'tone="ink" style={{ flex: 1')], 'assert'),
    ('U16', RECORD, 'the bar on the card colour', BAR, [('        backgroundColor: colors.toast,\n', '        backgroundColor: colors.card,\n')], 'assert'),
    # The copy, the sections, the route and the date.
    ('K1', RECORD, 'ทำซ้ำวันนี้ loses its Thai', COPY, [("'records.copyToday': { th: 'ทำซ้ำวันนี้'", "'records.copyToday': { th: 'ทำซ้ำ'")], 'assert'),
    ('K2', RECORD, "private mode's bar words keep an amount", COPY, [("'records.deletedBarHidden': { th: 'ลบ {title} แล้ว'", "'records.deletedBarHidden': { th: 'ลบ {title} {amount} แล้ว'")], 'assert'),
    ('C1', HARNESS, "the record's sections load at once, not lazily", SECTIONS, [("const RecordScreenSection = lazy(() => import('./recordScreens'));\n", "import RecordScreenSectionNow from './recordScreens';\nconst RecordScreenSection = RecordScreenSectionNow;\n")], 'load'),
    ('C2', RECORD, 'the tray and the bar as screens', SECTIONS, [("...(KIT_IDS.includes(id) ? { group: 'Kit' as const }", "...(false ? { group: 'Kit' as const }")], 'assert'),
    ('C3', RECORD, 'the draft section has no draft', STAGES, [('    fixture: onThisPhone,\n', '    fixture: () => online([LUNCH]),\n')], 'assert'),
    ('C4', RECORD, "the undo section's words ignore private mode", STAGES, [("deletedBarText(t('sample.chickenRice'), '5000', hidden, t)", "deletedBarText(t('sample.chickenRice'), '5000', false, t)")], 'assert'),
    ('C5', RECORD, 'the actions section opens closed', STAGES, [('  const [open, setOpen] = useState(true);\n', '  const [open, setOpen] = useState(false);\n')], 'assert'),
    ('R1', ROUTES, "the wallet area shows today's record", ROUTE, [("{isRedesignEnabled('wallet') ? <WalletRecordScreen key={id} id={id} mode={opened} /> : <RecordScreen key={id} id={id} mode={opened} />}", '<RecordScreen key={id} id={id} mode={opened} />')], 'assert'),
    ('R2', ROUTES, 'the wallet record opens in view mode only', ROUTE, [('<WalletRecordScreen key={id} id={id} mode={opened} />', '<WalletRecordScreen key={id} id={id} />')], 'assert'),
    ('R3', ROUTES, 'one wallet record kept across entries', ROUTE, [('<WalletRecordScreen key={id} id={id} mode={opened} />', '<WalletRecordScreen id={id} mode={opened} />')], 'assert'),
    ('D1', DATE_TEST, "a record's day drops this year's year", DATE, [('  return shortDate(partsOf(date), locale, true);\n', '  return shortDate(partsOf(date), locale, false);\n')], 'assert'),
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


def main():
    root, logs = sys.argv[1], sys.argv[2]
    os.makedirs(logs, exist_ok=True)
    app = os.path.join(root, 'apps/app')
    wanted = sys.argv[3:]
    unknown = [ident for ident in wanted if ident not in {m[0] for m in MUTANTS}]
    if unknown:
        raise SystemExit(f'unknown mutants: {unknown}')
    unexpected = killed = survived = 0
    for ident, test_file, description, rel, edits, expects in MUTANTS:
        if wanted and ident not in wanted:
            continue
        path = os.path.join(root, rel)
        with open(path, 'rb') as handle:
            original = handle.read()
        before = hashlib.sha256(original).hexdigest()
        text = original.decode('utf-8')
        for old, new in edits:
            count = text.count(old)
            if count != 1:
                print(f'{ident} SETUP ERROR: {count} matches for {old!r} in {rel}', flush=True)
                sys.exit(2)
            text = text.replace(old, new)
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
            outcome, clean = 'SURVIVED', False
            survived += 1
        else:
            killed += 1
            outcome = 'KILLED'
            clean = (bool(kinds) and all(kind == 'AssertionError' for kind in kinds)) if expects == 'assert' else not kinds
        restored = 'restored sha256 equal' if after == before else f'RESTORE MISMATCH {after}'
        kind_text = ', '.join(f'{kinds.count(kind)} {kind}' for kind in sorted(set(kinds))) or 'no failing case'
        print(f'{ident} {outcome}: {description} [{os.path.basename(rel)} / {os.path.basename(test_file)}] -> Tests {summary_of(output, test_file)}; {kind_text}; {restored}', flush=True)
        if not clean or after != before:
            unexpected += 1
    print(f'{killed} killed, {survived} survived, {unexpected} not as expected')
    sys.exit(1 if unexpected else 0)


if __name__ == '__main__':
    main()
