# 1D-T7's mutants: one per guard, each run on the test that should kill it.
#   python3 -I mutants.py --tree <worktree> --out <dir> [--only <id> ...]
# For each mutant: every file it touches must equal the kit's real/ copy (or,
# for a file this task does not change, its mutbase/ copy) by sha256; each
# replacement's old text must occur exactly once; its command runs in
# <tree>/apps/app with its output in <out>/<id>.log; then every touched file is
# copied back and its sha256 checked again. A mutant is killed when its command
# fails: "killed (assertion)" when the log holds an assertion failure, "killed
# (error)" otherwise. The one equivalent mutant (QE, the plan's own) must
# survive. Prints one line per mutant, then
# "<k> of <n> killed; equivalent [...]; survivors [...]; not restored [...]".
# Exit 0 only when every other mutant is killed, QE survives, and every file is restored.
import argparse
import hashlib
import shutil
import subprocess
import sys
from pathlib import Path

KIT = Path(__file__).resolve().parent

APP = 'apps/app/'
BUS = APP + 'src/analytics/bus.ts'
APPA = APP + 'src/analytics/appAnalytics.ts'
CTRL = APP + 'src/analytics/controller.ts'
PROPS = APP + 'src/analytics/recordProps.ts'
STEL = APP + 'src/sync/syncTelemetry.ts'
ENG = APP + 'src/sync/syncEngine.ts'
DEV = APP + 'src/sync/deviceSync.ts'
PERM = APP + 'src/consent/systemPermissionTelemetry.ts'
SAVE = APP + 'src/screens/redesign/entry/entrySave.ts'
QA = APP + 'src/screens/redesign/QuickAddScreen.tsx'
RA = APP + 'src/screens/redesign/record/recordActions.ts'
DEL = APP + 'src/screens/redesign/deleted/deletedData.ts'
HIST = APP + 'src/screens/redesign/HistoryScreen.tsx'
HOME = APP + 'src/screens/redesign/HomeScreen.tsx'
BUD = APP + 'src/screens/redesign/planning/BudgetScreen.tsx'
ONB = APP + 'src/screens/redesign/account/OnboardingScreen.tsx'
ROUTE = APP + 'app/spend/deleted.tsx'


def node(path):
    return ('node', [path], None)


def render(path, name=None):
    return ('render', [path], name)


BUS_TEST = node('src/analytics/bus.test.ts')
CTRL_TEST = node('src/analytics/controller.test.ts')
PROPS_TEST = node('src/analytics/recordProps.test.ts')
STEL_TEST = node('src/sync/syncTelemetry.test.ts')
ENG_TEST = node('src/sync/syncEngine.test.ts')
PERM_TEST = node('src/consent/systemPermissionTelemetry.test.ts')
APPA_TEST = render('src/analytics/appAnalytics.render.test.tsx')
DEV_TEST = render('src/sync/deviceSync.render.test.tsx')
QUICK = 'src/screens/redesign/QuickAddScreen.render.test.tsx'
QA_SAVE = render(QUICK, 'saving an expense records record_started')
QA_BUN = render(QUICK, 'Tell Bun filled records source tell_bun')
QA_OFFLINE = render(QUICK, 'offline unless the last sync ended synced')
QA_ANOTHER = render(QUICK, 'Add another starts a new entry')
RECORD = 'src/screens/redesign/RecordScreen.render.test.tsx'
REC_EDIT = render(RECORD, 'an acknowledged edit records record_edited')
REC_DELETE = render(RECORD, 'a delete records record_deleted and its undo')
REC_RESTORE = render(RECORD, 'Restore records record_restored')
REC_YOURS = render(RECORD, 'use yours" records one record_edited')
REC_CATEGORY = render('src/screens/redesign/record/recordActions.render.test.tsx', 'moves the entry to another category')
HIST_TEST = render('src/screens/redesign/HistoryScreen.render.test.tsx', 'a delete from History records record_deleted')
DEL_TEST = render('src/screens/redesign/RecentlyDeletedScreen.render.test.tsx', 'a restore records record_restored once Jotbun has it')
HOME_NEW = render('src/screens/redesign/HomeScreen.render.test.tsx', 'creating a wallet records one wallet_added')
HOME_OWN = render('src/screens/redesign/HomeScreen.render.test.tsx', 'a first wallet an earlier attempt had already made')
BUD_SAVE = render('src/screens/redesign/planning/BudgetScreen.render.test.tsx', 'records one budget_set, without the amount')
BUD_SAME = render('src/screens/redesign/planning/BudgetScreen.render.test.tsx', 'already holds with exactly these figures records one budget_set')
ONB_TEST = render('src/screens/redesign/account/OnboardingScreen.render.test.tsx', 'each story step records onboarding_step_viewed')
ROUTES_TEST = render('src/screens/redesign/SpendRoutes.render.test.tsx', 'Recently deleted under the wallet area')

