#!/usr/bin/env python3
"""1B-T9 mutation check. Applies each mutant to one file, runs the focused
workers file (test/workers/attachments.test.ts), restores the file byte for
byte, and reports the failing tests.

Usage (take the heavy lock first, release it after):
  python3 -I mutants.py <apps/edge directory> <scratch directory> [LABEL ...]
  python3 -I mutants.py --check <apps/edge directory>   (no lock needed: only
      checks that each mutant's old text occurs exactly once)

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

ATT = 'src/vault/files/attachments.ts'
REC = 'src/v1/files/receipts.ts'
DL = 'src/v1/files/downloads.ts'
TX = 'src/vault/domain/transactions.ts'
HIST = 'src/vault/reads/history.ts'
MIG = 'src/vault/migrations/0001_vault_files.sql'
ROUTES = 'src/v1/routes.ts'

F = 'attachments.test.ts'
CONSENT_CASE = f'{F}: needs explicit consent and the record version, and makes the receipt part of the record'
OUTLIVES = f'{F}: copies inside the store, registered before the copy, and the receipt outlives the import image and the preview'
IDEMPOTENT = f'{F}: is versioned and idempotent: a stale version keeps nothing, a resend replays, a second receipt needs replace'
DIFFERS = f'{F}: never publishes a copy that differs from the import image'
ROUTINE = f"{F}: the retain routine publishes only this account's own unexpired copy at its generation, matching the image"
FOUR = f'{F}: an account has at most four copies in flight; a fifth retain is told when to retry'
WINDOW = f'{F}: refuses an image past its window, and a deleted record'
REPLACE = f'{F}: replace moves the record to its next version and queues the image it dropped'
SHARED = f'{F}: a receipt two records hold is one object, deleted only after both let go'
AT_ONCE = f'{F}: two records retaining one image at once keep one receipt, made by one copy'
RESTORED = f'{F}: grants wait until the record is restored; the object is never queued meanwhile'
GRANT_BEFORE_DELETE = f'{F}: a grant issued before the record was deleted no longer downloads'
SAFETY_NET = f'{F}: the retention step releases a receipt nothing holds and drops released rows 30 days on, once their object is gone'
FIVE_AT_ONCE = f'{F}: serializes reservations: five at once from one account reserve exactly four'
BUSY = f'{F}: a busy process answers 503 with when to retry, before it reserves anything'
PEAK = f'{F}: a process never has more copies running than its limit'
REFUSED = f'{F}: refused retains, replaces and removals copy nothing'
EXISTS = f'{F}: a receipt that already exists is attached without another copy'
BUDGET = f'{F}: an account has a copy budget; past it, retaining is told when the oldest copy leaves the window'
DEADLINE = f'{F}: gives one deadline to the whole copy: the HEAD that checks it runs on the same signal'
STORE_FAILS = f'{F}: a copy the store cannot make is a 503 with no reservation left live, and never leaks the failure'
CHECKED = f'{F}: the copy is checked as stored by the database too: a copy that is not the registered image is not published'
THIRD = f'{F}: one account cannot take every download slot: its third waits while another account is served'
CAP = f'{F}: the process-wide cap still holds across accounts'
STALL = f'{F}: cuts off a download that stops making progress, and frees its slot'
TRICKLE = f'{F}: cuts off a download still running at the total limit even though it keeps trickling'
NEVER_STARTS = f'{F}: a download that never starts is a 503 problem, not an image-typed body'
UNAVAILABLE = f'{F}: unavailable storage is a 503 with when to retry, and never sends the failure text'
FIRST_BYTE = f'{F}: a body that fails before its first byte is a 503 problem, with no error text'
FAILED_SLOT = f'{F}: downloads refused after they took a slot give the slot back'
CORRUPTED = f'{F}: a corrupted object is never served as a complete download'
SESSION_GRANT = f'{F}: a grant verifies only for the session it was issued to'
BOUND = f'{F}: a receipt grant is bound to the session that asked'
EVERYWHERE = f'{F}: a retained receipt shows as attachment_id wherever the record is read'
PURGE_STAMP = f'{F}: purging a deleted record releases its receipt, stamps the release from the vault clock, and deletes its object'
THREE_MIN = f'{F}: a copy that is never published is due three minutes after its reservation'
BOUNDED = f'{F}: copying is bounded: four in flight and a hundred a day per vault, each answered with when to retry'
DUE_LATER = f'{F}: after pruneAttachments at attachmentsDueAt, the next attachmentsDueAt is later or null'
ONE_BLOCK = f'{F}: a second prepare waits for a copy in flight, and needs none once the receipt exists: both checks run in one block'
SESSION_ENDS = f'{F}: a retain whose session ends during its copy commits nothing, and its copy is given back at once'
VANISHED = f'{F}: a copy whose import image is gone by then keeps nothing and is refused as expired'
OUTLIVED = f'{F}: a retain whose copy outlived its own reservation is refused as expired, even when a failed delete moved its deadline on'

TRIGGER_HEAD = """CREATE TRIGGER transaction_attachments_unheld_delete AFTER DELETE ON transaction_attachments
  WHEN NOT EXISTS (SELECT 1 FROM transaction_attachments t WHERE t.attachment_id = OLD.attachment_id)
