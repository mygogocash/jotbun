#!/usr/bin/env python3
"""1B-T11 mutation check. Applies each mutant (one or more exact text
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
RT = 'src/vault/retention.ts'
UV = 'src/vault/user-vault.ts'
EX = 'src/vault/commands/executor.ts'
SN = 'src/vault/files/snapshots.ts'
MG = 'src/vault/migrations/0003_alarm_indexes.sql'

ALARM = 'files-alarm.test.ts'
SNAP = 'snapshots.test.ts'
RET = 'retention.test.ts'


def case(file: str, name: str) -> str:
    return f'{file}: {name}'


# The plan's cases (A1 to A10), the controller's notes (A11 to A18) and the brief's rulings (A19 to A24).
NEVER_PUBLISHED = case(ALARM, 'a key whose writer never published it is deleted by the alarm at its deadline')
EXPORT_EXPIRES = case(ALARM, 'an export file is deleted by the alarm when it expires, and its status reads expired')
SLEPT = case(ALARM, 'work requested before the vault slept is started by its alarm after it wakes')
FAILED_START = case(ALARM, 'a failed start is retried a minute later, not in a loop')
CAPPED = case(ALARM, 'a capped run leaves the alarm set, and the next alarm clears the rest')
THROWING_PRUNE = case(ALARM, 'a prune that throws is logged, the others still run, and the alarm is set again')
EARLIEST = case(ALARM, 'the alarm follows the earliest of the core and file jobs')
R37 = case(ALARM, 'after any alarm, every scheduled time is later than now')
EXPORT_PURGE = case(ALARM, 'export requests are purged 30 days after the request; the receipt stays compact')
UPLOAD_ROWS = case(ALARM, 'drops finished upload rows 30 days after they ended, never one still receiving or within the quota window')
RESEND = case(ALARM, 'a resent snapshot request after its snapshot went stale reads expired and starts nothing; a new key builds a new one')
INACTIVE = case(ALARM, 'a vault that is not active runs no file job and keeps no alarm for them')
UPLOAD = case(ALARM, 'an upload arms the alarm though it commits no command')
ONE_RUN = case(ALARM, 'only one file run at a time: a second run while the first waits on R2 deletes nothing')
UNBOUND = case(ALARM, 'an unbound bucket is a failed delete, due again a minute later; the alarm never throws')
INDEXES = case(ALARM, "the alarm's due-time read of deleted records and the purge's change lookup use their indexes")
KEEPS_THROWING = case(ALARM, 'a prune that keeps throwing brings the alarm back a minute later, never in a loop')
FAILED_WRITE = case(ALARM, 'after a failed job the alarm comes back a minute later, and a write in between does not bring it sooner')
WRITE_FLOOR = case(ALARM, 'a write never sets the alarm sooner than a minute ahead, even with work already due, and a later write never postpones it')
MIRROR = case(ALARM, 'the vault knows the alarm it set: alarmAt matches getAlarm() after a write, an alarm, a wake and an erase')
FAILED_EXPORT = case(ALARM, 'a background step that writes moves the alarm: a failed export is due only at its purge')
START_MOVES = case(ALARM, 'a start moves the alarm on, from the alarm or from the Worker')
# 1B-T8's cases this task changes (the m-1 fix), and 1A-T8b's alarm cases.
SNAP_TOMBSTONES = case(SNAP, 'tombstones reach delta readers, older cursors resync, and snapshots built before the purge are dropped')
SNAP_R37 = case(SNAP, 'after pruneSnapshots at snapshotsDueAt, the next snapshotsDueAt is later or null')
SNAP_PRUNE = case(SNAP, 'pruneSnapshots fails a snapshot left pending for a day, drops one read below the purge watermark, and deletes one a week past its expiry')
RET_FOLLOWS = case(RET, 'a deleted record is purged by the alarm 30 days later, and the alarm follows the earliest job')
RET_FAILING = case(RET, 'a failing step is reported and does not stop the others')

PRUNE_TRY = """      try {
        prune(c)
      } catch (error) {
        fail('prune_files', 'file_prune_failed', error)
      }
"""
DELETE_ARGS = """        {
          context: () => v.fileContext(),
          get bucket() {
            return v.bucket
          },
        },
"""
REARMING_BODY = """    try {
      return await work(() => {
        const c = this.fileContext()
        seen.push(c)
        return c
      })
    } finally {
      if (seen.some((c) => c.touched === true)) this.rearm(this.fileContext())
    }
"""
REARMING_ON_SUCCESS = """    const result = await work(() => {
      const c = this.fileContext()
      seen.push(c)
      return c
    })
    if (seen.some((c) => c.touched === true)) this.rearm(this.fileContext())
    return result
