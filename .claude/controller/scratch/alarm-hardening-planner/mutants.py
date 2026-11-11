#!/usr/bin/env python3
"""alarm-hardening mutation check. Applies each mutant (one or more exact text
replacements in one file), runs the workers files it names (by default
test/workers/files-alarm.test.ts), restores the file byte for byte, and reports
the failing cases.

Usage (take the heavy lock first, release it after):
  python3 -I mutants.py <apps/edge directory> <scratch directory> [LABEL ...]
  python3 -I mutants.py --check <apps/edge directory>   (no lock needed: checks
      that each mutant's old text occurs exactly once in its file, and that
      every required case name is a case of its test file)

The scratch directory receives the backup (mutant.keep) and one log per mutant
under mutant-logs/. Exit status 1 if a mutant fails to apply, a restore differs
from the backup, or a mutant leaves any of its REQUIRED cases passing.
"""
import filecmp
import os
import re
import shutil
import subprocess
import sys

JB = 'src/vault/files/jobs.ts'
UV = 'src/vault/user-vault.ts'
AT = 'src/vault/files/attachments.ts'
PV = 'src/vault/files/previews.ts'
MG = 'src/vault/migrations/0004_alarm_bounds.sql'
SC = 'src/vault/schema.ts'

ALARM = 'files-alarm.test.ts'
SCHEMA = 'vault-schema.test.ts'


def case(file: str, name: str) -> str:
    return f'{file}: {name}'


R37 = case(ALARM, 'after any alarm, every scheduled time is later than now')
ONE_RUN = case(ALARM, 'only one file run at a time: a second run while the first waits on R2 deletes nothing')
M1 = case(ALARM, 'an import purge in the same alarm releases a ready snapshot it makes stale, so no job is left due at the vault clock')
PA = case(ALARM, 'a delete whose own block throws is reported to the alarm, which comes back a minute later, not at once')
PG = case(ALARM, 'an alarm that finds another file run in progress reports its delete as failed, so it comes back a minute later')
N2_SET = case(ALARM, 'a setAlarm the storage refuses is logged and forgotten, so the next rearm sets the alarm again')
N2_LATE = case(ALARM, 'a refusal that lands after a later rearm leaves that alarm alone, and a refused deleteAlarm is logged')
PH = case(ALARM, 'a schedule write that fails after a call committed is logged, and the call still answers its success')
PE = case(ALARM, 'a background write that makes work due at once still waits the write floor (R104 through background())')
PF = case(ALARM, 'a start through rearming() that makes work due at once still waits the write floor (R104 through rearming())')
ROWS = case(ALARM, 'the due-time reads after a write read as many rows with a hundred held receipts and purged import records as with none')
CHECKS = case(ALARM, 'a receipt left with no holder is due at once however it lost its holder, and the prune that releases it empties the checks')
BACKFILL = case(ALARM, 'a vault upgraded from 0003 starts its checks with the receipts that already have no holder')
IMPORTS = case(ALARM, 'importsDueAt counts the live import records only: a purged one is skipped, a live selection counts')
TABLES = case(SCHEMA, 'a new vault has every core table, migrated once')

ORDER = """export const FILE_PRUNES: readonly FilePrune[] = [
  (c) => pruneUploads(c),
  (c) => pruneExports(c),
  (c) => pruneAttachments(c),
  (c) => pruneImports(c),
  (c) => pruneSnapshots(c),
]
"""
OLD_ORDER = """export const FILE_PRUNES: readonly FilePrune[] = [
  (c) => pruneUploads(c),
  (c) => pruneExports(c),
  (c) => pruneSnapshots(c),
  (c) => pruneAttachments(c),
  (c) => pruneImports(c),
]
"""
CATCH = """      void settled.catch((error: unknown) => {
        logFailure('vault_alarm_unset', error)
        if (this.alarmAt === at) this.alarmAt = null
      })
"""
NET = "\n           OR EXISTS (SELECT 1 FROM attachment_checks k CROSS JOIN attachments ON attachments.id = k.attachment_id WHERE ${UNHELD}) AS waiting,"
STAMP = "`SELECT EXISTS (SELECT 1 FROM attachments WHERE status = 'released' AND released_at IS NULL)\n           OR EXISTS"


