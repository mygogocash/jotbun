#!/usr/bin/env python3
"""1B-T6 mutation check. Applies each mutant to one file, runs the focused
files (the workers file test/workers/exports.test.ts, and the Node file
test/exports-port.test.ts), restores the file byte for byte, and reports the
failing tests.

Usage (take the heavy lock first, release it after):
  python3 -I mutants.py <apps/edge directory> <scratch directory> [LABEL ...]

The scratch directory receives the backup (mutant.keep) and one log per mutant.
Exit status 1 if a mutant fails to apply, a restore differs from the backup, or a
mutant leaves any of its REQUIRED tests passing.
"""
import filecmp
import os
import re
import shutil
import subprocess
import sys

EXPORTS = 'src/vault/files/exports.ts'
WORK = 'src/vault/files/work.ts'
WORKFLOW_FILE = 'src/background/export-workflow.ts'
DOWNLOADS = 'src/v1/files/downloads.ts'

F = 'exports.test.ts'
N = 'exports-port.test.ts'
FRESH_PROOF = f'{F}: needs a fresh export proof bound to its own command, and queues one owned job'
VALIDATES = f'{F}: validates the period like history, and refuses an unsupported schema before using the proof'
FIELDS = f'{F}: holds every income, expense and transfer field of the period exactly, and reconciles with history'
CONCURRENT = f'{F}: a concurrent edit during the export does not tear its one consistent view'
OVER_LIMIT = f'{F}: an export over its byte limit fails visibly and publishes nothing'
DELETED_MID = f'{F}: an account deleted mid-export publishes nothing, and the file it wrote is swept'
GRANTS = f'{F}: grants last five minutes; the file expires after 24 hours and the sweep deletes it'
FOUR = f'{F}: at most four export downloads run at once in a process; more are told to retry'
TOO_LARGE = f'{F}: a too-large export says why, and is not an operator alert'
MAX_TWO = f'{F}: an account can have at most two exports open; a third waits'
EXPIRED_FILE = f'{F}: an expired file is not served even while its grant and object remain'
TAMPERED = f'{F}: writes a requested export, streamed back with its length, and never serves a tampered file'
FIVE_MIN = f'{F}: an export needs a sign-in from the last five minutes, and a resent export still replays'
WORKFLOW = f'{F}: an export runs on ExportWorkflow and is ready to download'
WF_FAIL = f'{F}: an export whose write keeps failing is recorded failed after its retries'
STARTER = f'{F}: the export starter starts each pending export once on ExportWorkflow, and is due a minute after an unstarted request'
TWICE = f'{F}: an export started twice by overlapping runs is written once'
RF1 = f'{F}: an export that finishes after the vault stopped being active publishes nothing'
RETRIED = f'{F}: a write retried after its file was stored but before it was recorded completes'
DEADLINE = f'{F}: a write whose PUT ends past its own reservation deadline publishes nothing, even when a failed delete moved it on'
ONE_PUT = f'{F}: an export is stored with one put of one buffer, and nothing is left behind'
PRUNE = f'{F}: pruneExports purges an export 30 days after its request and fails one left pending for a day'
PRUNE_101 = f'{F}: pruneExports purges more exports at once than SQLite has parameters'
DUE_LATER = f'{F}: after pruneExports at exportsDueAt, the next exportsDueAt is later or null'
PORT_FILTER = f'{N}: reads an export period as ExportService does, refusals included'

FRESH_LINE = '    assertFreshSignIn(c.claims, Math.floor(c.now.getTime() / 1000))\n'
COMMAND_HEAD = """  return runCommand(c, { ...command, payload: snapshot }, () => {
    const { open } = c.sql.exec<{ open: number }>("SELECT count(*) AS open FROM exports WHERE status = 'pending'").one()
    if (open >= EXPORT_MAX_OPEN) throw new ProblemException(429, 'RATE_LIMITED', { retryAfterSeconds: 60 })
"""
PUBLISH_CHECK = "  if (!row || row.status !== 'pending' || !v.active(c)) return 'skipped'\n"
WORKFLOW_CATCH = """      logFailure('export_write_failed', error)
      await step.do('record the failure', async () => {
        await vaultById(this.env, p.vault).failExport(p.export)
        return { recorded: true }
      })
      return { outcome: 'failed' }
"""