"""
CALL_BLOCK = """        const result = handler(c, call)
        return { reply: result, touched: c.touched === true ? c : undefined }
"""
CALL_BLOCK_BY_REVISION = """        const revision = () => c.sql.exec<{ r: string }>('SELECT CAST(revision AS TEXT) AS r FROM sync_state WHERE id = 1').toArray()[0]?.r
        const before = revision()
        const result = handler(c, call)
        return { reply: result, touched: revision() !== before ? c : undefined }
"""

# label, what it changes, file, edits, required failing cases, test files to run
MUTANTS = [
    # The plan's six (Step 5).
    ('M1', 'start_work ignores lastStartAttemptMs', JB,
     [('  const start = startDueAt(c, lastStartAttemptMs)\n', '  const start = startDueAt(c, null)\n')], {FAILED_START}, [ALARM]),
    ('M2', 'fileJobsDue is left out of reschedule', RT,
     [('  const due = new Map<string, number>([...nextDue(c), ...fileJobsDue(c, lastStartAttemptMs)])\n', '  const due = new Map<string, number>([...nextDue(c)])\n')], {SLEPT, R37, CAPPED}, [ALARM]),
    ('M3', 'prune_files is timed from a fixed daily period, not the five due times', JB,
     [("  if (prunes.length > 0) due.set('prune_files', Math.min(...prunes))\n", "  due.set('prune_files', c.now.getTime() + 86_400_000)\n")], {R37}, [ALARM]),
    ('M4', 'rearm never updates alarmAt (ruling P9: the mirror case, not the earliest-job case)', UV,
     [('      this.alarmAt = at\n', '')], {MIRROR}, [ALARM]),
    ('M5', 'alarm() keeps alarmAt', UV,
     [('    if (this.erased) return\n    this.alarmAt = null\n', '    if (this.erased) return\n')], {CAPPED}, [ALARM]),
    ('M6', "a prune's error escapes runFileJobs", JB,
     [(PRUNE_TRY, '      prune(c)\n')], {THROWING_PRUNE}, [ALARM]),
    # runFileJobs and fileJobsDue (J).
    ('J1', 'fileJobsDue ignores the active check', JB,
     [('  if (!isActive(c)) return due\n', '')], {INACTIVE}, [ALARM]),
    ('J2', 'runFileJobs ignores the active check', JB,
     [('    if (!v.isActive(c)) return failed\n', '')], {INACTIVE}, [ALARM]),
    ('J3', 'a second run overlaps the first (no one-run guard)', JB,
     [('  if (v.erased || running.has(v)) return []\n', '  if (v.erased) return []\n')], {ONE_RUN}, [ALARM]),
    ('J4', 'the bucket is read when the delete is called, outside its try', JB,
     [(DELETE_ARGS, '        { context: () => v.fileContext(), bucket: v.bucket },\n')], {UNBOUND}, [ALARM]),
    ('J5', 'the alarm never starts work', JB,
     [('      if (due !== null && due <= s.now.getTime()) await v.startPendingWork()\n', '')], {FAILED_START, SLEPT}, [ALARM]),
    ('J6', 'a failed file job is not reported to the alarm', JB,
     [('    if (!failed.includes(job)) failed.push(job)\n', '')], {KEEPS_THROWING}, [ALARM]),
    ('J7', 'reschedule never removes a file job with nothing to do', RT,
     [('  for (const job of [...RETENTION_JOBS, ...FILE_JOBS]) {\n', '  for (const job of [...RETENTION_JOBS, ...fileJobsDue(c, lastStartAttemptMs).keys()]) {\n')], {INACTIVE}, [ALARM]),
    # UserVault (U).
    ('U1', 'call() rearms only when the revision moved (1A-T8b rule)', UV,
     [(CALL_BLOCK, CALL_BLOCK_BY_REVISION)], {UPLOAD}, [ALARM]),
    ('U2', 'a short-block background method does not rearm', UV,
     [('    if (c.touched === true) this.rearm(c)\n', '')], {FAILED_EXPORT}, [ALARM]),
    ('U3', 'a writer (writeExport, buildSnapshot, startPendingWork) does not rearm', UV,
     [('      if (seen.some((c) => c.touched === true)) this.rearm(this.fileContext())\n', '')], {NEVER_PUBLISHED, EXPORT_EXPIRES, EARLIEST, START_MOVES}, [ALARM]),
    ('U4', 'a writer rearms only when it did not throw', UV,
     [(REARMING_BODY, REARMING_ON_SUCCESS)], {NEVER_PUBLISHED}, [ALARM]),
    ('U5', 'the constructor does not read the alarm', UV,
     [('      this.alarmAt = await ctx.storage.getAlarm()\n', '')], {MIRROR}, [ALARM]),
    ('U6', 'erase() keeps alarmAt', UV,
     [('    this.erased = true\n    this.alarmAt = null\n', '    this.erased = true\n')], {MIRROR}, [ALARM]),
    ('U7', 'a write rearms with no delay', UV,
     [('  rearm(c: FileContext, delayMs: number = CALL_ALARM_DELAY_MS): void {\n', '  rearm(c: FileContext, delayMs: number = 0): void {\n')], {WRITE_FLOOR, FAILED_WRITE}, [ALARM]),
    ('U8', 'a write postpones an alarm already set sooner (no keep)', UV,
     [('      if (at !== null && due !== null && at > due && this.alarmAt !== null && this.alarmAt < at) at = this.alarmAt\n', '')], {WRITE_FLOOR, FAILED_WRITE}, [ALARM]),
    ('U9', 'the alarm rearms with no delay after a failed job', UV,
     [('this.rearm(this.fileContext(), failed ? RETENTION_RETRY_MS : 0)', 'this.rearm(this.fileContext(), 0)')], {KEEPS_THROWING, FAILED_WRITE}, [ALARM]),
    ('U10', "the alarm rearms with a write's delay", UV,
     [('this.rearm(this.fileContext(), failed ? RETENTION_RETRY_MS : 0)', 'this.rearm(this.fileContext(), failed ? RETENTION_RETRY_MS : CALL_ALARM_DELAY_MS)')], {CAPPED}, [ALARM]),
    ('U11', "the rearm's floor leaves out the clock", UV,
     [('Math.max(due, c.now.getTime() + delayMs)', 'Math.max(due, delayMs)')], {WRITE_FLOOR}, [ALARM]),
    ('U12', 'the alarm does not run the file jobs', UV,
     [('      failed = (await runFileJobs(this, this.fileJobOptions)).length > 0 || failed\n', '')], {NEVER_PUBLISHED, EXPORT_EXPIRES, SLEPT, R37, EXPORT_PURGE, UPLOAD_ROWS, RESEND}, [ALARM]),
    ('U13', 'the alarm reads this.bucket before its try', UV,
     [('    if (this.erased) return\n    this.alarmAt = null\n', '    if (this.erased) return\n    void this.bucket\n    this.alarmAt = null\n')], {UNBOUND}, [ALARM]),
    # runCommand (E).
    ('E1', 'a committed command does not touch the context', EX,
     [('  touch(c)\n  return ack\n', '  return ack\n')], {RET_FOLLOWS, MIRROR}, [ALARM, RET]),
    # The m-1 fix (S).
    ('S1', 'pruneSnapshots deletes a stale snapshot row (1B-T8 as merged)', SN,
     [('    const released = c.sql.exec(`DELETE FROM ${STALE_CHUNKS} RETURNING snapshot_id`).toArray()\n',
       '    const released = c.sql.exec(`DELETE FROM snapshots WHERE ${BELOW_WATERMARK} RETURNING id`).toArray()\n')], {RESEND, SNAP_TOMBSTONES, SNAP_PRUNE}, [ALARM, SNAP]),
    ('S2', 'snapshotsDueAt answers now for a stale row whose chunks are released', SN,
     [('              EXISTS (SELECT 1 FROM ${STALE_CHUNKS}) AS stale,\n', '              (SELECT count(*) FROM snapshots WHERE ${BELOW_WATERMARK}) AS stale,\n')], {SNAP_R37}, [SNAP]),
    ('S3', "a stale snapshot's chunk keys are not made due", SN,
     [("    c.sql.exec(`UPDATE vault_objects SET delete_after = 0 WHERE status <> 'tombstone' AND key IN (SELECT object_key FROM ${STALE_CHUNKS})`)\n", '')], {SNAP_TOMBSTONES, SNAP_PRUNE}, [SNAP]),
    # The indexes (X).
    ('X1', 'no transactions_deleted_idx', MG,
     [('CREATE INDEX transactions_deleted_idx ON transactions (deleted_at) WHERE deleted_at IS NOT NULL;\n--> statement-breakpoint\n', '')], {INDEXES}, [ALARM]),
    ('X2', 'no entity_changes_entity_idx', MG,
     [('\n--> statement-breakpoint\nCREATE INDEX entity_changes_entity_idx ON entity_changes (entity, entity_id);\n', '\n')], {INDEXES}, [ALARM]),
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
    for file in (ALARM, SNAP, RET):
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