def trigger(name: str, table: str, event: str, when: str, value: str) -> str:
    when_line = f'\n  {when}' if when else ''
    return f"""CREATE TRIGGER {name} {event} ON {table}{when_line}
BEGIN
  INSERT OR IGNORE INTO attachment_checks (attachment_id) VALUES ({value});
END;
--> statement-breakpoint
"""


MUTANTS = [
    # jobs.ts: m1, m2 and n1.
    ('J1', 'pruneSnapshots back before pruneAttachments and pruneImports (m1)', JB, [(ORDER, OLD_ORDER)], {R37, M1}, [ALARM]),
    ('J2', 'a held one-run guard reports success again (n1)', JB, [("    return ['delete_objects']\n  }\n  running.add(v)\n", "    return []\n  }\n  running.add(v)\n")], {PG, ONE_RUN}, [ALARM]),
    ('J3', 'a held one-run guard is not logged (n1)', JB, [("    logFailure('file_run_held', new Error('another file run is in progress'))\n", '')], {PG}, [ALARM]),
    ('J4', "a delete's throw is logged but not reported to the alarm (m2; the alarm lens's R1)", JB, [("      fail('delete_objects', 'file_delete_failed', error)\n", "      logFailure('file_delete_failed', error)\n")], {PA}, [ALARM]),
    # user-vault.ts: n2, n3 and n4.
    ('U1', "rearm's setAlarm and deleteAlarm left unhandled again (n2)", UV, [(CATCH, '      void settled\n')], {N2_SET, N2_LATE}, [ALARM]),
    ('U2', 'a refused alarm is logged but alarmAt keeps it (n2)', UV, [("        if (this.alarmAt === at) this.alarmAt = null\n", '')], {N2_SET}, [ALARM]),
    ('U3', 'a refused alarm clears alarmAt even after a later rearm replaced it (n2)', UV, [("        if (this.alarmAt === at) this.alarmAt = null\n", '        this.alarmAt = null\n')], {N2_LATE}, [ALARM]),
    ('U4', 'a refused alarm is forgotten but not logged (n2)', UV, [("      void settled.catch((error: unknown) => {\n        logFailure('vault_alarm_unset', error)\n", "      void settled.catch((error: unknown) => {\n        void error\n")], {N2_SET, N2_LATE}, [ALARM]),
    ('U5', "rearm throws a failure instead of logging it (n3; the alarm lens's R11)", UV, [("    } catch (error) {\n      logFailure('vault_alarm_unset', error)\n    }\n  }\n", "    } catch (error) {\n      throw error\n    }\n  }\n")], {PH}, [ALARM]),
    ('U6', "background() rearms with no write floor (n4; the alarm lens's R2)", UV, [('    if (c.touched === true) this.rearm(c)\n', '    if (c.touched === true) this.rearm(c, 0)\n')], {PE}, [ALARM]),
    ('U7', "rearming() rearms with no write floor (n4; the alarm lens's R3)", UV, [('      if (seen.some((c) => c.touched === true)) this.rearm(this.fileContext())\n', '      if (seen.some((c) => c.touched === true)) this.rearm(this.fileContext(), 0)\n')], {PF}, [ALARM]),
    # attachments.ts: m4.
    ('A1', "attachmentsDueAt without the safety net (m4; the 1B-T9 review's X5)", AT, [(NET, ' AS waiting,')], {CHECKS, BACKFILL}, [ALARM]),
    ('A2', 'the safety net reads every retained receipt again (m4)', AT, [('attachment_checks k CROSS JOIN attachments ON attachments.id = k.attachment_id WHERE ${UNHELD}', 'attachments WHERE ${UNHELD}')], {ROWS}, [ALARM]),
    ('A3', 'the safety net joins without CROSS JOIN, so the planner reads attachments first (m4)', AT, [('attachment_checks k CROSS JOIN attachments', 'attachment_checks k JOIN attachments')], {ROWS}, [ALARM]),
    ('A4', 'pruneAttachments leaves the checks (m4)', AT, [("    c.sql.exec('DELETE FROM attachment_checks').toArray()\n", '')], {CHECKS, ROWS}, [ALARM]),
    ('A5', 'attachmentsDueAt without the stamp a released receipt waits for (m4: the term moved)', AT, [(STAMP, '`SELECT EXISTS')], {CHECKS}, [ALARM]),
    # previews.ts: m4.
    ('P1', 'the import read joins without CROSS JOIN, so the planner walks every change of the two entities (m4)', PV, [('                 CROSS JOIN entity_changes g ON', '                 JOIN entity_changes g ON')], {ROWS}, [ALARM]),
    ('P2', "the live import heads without the purged state (m4)", PV, [("const LIVE_IMPORT_HEADS = `h.entity IN ('${SELECTION_ENTITY}', '${REVIEW_ENTITY}') AND h.state <> 'purged'`", "const LIVE_IMPORT_HEADS = `h.entity IN ('${SELECTION_ENTITY}', '${REVIEW_ENTITY}')`")], {ROWS, IMPORTS}, [ALARM]),
    ('P3', 'the live import heads without the selections (m4)', PV, [("const LIVE_IMPORT_HEADS = `h.entity IN ('${SELECTION_ENTITY}', '${REVIEW_ENTITY}')", "const LIVE_IMPORT_HEADS = `h.entity IN ('${REVIEW_ENTITY}')")], {IMPORTS}, [ALARM]),
    ('P4', "the entity names in the other order, so the WHERE no longer matches the index's (m4)", PV, [("h.entity IN ('${SELECTION_ENTITY}', '${REVIEW_ENTITY}')", "h.entity IN ('${REVIEW_ENTITY}', '${SELECTION_ENTITY}')")], {ROWS}, [ALARM]),
    # 0004: m4.
    ('M1', 'no check when a retained receipt is inserted (m4)', MG, [(trigger('attachments_checked_insert', 'attachments', 'AFTER INSERT', "WHEN NEW.status = 'retained'", 'NEW.id'), '')], {CHECKS}, [ALARM]),
    ('M2', 'no check when a receipt is set back to retained (m4)', MG, [(trigger('attachments_checked_update', 'attachments', 'AFTER UPDATE OF id, status', "WHEN NEW.status = 'retained'", 'NEW.id'), '')], {CHECKS}, [ALARM]),
    ('M3', 'no check when a holder is deleted (m4)', MG, [(trigger('transaction_attachments_checked_delete', 'transaction_attachments', 'AFTER DELETE', '', 'OLD.attachment_id'), '')], {CHECKS}, [ALARM]),
    ('M4', 'no check when a holder moves to another receipt (m4)', MG, [(trigger('transaction_attachments_checked_update', 'transaction_attachments', 'AFTER UPDATE OF attachment_id', 'WHEN OLD.attachment_id IS NOT NEW.attachment_id', 'OLD.attachment_id'), '')], {CHECKS}, [ALARM]),
    ('M5', 'an upgraded vault does not list the receipts that already have no holder (m4)', MG, [("INSERT INTO attachment_checks (attachment_id)\n  SELECT id FROM attachments\n   WHERE status = 'retained' AND NOT EXISTS (SELECT 1 FROM transaction_attachments ta WHERE ta.attachment_id = attachments.id);\n", 'SELECT 1;\n')], {BACKFILL}, [ALARM]),
    ('M6', 'no index on the live import heads (m4)', MG, [("CREATE INDEX entity_heads_imports_idx ON entity_heads (entity, entity_id)\n  WHERE entity IN ('import_selection', 'import_review') AND state <> 'purged';\n", 'SELECT 1;\n')], {ROWS}, [ALARM]),
    ('M7', 'the import index keeps the purged heads too (m4)', MG, [("  WHERE entity IN ('import_selection', 'import_review') AND state <> 'purged';\n", "  WHERE entity IN ('import_selection', 'import_review');\n")], {ROWS}, [ALARM]),
    # schema.ts: the table in the Drizzle schema.
    ('S1', 'attachment_checks missing from the Drizzle schema (VAULT_CORE_TABLES)', SC, [('  aiUsage,\n  attachmentChecks,\n  attachments,\n', '  aiUsage,\n  attachments,\n')], {TABLES}, [SCHEMA]),
]