# (label, description, file, old text (must occur exactly once), new text, tests that must fail)
MUTANTS = [
    ('M1', 'no assertFreshSignIn', EXPORTS, FRESH_LINE, '', {FRESH_PROOF, FIVE_MIN}),
    ('M2', 'freshness checked before the receipt lookup', EXPORTS, COMMAND_HEAD + FRESH_LINE, FRESH_LINE[2:] + COMMAND_HEAD, {FIVE_MIN}),
    ('M3', 'a fixed key without the attempt token', EXPORTS,
     "vaultObjectKey('export', c.vaultId, id, crypto.randomUUID(), OBJECT_NAME)", "vaultObjectKey('export', c.vaultId, id, OBJECT_NAME)", {RETRIED}),
    ('M4', 'the publish does not recheck the vault', EXPORTS, PUBLISH_CHECK, "  if (!row || row.status !== 'pending') return 'skipped'\n", {RF1, DELETED_MID}),
    ('M5', 'no 30-day purge', EXPORTS,
     '    if (c.storage.transactionSync(() => purgeOldExports(c)) < PURGE_BATCH) return\n', '    if (c.storage.transactionSync(() => 0) < PURGE_BATCH) return\n', {PRUNE, PRUNE_101, DUE_LATER}),
    ('M6', 'one ? per export id in the purge', EXPORTS,
     "c.sql.exec('DELETE FROM exports WHERE id IN (SELECT value FROM json_each(?))', JSON.stringify(ids))",
     "c.sql.exec(`DELETE FROM exports WHERE id IN (${ids.map(() => '?').join(', ')})`, ...ids)", {PRUNE_101}),
    ('M7', 'the publish context is read before the PUT', EXPORTS, '  const p = v.context()\n', '  const p = c\n', {DEADLINE}),
    ('M8', "the publish ignores the reservation's own deadline", EXPORTS,
     '  if (!reservation || reservation.created_at + RESERVATION_GRACE_MS <= now) throw', '  if (!reservation) throw', {DEADLINE}),
    ('M9', 'the starter starts a started export again', WORK,
     "\"SELECT id FROM exports WHERE status = 'pending' AND started_at IS NULL ORDER BY requested_at, id\"",
     "\"SELECT id FROM exports WHERE status = 'pending' ORDER BY requested_at, id\"", {STARTER}),
    ('M10', 'the publish does not recheck that the export is pending', EXPORTS, PUBLISH_CHECK, "  if (!row || !v.active(c)) return 'skipped'\n", {TWICE}),
    ('M11', 'the Workflow records no failure (rethrows)', WORKFLOW_FILE, WORKFLOW_CATCH, '      throw error\n', {WF_FAIL}),
    ('M12', 'exportFile ignores the expiry', EXPORTS,
     "FROM exports WHERE id = ? AND status = 'ready' AND expires_at > ?\",", "FROM exports WHERE id = ? AND status = 'ready' AND ? IS NOT NULL\",", {EXPIRED_FILE}),
    ('M13', "a grant is not capped at the file's expiry", EXPORTS,
     "issue(c.claims.accountId, { snapshotId: id, index: 0 }, c.now, new Date(dto.expires_at))", "issue(c.claims.accountId, { snapshotId: id, index: 0 }, c.now)", {GRANTS}),
    ('M14', 'the download skips the size and digest check', DOWNLOADS,
     "  if (!object || object.bytes !== file.bytes || (object.sha256 !== '' && object.sha256 !== file.sha256)) throw new ProblemException(404, 'NOT_FOUND')\n",
     "  if (!object) throw new ProblemException(404, 'NOT_FOUND')\n", {TAMPERED}),
    ('M15', 'no download slot', DOWNLOADS, '  const release = EXPORT_SLOTS.take()\n', '  const release = () => undefined\n', {FOUR}),
    ('M16', 'a pending export never fails', EXPORTS,
     "WHERE status = 'pending' AND requested_at <= ? RETURNING id\"", "WHERE status = 'pending' AND requested_at <= ? AND 0 RETURNING id\"", {PRUNE, DUE_LATER}),
    ('M17', 'the purge is strict (<)', EXPORTS,
     "'SELECT id FROM exports WHERE requested_at <= ? ORDER BY requested_at, id LIMIT ?'", "'SELECT id FROM exports WHERE requested_at < ? ORDER BY requested_at, id LIMIT ?'", {PRUNE, DUE_LATER}),
    ('M18', 'too_large leaves the export pending', EXPORTS,
     "    c.sql.exec(\"UPDATE exports SET status = 'failed', failure = 'too_large' WHERE id = ? AND status = 'pending'\", id)\n", '', {OVER_LIMIT, TOO_LARGE}),
    ('M19', 'exportStatus never reports expired', EXPORTS,
     "  if (Date.parse(expiresAt) <= c.now.getTime()) return { ...base, status: 'expired' }\n", '', {GRANTS}),
    ('M20', 'exportsDueAt ignores the pending rule', EXPORTS,
     'pending === null ? null : Date.parse(pending) + EXPORT_PENDING_MS', 'null', {PRUNE, DUE_LATER}),
    ('M21', 'markStarted stamps nothing', WORK,
     "    c.sql.exec(\"UPDATE exports SET started_at = ? WHERE id = ? AND status = 'pending' AND started_at IS NULL\", c.now.toISOString(), id)\n", '', {STARTER, WORKFLOW, WF_FAIL}),
    ('M22', 'the high water is read after the PUT', EXPORTS,
     '{ ...stored, rows: body.rows, highWater }',
     "{ ...stored, rows: body.rows, highWater: p.sql.exec<{ revision: string }>('SELECT CAST(revision AS TEXT) AS revision FROM sync_state WHERE id = 1').one().revision }", {CONCURRENT}),
    ('M23', 'the export reads deleted records', EXPORTS,
     ' WHERE t.deleted_at IS NULL AND t.occurred_on BETWEEN ? AND ?', ' WHERE t.occurred_on BETWEEN ? AND ?', {FIELDS, CONCURRENT}),
    ('M24', 'a third open export is accepted', EXPORTS, '    if (open >= EXPORT_MAX_OPEN) throw', '    if (open > EXPORT_MAX_OPEN) throw', {MAX_TWO}),
    ('M25', 'the restated period rule skips the history validation', EXPORTS,
     """  const { filter } = parseHistoryRequest({ from: input.from, through: input.through })
  return { from: filter.from, through: filter.through }""",
     """  void parseHistoryRequest
  return { from: String(input.from), through: String(input.through) }""", {PORT_FILTER, VALIDATES}),
    ('M26', 'the starter without the binding throws instead of waiting', WORK, "    if (!env.EXPORT_WORKFLOW) return 'unbound'\n", '', {STARTER}),
    ('M27', 'only the first part is stored', EXPORTS,
     'putConcatenated(v.bucket, key, body.parts, body.bytes, EXPORT_CONTENT_TYPE)', 'putConcatenated(v.bucket, key, body.parts.slice(0, 1), body.parts[0].byteLength, EXPORT_CONTENT_TYPE)', {ONE_PUT}),
]