BEGIN
  UPDATE attachments SET status = 'released'"""
DAILY_LINE = ("  if (today.n >= COPIES_PER_DAY) throw new ProblemException(429, 'RATE_LIMITED', "
              "{ retryAfterSeconds: Math.max(1, Math.ceil(((today.oldest ?? now) + DAY_MS - now) / 1000)) })\n")
FIRST_CHUNK = "    const first = await within(chunks.next(), limits.idleMs, 'receipt download')\n"

# (label, description, file, old text (must occur exactly once), new text, tests that must fail)
MUTANTS = [
    # The plan's four (Task 1B-T9, Step 6).
    ('M1', 'receipt grants scoped by the account only (no session)', ATT,
     'const grantScope = (c: VaultContext) => receiptGrantScope(c.claims)', 'const grantScope = (c: VaultContext) => c.claims.accountId', {BOUND, SESSION_GRANT}),
    ('M2', "the copy is published without comparing its digest", ATT,
     "AND purpose = 'import_image' AND bytes = ? AND sha256 = ?\"", "AND purpose = 'import_image' AND bytes = ? AND ? IS NOT NULL\"", {ROUTINE}),
    ('M3', 'the history read drops attachment_id', HIST,
     '      `SELECT ${RECORD_COLUMNS}\n         FROM transactions t WHERE ${scope} ${keyset}',
     "      `SELECT ${RECORD_COLUMNS.split(',\\n  (SELECT')[0]}\n         FROM transactions t WHERE ${scope} ${keyset}", {EVERYWHERE}),
    ('M4', "the trigger stamps released_at with SQLite's clock", MIG,
     TRIGGER_HEAD, TRIGGER_HEAD + ", released_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')", {PURGE_STAMP}),
    # prepareReceipt (gogospend_reserve_receipt_copy and needsCopy), in one block.
    ('M5', 'prepare does not wait for a copy in flight', ATT, "  if (pending.length > 0) return { kind: 'wait' }\n", '', {ONE_BLOCK, AT_ONCE}),
    ('M6', 'prepare does not see an existing receipt', ATT,
     "  if (c.sql.exec('SELECT 1 FROM attachments WHERE id = ?', attachmentId).toArray().length > 0) return { kind: 'none' }\n", '', {ONE_BLOCK, EXISTS}),
    ('M7', 'prepare copies for a committed command id', ATT,
     "  if (c.sql.exec('SELECT 1 FROM command_receipts WHERE command_id = ?', input.command_id).toArray().length > 0) return { kind: 'none' }\n", '', {IDEMPOTENT}),
    ('M8', 'prepare ignores the record the command will refuse', ATT, '  if (record) {\n', '  if (record && false) {\n', {REFUSED}),
    ('M9', 'five copies in flight', ATT, '  if (inFlight.n >= COPIES_IN_FLIGHT) throw', '  if (inFlight.n > COPIES_IN_FLIGHT) throw', {FOUR, FIVE_AT_ONCE, BOUNDED}),
    ('M10', 'no daily copy budget', ATT, DAILY_LINE, '', {BUDGET, BOUNDED}),
    ('M11', 'a copy in flight is retried after a fixed minute', ATT,
     "{ retryAfterSeconds: Math.max(1, Math.ceil(((inFlight.oldest ?? now) - now) / 1000)) }", '{ retryAfterSeconds: 60 }', {FOUR, BOUNDED}),
    ('M12', 'an image with less than two minutes left is still copied', ATT, '      now + SOURCE_MARGIN_MS,\n', '      now,\n', {WINDOW}),
    ('M13', 'a copy is reserved for the default 15 minutes', ATT,
     "  reserveObject(c, key, 'receipt', RECEIPT_COPY_GRACE_MS)\n", "  reserveObject(c, key, 'receipt')\n", {THREE_MIN, FOUR}),
    # ready (gogospend_retain_attachment), inside the command.
    ('M14', "the command ignores the copy's own three minutes", ATT, '    reservation.created_at + RECEIPT_COPY_GRACE_MS <= now ||\n', '', {OUTLIVED}),
    ('M15', 'the command leaves the deadline to publishObject (no reservation check)', ATT,
     '    !reservation ||\n    reservation.created_at + RECEIPT_COPY_GRACE_MS <= now ||\n', '', {ROUTINE, OUTLIVED}),
    ('M16', "the command takes another receipt's copy", ATT, '    !copy.key.startsWith(copyPrefix(c, attachmentId)) ||\n', '', {ROUTINE}),
    ('M17', 'the command takes a copy of another format', ATT, '    copy.key.slice(-4) !== preview.image_key.slice(-4) ||\n', '', {ROUTINE}),
    ('M18', 'the copy is recorded but never published', ATT,
     '  publishObject(c, copy.key, { bytes: copy.bytes, sha256: copy.sha256 }, null)\n', '', {CONSENT_CASE, OUTLIVES}),
    ('M19', 'a copy made for an existing receipt is not given back in the command', ATT, '    if (copy) releaseReceiptCopy(c, copy.key)\n', '', {ROUTINE}),
    ('M20', 'retain onto a record that holds a receipt', ATT,
     "    if (heldBy(c, transactionId)) throw stateProblem(ATTACHMENT_MESSAGE_KEYS.present, 'attachment_id')\n", '', {IDEMPOTENT, REFUSED}),
    ('M21', 'replace with the receipt the record holds', ATT,
     "    if (previous === attachmentId) throw stateProblem(ATTACHMENT_MESSAGE_KEYS.unchanged, 'attachment_id')\n", '', {REPLACE, REFUSED}),
    ('M22', "the audit says shared for a released receipt", ATT,
     "  return row?.status === 'released' ? 'released' : 'shared'\n", "  return row ? 'shared' : 'shared'\n", {SHARED, REPLACE}),
    ('M23', "a deleted record's receipt can still be granted", ATT,
     'WHERE ta.attachment_id = a.id AND t.deleted_at IS NULL)`,', 'WHERE ta.attachment_id = a.id)`,', {RESTORED, GRANT_BEFORE_DELETE}),
    # (Only narrowing the status guard is equivalent: min(NULL, now) is NULL in SQLite, so a published receipt's deadline stays NULL.)
    ('M24', 'the release step makes any receipt key due, as releaseObject does', ATT,
     "\"UPDATE vault_objects SET delete_after = min(delete_after, ?) WHERE key = ? AND purpose = 'receipt' AND status = 'reserved' RETURNING key\"",
     "\"UPDATE vault_objects SET delete_after = ? WHERE key = ? AND purpose = 'receipt' AND status <> 'tombstone' RETURNING key\"", {OUTLIVES}),
    # pruneAttachments and attachmentsDueAt.
    ('M25', 'no safety net for a receipt nothing holds', ATT,
     "    const unheld = c.sql.exec(`UPDATE attachments SET status = 'released' WHERE ${UNHELD} RETURNING id`).toArray()\n",
     '    const unheld: unknown[] = []\n', {SAFETY_NET}),
    ('M26', "a released row is dropped while its object is still live", ATT,
     "AND released_at <= ? AND ${OBJECT_GONE} RETURNING id`", 'AND released_at <= ? RETURNING id`', {SAFETY_NET}),
    ('M27', 'the 30-day drop is strict', ATT,
     "`DELETE FROM attachments WHERE status = 'released' AND released_at <= ?", "`DELETE FROM attachments WHERE status = 'released' AND released_at < ?", {DUE_LATER}),
    ('M28', 'attachmentsDueAt ignores a release waiting for its stamp', ATT,
     "(SELECT 1 FROM attachments WHERE (status = 'released' AND released_at IS NULL) OR (${UNHELD}))", '(SELECT 1 FROM attachments WHERE ${UNHELD})', {DUE_LATER}),
    ('M29', 'a release is never stamped', ATT,
     "    const stamped = c.sql.exec(\"UPDATE attachments SET released_at = ? WHERE status = 'released' AND released_at IS NULL RETURNING id\", c.now.toISOString()).toArray()\n",
     '    const stamped: unknown[] = []\n', {PURGE_STAMP, REPLACE, DUE_LATER}),
    # The Worker's copy (receipts.ts).
    ('M30', 'no copy slot', REC, '    const slot = COPY_SLOTS.take()\n', '    const slot = () => undefined\n', {BUSY, PEAK}),
    ('M31', 'the copy slot is taken after the prepare step', REC,
     "    const slot = COPY_SLOTS.take()\n    try {\n      const prepared = await step<PreparedCopy>(vault, 'attachments.prepare', { body: input })\n",
     "    let slot = () => undefined\n    try {\n      const prepared = await step<PreparedCopy>(vault, 'attachments.prepare', { body: input })\n      slot = COPY_SLOTS.take()\n", {BUSY}),
    ('M32', 'a deadline per step, not one for the whole copy', REC,
     'stored = await beforeAbort(signal, async () => ((await store.copy(prepared.source_key, prepared.key, { signal })) ? store.head(prepared.key, { signal }) : null))',
     'stored = (await beforeAbort(signal, () => store.copy(prepared.source_key, prepared.key))) ? await beforeAbort(AbortSignal.timeout(RECEIPT_LIMITS.copyDeadlineMs), () => store.head(prepared.key)) : null',
     {DEADLINE}),
    ('M33', 'a failed copy keeps its reservation', REC,
     '  } catch {\n    await release(vault, prepared.key)\n    throw busy()\n  }', '  } catch {\n    throw busy()\n  }', {STORE_FAILS, DEADLINE}),
    ('M34', 'a copy whose source vanished keeps its reservation', REC,
     '  if (!stored) {\n    await release(vault, prepared.key)\n    return null\n  }', '  if (!stored) {\n    return null\n  }', {VANISHED}),
    ('M35', 'no release after the command', REC, '  } finally {\n    if (copy) await release(vault, copy.key)\n  }', '  } finally {\n    void copy\n  }', {DIFFERS, CHECKED}),
    ('M36', 'a copy is prepared for an unsupported schema', REC, '  const copy = supportsReceiptSchema(command.schemaVersion)', '  const copy = supportsReceiptSchema(1)', {REFUSED}),
    ('M37', 'the consent and image id are left to the command step (checked after the copy)', REC,
     "  const attachmentId = receiptChoice(assertKnownFields(w.body, ['attachment_id', 'consent']))",
     "  const attachmentId = String(assertKnownFields(w.body, ['attachment_id', 'consent']).attachment_id)", {REFUSED, CONSENT_CASE}),
    ('M38', 'a copy in flight is answered 503 at once instead of waited for', REC, '    await delay(WAIT_POLL_MS)\n', '    throw busy()\n', {AT_ONCE}),
    # The download (downloads.ts).
    ('M39', 'no receipt download slot', DL, '  const release = RECEIPT_SLOTS.take(w.claims.accountId)\n', '  const release = () => undefined\n', {THIRD, CAP}),
    ('M40', 'the receipt download slot is not counted per account', DL,
     '  const release = RECEIPT_SLOTS.take(w.claims.accountId)\n', '  const release = RECEIPT_SLOTS.take()\n', {THIRD}),
    ('M41', 'a failed download keeps its slot', DL,
     '    void chunks?.return?.().catch(() => undefined)\n    release()\n', '    void chunks?.return?.().catch(() => undefined)\n', {FAILED_SLOT}),
    ('M42', 'the last chunk is not held back for the digest', DL,
     'verifiedChunks(body, file.bytes, file.sha256, true)', 'verifiedChunks(body, file.bytes, file.sha256)', {CORRUPTED}),
    ('M43', 'no first chunk before the headers', DL,
     FIRST_CHUNK + '    return fileResponse(bodyStream(chunks, release, limits, first),', '    return fileResponse(bodyStream(chunks, release, limits),', {NEVER_STARTS, FIRST_BYTE}),
    ('M44', 'no idle limit after the first chunk', DL,
     'bodyStream(chunks, release, limits, first)', 'bodyStream(chunks, release, { totalMs: limits.totalMs }, first)', {STALL}),
    ('M45', 'no total limit', DL,
     'bodyStream(chunks, release, limits, first)', 'bodyStream(chunks, release, { idleMs: limits.idleMs }, first)', {TRICKLE}),
    ('M46', "a failure's own error reaches the client", DL,
     "    if (error instanceof ProblemException) throw error\n    throw new ProblemException(503, 'SERVICE_UNAVAILABLE', { retryAfterSeconds: 5 })\n",
     '    throw error\n', {UNAVAILABLE}),
    # The step table and the record read.
    ('M47', 'the release step checks the session', ROUTES, "  'attachments.release': { anySession: true },\n", "  'attachments.release': {},\n", {SESSION_ENDS}),
    ('M48', 'the download step runs after sign-out', ROUTES, "  'attachments.file': {},\n", "  'attachments.file': { anySession: true },\n", {BOUND}),
    ('M49', 'the record DTO drops attachment_id', TX, '    ...(row.attachment_id ? { attachment_id: row.attachment_id } : {}),\n', '', {CONSENT_CASE, EVERYWHERE}),
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
        failed, totals = run(edge, ['npx', 'vitest', 'run', '--config', 'vitest.workers.config.ts', '--reporter=verbose', f'test/workers/{F}'], log)
    return failed, f'workers {totals}'


def check(edge: str) -> int:
    ok = True
    for label, _description, rel, old, _new, _required in MUTANTS:
        count = open(os.path.join(edge, rel)).read().count(old)
        if count != 1:
            print(f'{label} old text found {count} times in {rel}')
            ok = False
    print(f'{len(MUTANTS)} mutants, old text found exactly once: {ok}')
    return 0 if ok else 1


def main() -> int:
    if sys.argv[1] == '--check':
        return check(sys.argv[2])
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