SAVED_CALL = "      trackRecordSaved({ kind: fields.type, source: track.source, categoryKey: track.categoryKey, offline, secondsToSave: (Date.now() - track.openedAt) / 1000 });\n"
QA_KEY = "categoryKey: categoryKeyOf(current.type === 'transfer' ? null : current.categoryByType[current.type], categories),"
RA_RESTORE_SENT = (
    "      if (loaded.state === 'ready') {\n"
    "        if (undo) trackUndoUsed({ kind: loaded.record.type });\n"
    "        else trackRecordRestored({ kind: loaded.record.type });\n"
    "      }\n"
)

# (id, what it breaks, [(file, old, new), ...], test)
MUTANTS = [
    # The bus: the guard and the early events (1D-T6's review, m3).
    ('B1', 'a throwing client breaks the rule that tracks', [(BUS,
     "  try {\n    analytics.track(cleaned.name, cleaned.properties);\n  } catch {\n    // Analytics never breaks the action it counts (1D-T7): a save, a delete or\n    // a sync report goes on whatever the client does.\n  }\n",
     "  analytics.track(cleaned.name, cleaned.properties);\n")], BUS_TEST),
    ('B2', 'nothing tracked before the install is kept', [(BUS, "    early.push(cleaned);\n", '')], BUS_TEST),
    ('B3', 'the early events have no cap', [(BUS, "    while (early.length > HELD_LIMIT) early.shift();\n", '')], BUS_TEST),
    ('B4', 'the cap drops the newest early event', [(BUS, 'early.length > HELD_LIMIT) early.shift();', 'early.length > HELD_LIMIT) early.pop();')], BUS_TEST),
    ('B5', 'the early events are handed over twice', [(BUS, 'return early.splice(0, early.length);', 'return early.slice();')], BUS_TEST),
    ('B6', 'events are kept early even with a controller installed', [(BUS,
     "  if (analytics === null) {\n    early.push(cleaned);\n",
     "  early.push(cleaned);\n  if (analytics === null) {\n")], BUS_TEST),
    ('A1', "the app's install drops what was tracked before it", [(APPA, "  for (const event of takeEarlyEvents()) created.track(event.name, event.properties);\n", '')], APPA_TEST),
    # The controller: the screen on display when the answer turns yes (1D-T6's review, m3).
    ('C1', 'the screen on display is not sent at yes', [(CTRL, "    if (entering && onDisplay !== null) client?.screen(onDisplay, payload({}));\n", '')], CTRL_TEST),
    ('C2', 'the screen on display is sent again at every refresh', [(CTRL, 'if (entering && onDisplay !== null) client?.screen', 'if (onDisplay !== null) client?.screen')], CTRL_TEST),
    ('C3', 'a screen with no pattern leaves the last named one on display', [(CTRL,
     "      onDisplay = screenPattern(segments);\n      if (current !== 'yes' || onDisplay === null) return;\n      client?.screen(onDisplay, payload({}));\n",
     "      const pattern = screenPattern(segments);\n      if (pattern !== null) onDisplay = pattern;\n      if (current !== 'yes' || pattern === null) return;\n      client?.screen(pattern, payload({}));\n")], CTRL_TEST),
    ('C4', 'a screen is sent before yes', [(CTRL, "if (current !== 'yes' || onDisplay === null) return;", 'if (onDisplay === null) return;')], CTRL_TEST),
    # recordProps.
    ('R1', 'no category reads as custom', [(PROPS, "  if (categoryId === null || categoryId === undefined) return null;\n", '')], PROPS_TEST),
    ('R2', 'an unknown category is null', [(PROPS, "  return 'custom';\n}", "  return null;\n}")], PROPS_TEST),
    ('R3', "the category's name instead of its key (the plan's mutant)", [(PROPS, 'return analyticsCategoryKey(category);', 'return category.label ?? category.builtin_key;')], PROPS_TEST),
    ('R4', "an edit's new category is ignored", [(PROPS, 'changes?.category_id ?? record.category_id', 'record.category_id')], PROPS_TEST),
    # syncTelemetry.
    ('S1', "every failing outcome counts, not only entering (the plan's mutant)", [(STEL, 'if (FAILING.has(next.status) && (before === null || !FAILING.has(before))) {', 'if (FAILING.has(next.status)) {')], STEL_TEST),
    ('S2', 'a pause is not a failure', [(STEL, "new Set<SyncStatus>(['waiting', 'paused'])", "new Set<SyncStatus>(['waiting'])")], STEL_TEST),
    ('S3', 'a failure as the first outcome is not counted', [(STEL, '(before === null || !FAILING.has(before))', '(before !== null && !FAILING.has(before))')], STEL_TEST),
    ('S4', 'an outcome without a code sends no reason', [(STEL, "reason_code: next.reason ?? 'LOCAL_ERROR'", 'reason_code: next.reason as string')], STEL_TEST),
    ('S5', 'every resync_pending counts', [(STEL, "if (next.status === 'resync_pending' && before !== 'resync_pending') {", "if (next.status === 'resync_pending') {")], STEL_TEST),
    ('S6', 'pacing counts as a failure', [(STEL, "new Set<SyncStatus>(['waiting', 'paused'])", "new Set<SyncStatus>(['waiting', 'paused', 'rate_limited'])")], STEL_TEST),
    # The engine's reason.
    ('E1', "the outcome never names the run's failure", [(ENG, 'return summarize(status, progress, run.failed?.code ?? null);', 'return summarize(status, progress);')], ENG_TEST),
    ('E2', 'a run that did not run names a failure', [(ENG, 'reason: string | null = null', "reason: string | null = 'LOCAL_ERROR'")], ENG_TEST),
    # The device sync's report.
    ('D1', 'the outcome goes to the diary with no events', [(DEV, 'onOutcome: reportingSyncEvents(report.outcome),', 'onOutcome: report.outcome,')], DEV_TEST),
    ('D2', 'the previous outcome is never kept', [(DEV, "    previous = outcome;\n    report(outcome);\n", "    report(outcome);\n")], DEV_TEST),
    ('D3', 'the diary never hears the outcome', [(DEV, "    previous = outcome;\n    report(outcome);\n", "    previous = outcome;\n")], DEV_TEST),
    ('D4', 'resync_required is never sent', [(DEV, "      else trackResyncRequired();\n", '')], DEV_TEST),
    # Permissions.
    ('P1', 'a grant counts as denied', [(PERM, "  if (input.outcome === 'deny') trackPermissionDenied({ permission: input.permission });", "  trackPermissionDenied({ permission: input.permission });")], PERM_TEST),
    ('P2', 'every denial is the camera', [(PERM, 'trackPermissionDenied({ permission: input.permission });', "trackPermissionDenied({ permission: 'camera' });")], PERM_TEST),
    # The save rule (entrySave's finish).
    ('Q1', 'finish sends no record_saved', [(SAVE, SAVED_CALL, '')], QA_SAVE),
    ('Q2', 'offline ignores the last sync', [(SAVE, "const offline = via === 'device' && diaryView.outcome?.status !== 'synced';", "const offline = via === 'device';")], QA_OFFLINE),
    ('Q3', 'offline ignores where the save stayed', [(SAVE, "const offline = via === 'device' && diaryView.outcome?.status !== 'synced';", "const offline = diaryView.outcome?.status !== 'synced';")], QA_SAVE),
    ('Q4', 'seconds_to_save is always 0', [(SAVE, 'secondsToSave: (Date.now() - track.openedAt) / 1000 }', 'secondsToSave: 0 }')], QA_ANOTHER),
    ('QE', "EQUIVALENT (the plan's): the save sends the amount and the note straight to the bus, which drops them", [
        (SAVE, "import { trackRecordSaved } from '@mobile/analytics/events';\n", "import { trackRecordSaved } from '@mobile/analytics/events';\nimport { trackClientEvent } from '@mobile/analytics/bus';\n"),
        (SAVE, SAVED_CALL,
         "      trackClientEvent('record_saved', { kind: fields.type, source: track.source, category_key: track.categoryKey, has_photo: false, offline, seconds_to_save: Math.min(3600, Math.max(0, Math.round((Date.now() - track.openedAt) / 1000))), amount_minor: fields.amountMinor, note: fields.note });\n"),
    ], QA_SAVE),
    # Quick add.
    ('QA1', 'opening the form starts no entry', [(QA, "  useEffect(() => {\n    trackRecordStarted({ source: 'typed' });\n  }, []);\n", '')], QA_SAVE),
    ('QA2', 'Add another starts no entry', [(QA, "    setFromBun(false);\n    trackRecordStarted({ source: 'typed' });\n", "    setFromBun(false);\n")], QA_ANOTHER),
    ('QA3', 'Add another keeps the first entry\'s clock', [(QA, "    setOpenedAt(Date.now());\n", '')], QA_ANOTHER),
    ('QA4', 'a Tell Bun draft still saves as typed', [(QA, "    setFromBun(true);\n", '')], QA_BUN),
    ('QA5', 'the entry after a Tell Bun save stays tell_bun', [(QA, "    setFromBun(false);\n    trackRecordStarted", "    trackRecordStarted")], QA_BUN),
    ('QA6', "the category's name instead of its key (the plan's mutant)", [(QA, QA_KEY,
     "categoryKey: (() => { const chosen = categories.find((category) => category.id === (current.type === 'transfer' ? null : current.categoryByType[current.type])); return chosen ? categoryName(chosen, tc) : null; })(),")], QA_SAVE),
    ('QA7', "record_saved from the render as well as from finish (the plan's mutant)", [
        (QA, "import { trackRecordStarted } from '@mobile/analytics/events';", "import { trackRecordSaved, trackRecordStarted } from '@mobile/analytics/events';"),
        (QA, "  const type: EntryType = current.type;\n", "  const type: EntryType = current.type;\n  trackRecordSaved({ kind: type, source: 'typed', categoryKey: null, offline: false, secondsToSave: 0 });\n"),
    ], QA_SAVE),
    # The record's rules.
    ('RA1', 'an acknowledged edit sends no record_edited', [(RA, "      trackRecordEdited(recordEventOf(draft.original, knownCategories(), result.changes));\n", '')], REC_EDIT),
    ('RA2', "an edit's new category is not passed", [(RA, 'recordEventOf(draft.original, knownCategories(), result.changes)', 'recordEventOf(draft.original, knownCategories())')], REC_CATEGORY),
    ('RA3', 'an acknowledged "use yours" sends no record_edited', [(RA, "      trackRecordEdited(recordEventOf(server, knownCategories(), sent.changes));\n", '')], REC_YOURS),
    ('RA4', 'a delete sends no record_deleted', [(RA, "      trackRecordDeleted(recordEventOf(record, knownCategories()));\n", '')], REC_DELETE),
    ('RA5', 'record_deleted before the acknowledgement', [(RA,
     "      const ack = await resources.deleteTransaction(record.id, record.version, key);\n      keys.settle(slot);\n      trackRecordDeleted(recordEventOf(record, knownCategories()));\n",
     "      trackRecordDeleted(recordEventOf(record, knownCategories()));\n      const ack = await resources.deleteTransaction(record.id, record.version, key);\n      keys.settle(slot);\n")], REC_DELETE),
    ('RA6', 'the undo bar sends record_restored', [(RA, 'const undo = deleted?.id === target.id;', 'const undo = false;')], REC_DELETE),
    ('RA7', 'Restore sends undo_used', [(RA, 'const undo = deleted?.id === target.id;', 'const undo = true;')], REC_RESTORE),
    ('RA8', 'undo_used before the acknowledgement', [(RA,
     "      await resources.restoreTransaction(target.id, target.version, key);\n      keys.settle(slot);\n" + RA_RESTORE_SENT,
     RA_RESTORE_SENT + "      await resources.restoreTransaction(target.id, target.version, key);\n      keys.settle(slot);\n")], REC_DELETE),
    ('RA9', 'the categories an event reads are none', [(RA, "(loaded.state === 'ready' ? loaded.categories : diaryView.categories);", '[];')], REC_EDIT),
    # Recently deleted.
    ('DD1', 'a restore sends no record_restored', [(DEL, "      trackRecordRestored({ kind: row.type });\n", '')], DEL_TEST),
    ('DD2', 'record_restored before the acknowledgement', [(DEL,
     "      await resources.restoreTransaction(row.recordId, row.version, key);\n      keys.settle(slot);\n      // Restore is this rule (1D-T7, R61): one record_restored, with the record's kind only.\n      trackRecordRestored({ kind: row.type });\n",
     "      trackRecordRestored({ kind: row.type });\n      await resources.restoreTransaction(row.recordId, row.version, key);\n      keys.settle(slot);\n")], DEL_TEST),
    # History.
    ('H1', 'a delete from History sends no record_deleted', [(HIST, "      trackRecordDeleted(recordEventOf(record, refs?.categories ?? diaryView.categories));\n", '')], HIST_TEST),
    ('H2', "History's undo sends no undo_used", [(HIST, "      trackUndoUsed({ kind: deleted.kind });\n", '')], HIST_TEST),
    ('H3', "History's undo_used before the acknowledgement", [(HIST,
     "      await resources.restoreTransaction(deleted.id, deleted.version, key);\n      keys.settle(slot);\n      trackUndoUsed({ kind: deleted.kind });\n",
     "      trackUndoUsed({ kind: deleted.kind });\n      await resources.restoreTransaction(deleted.id, deleted.version, key);\n      keys.settle(slot);\n")], HIST_TEST),
    # Home's first wallet.
    ('HM1', 'a first wallet Jotbun acknowledged sends no wallet_added', [(HOME, "      keys.settle('create');\n      trackWalletAdded({});\n      onCreated();\n", "      keys.settle('create');\n      onCreated();\n")], HOME_NEW),
    ('HM2', 'a first wallet met again sends no wallet_added', [(HOME, "        keys.settle('create');\n        trackWalletAdded({});\n", "        keys.settle('create');\n")], HOME_OWN),
    # Budget.
    ('BG1', 'an acknowledged budget sends no budget_set', [(BUD, "      unconfirmed.current = null;\n      trackBudgetSet({ set: true });\n      onSaved();\n", "      unconfirmed.current = null;\n      onSaved();\n")], BUD_SAVE),
    ('BG2', 'a budget Jotbun already holds sends no budget_set', [(BUD, "            trackBudgetSet({ set: true });\n            onSaved();\n            return;\n", "            onSaved();\n            return;\n")], BUD_SAME),
    ('BG3', 'budget_set before the acknowledgement', [(BUD,
     "      await resources.setBudget(month, command.input, key, command.existing);\n      keys.settle(slot);\n      unconfirmed.current = null;\n      trackBudgetSet({ set: true });\n",
     "      trackBudgetSet({ set: true });\n      await resources.setBudget(month, command.input, key, command.existing);\n      keys.settle(slot);\n      unconfirmed.current = null;\n")], BUD_SAVE),
    # Onboarding.
    ('O1', 'no story step is counted', [(ONB, "    trackOnboardingStepViewed({ step: step === 'first-coffee' ? 'first_coffee' : step });\n", '')], ONB_TEST),
    ('O2', 'first-coffee is sent as the route spells it', [(ONB, "{ step: step === 'first-coffee' ? 'first_coffee' : step }", '{ step }')], ONB_TEST),
    ('O3', 'a step is counted at every render', [(ONB, "    trackOnboardingStepViewed({ step: step === 'first-coffee' ? 'first_coffee' : step });\n  }, [step]);\n", "    trackOnboardingStepViewed({ step: step === 'first-coffee' ? 'first_coffee' : step });\n  });\n")], ONB_TEST),
    # P2-T25's confirming review, m1: the route's wallet branch (app/spend/deleted.tsx, unchanged by this task).
    ('X3a', 'the route never shows the wallet screen', [(ROUTE, "{isRedesignEnabled('wallet') ? <WalletDeletedScreen /> : <RecentlyDeletedScreen />}", '<RecentlyDeletedScreen />')], ROUTES_TEST),
    ('X3b', 'the route draws the wallet screen outside the shared resources', [(ROUTE, "  return (\n    <SpendV1Provider", "  if (isRedesignEnabled('wallet')) return <WalletDeletedScreen />;\n  return (\n    <SpendV1Provider")], ROUTES_TEST),
]