FAILED = re.compile(r'^\s*×\s+test/(?:workers/)?(\S+)\s+>\s+(?:.+? > )?(.+?)(?:\s+\d+ms)?$')
# Each failed case also gets a FAIL block in the summary, which a reporter line lost in the output never hides.
FAIL_BLOCK = re.compile(r'^\s*FAIL\s+test/(?:workers/)?(\S+)\s+>\s+(?:.+? > )?(.+?)\s*$')
IT_NAME = re.compile(r"""^\s*it\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")""")


def case_names(edge: str, file: str) -> set:
    names = set()
    for line in open(os.path.join(edge, 'test/workers', file), encoding='utf-8'):
        match = IT_NAME.match(line)
        if match:
            raw = match.group(1) if match.group(1) is not None else match.group(2)
            names.add(case(file, raw.replace("\\'", "'").replace('\\"', '"')))
    return names


def run_focused(edge: str, files: list, log_path: str) -> tuple:
    # The output goes straight to the log file, as a shell redirect does: through a pipe, the verbose reporter's lines can go missing.
    with open(log_path, 'w') as log:
        subprocess.run(['npx', 'vitest', 'run', '--config', 'vitest.workers.config.ts', '--reporter=verbose', *[f'test/workers/{f}' for f in files]], cwd=edge, stdout=log, stderr=subprocess.STDOUT, timeout=1800)
    text = open(log_path, encoding='utf-8', errors='replace').read()
    failed = set()
    for line in text.splitlines():
        match = FAILED.match(line) or FAIL_BLOCK.match(line)
        if match:
            failed.add(f'{match.group(1)}: {match.group(2).strip()}')
    totals = re.search(r'^\s*Tests\s+(\d.+)$', text, re.MULTILINE)
    return failed, f'workers {totals.group(1).strip() if totals else "no totals"}'