FAILED = re.compile(r'^\s*×\s+test/(?:workers/)?(\S+)\s+>\s+(?:.+? > )?(.+?)(?:\s+\d+ms)?$')


def run(edge: str, cmd: list, log) -> tuple:
    out = subprocess.run(cmd, cwd=edge, capture_output=True, text=True, timeout=900)
    text = out.stdout + out.stderr
    log.write(text)
    failed = set()
    for line in text.splitlines():
        match = FAILED.match(line)
        if match:
            failed.add(f'{match.group(1)}: {match.group(2).strip()}')
    totals = re.search(r'Tests\s+(.+)', text)
    return failed, (totals.group(1).strip() if totals else 'no totals')


def run_focused(edge: str, log_path: str) -> tuple:
    with open(log_path, 'w') as log:
        workers, workers_totals = run(edge, ['npx', 'vitest', 'run', '--config', 'vitest.workers.config.ts', '--reporter=verbose', f'test/workers/{F}'], log)
        node, node_totals = run(edge, ['npx', 'vitest', 'run', '--reporter=verbose', f'test/{N}'], log)
    return workers | node, f'workers {workers_totals}; node {node_totals}'


def main() -> int:
    edge, scratch = sys.argv[1], sys.argv[2]
    only = set(sys.argv[3:])
    os.makedirs(os.path.join(scratch, 'mutant-logs'), exist_ok=True)
    ok = True
    for label, description, rel, old, new, required in MUTANTS:
        if only and label not in only:
            continue
        path = os.path.join(edge, rel)
        keep = os.path.join(scratch, 'mutant.keep')
        shutil.copyfile(path, keep)
        text = open(path).read()
        if text.count(old) != 1:
            print(f'{label} NOT APPLIED: old text found {text.count(old)} times in {rel}')
            ok = False
            continue
        open(path, 'w').write(text.replace(old, new))
        try:
            failed, totals = run_focused(edge, os.path.join(scratch, 'mutant-logs', f'{label}.log'))
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