EQUIVALENT = {'QE'}


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def source_of(rel: str) -> Path:
    real = KIT / 'real' / rel
    return real if real.exists() else KIT / 'mutbase' / rel


def command(test):
    kind, files, name = test
    if kind == 'node':
        return ['node', 'scripts/test-unit.mjs', *files]
    cmd = ['npx', 'vitest', 'run', '--config', 'vitest.render.config.ts', *files]
    if name:
        cmd += ['-t', name]
    return cmd


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--tree', required=True)
    parser.add_argument('--out', required=True)
    parser.add_argument('--only', nargs='*')
    args = parser.parse_args()
    tree = Path(args.tree).resolve()
    out = Path(args.out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    ids = [m[0] for m in MUTANTS]
    if len(set(ids)) != len(ids):
        print('duplicate mutant ids')
        return 2
    survivors, unrestored, equivalent, killed = [], [], [], 0
    chosen = [m for m in MUTANTS if not args.only or m[0] in args.only]
    for mid, what, edits, test in chosen:
        files = sorted({rel for rel, _old, _new in edits})
        if any(sha(tree / rel) != sha(source_of(rel)) for rel in files):
            print(f'{mid} NOT RUN: a file differs from the kit before the mutant')
            unrestored.append(mid)
            continue
        texts = {rel: (tree / rel).read_text(encoding='utf-8') for rel in files}
        bad = False
        for rel, old, new in edits:
            count = texts[rel].count(old)
            if count != 1:
                print(f'{mid} BAD MUTANT: its old text occurs {count} times in {rel}')
                bad = True
                break
            texts[rel] = texts[rel].replace(old, new)
        if bad:
            survivors.append(mid)
            continue
        for rel in files:
            (tree / rel).write_text(texts[rel], encoding='utf-8')
        log = out / f'{mid}.log'
        try:
            with log.open('w', encoding='utf-8') as sink:
                done = subprocess.run(command(test), cwd=tree / 'apps/app', stdout=sink, stderr=subprocess.STDOUT, timeout=600)
            rc = done.returncode
        except subprocess.TimeoutExpired:
            rc = 124
        finally:
            for rel in files:
                shutil.copyfile(source_of(rel), tree / rel)
        restored = all(sha(tree / rel) == sha(source_of(rel)) for rel in files)
        if not restored:
            unrestored.append(mid)
        body = log.read_text(encoding='utf-8', errors='replace')
        if rc == 0:
            if mid in EQUIVALENT:
                equivalent.append(mid)
                verdict = 'SURVIVED (equivalent, as the plan says)'
            else:
                survivors.append(mid)
                verdict = 'SURVIVED'
        else:
            if mid in EQUIVALENT:
                survivors.append(mid)
                verdict = 'KILLED, BUT IT SHOULD BE EQUIVALENT'
            else:
                killed += 1
                verdict = 'killed (assertion)' if ('AssertionError' in body or 'ERR_ASSERTION' in body) else 'killed (error)'
        where = ', '.join(files)
        print(f'{mid} {verdict}: {what} [{where}] rc={rc}; restored {"sha256 equal" if restored else "NOT EQUAL"}', flush=True)
    expected = len([m for m in chosen if m[0] not in EQUIVALENT])
    print(f'{killed} of {expected} killed; equivalent {equivalent}; survivors {survivors}; not restored {unrestored}')
    return 0 if not survivors and not unrestored and killed == expected else 1


if __name__ == '__main__':
    sys.exit(main())