def check(edge: str) -> int:
    ok = True
    names = set()
    for file in (ALARM, SCHEMA):
        names |= case_names(edge, file)
    labels = set()
    for label, _description, rel, edits, required, _files in MUTANTS:
        if label in labels:
            print(f'{label} is used twice')
            ok = False
        labels.add(label)
        text = open(os.path.join(edge, rel), encoding='utf-8').read()
        for old, new in edits:
            if text.count(old) != 1:
                print(f'{label} old text found {text.count(old)} times in {rel}')
                ok = False
            if old == new:
                print(f'{label} changes nothing')
                ok = False
        for name in sorted(required - names):
            print(f'{label} requires a case the test files do not have: {name}')
            ok = False
    print(f'{len(MUTANTS)} mutants, {len(names)} cases; old text found exactly once and every required case exists: {ok}')
    return 0 if ok else 1


def main() -> int:
    if sys.argv[1] == '--check':
        return check(sys.argv[2])
    edge, scratch = sys.argv[1], sys.argv[2]
    only = set(sys.argv[3:])
    os.makedirs(os.path.join(scratch, 'mutant-logs'), exist_ok=True)
    ok = True
    for label, description, rel, edits, required, files in MUTANTS:
        if only and label not in only:
            continue
        path = os.path.join(edge, rel)
        keep = os.path.join(scratch, 'mutant.keep')
        shutil.copyfile(path, keep)
        text = open(path, encoding='utf-8').read()
        if any(text.count(old) != 1 for old, _new in edits):
            print(f'{label} NOT APPLIED: an old text is not found exactly once in {rel}')
            ok = False
            continue
        for old, new in edits:
            text = text.replace(old, new)
        open(path, 'w', encoding='utf-8').write(text)
        try:
            failed, totals = run_focused(edge, files, os.path.join(scratch, 'mutant-logs', f'{label}.log'))
        finally:
            shutil.copyfile(keep, path)
        restored = filecmp.cmp(keep, path, shallow=False)
        missing = sorted(required - failed)
        verdict = 'KILLED' if not missing else 'SURVIVED'
        if missing or not restored:
            ok = False
        print(f'{label} {verdict} ({description}) [{totals}] restored={restored}', flush=True)
        for name in sorted(failed):
            print(f'    failed: {name}', flush=True)
        for name in missing:
            print(f'    REQUIRED BUT PASSED: {name}', flush=True)
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
