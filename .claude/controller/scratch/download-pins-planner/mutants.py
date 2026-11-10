#!/usr/bin/env python3
"""download-pins mutation check (test-only pins of the 1B-T6 to 1B-T11 reviews).

The code is unchanged, so the RED of this task is the reviewers' surviving
mutants: --red applies every mutant marked RED at once, runs the five test
files, restores every file byte for byte, and checks that exactly the expected
cases fail (the new pins, and the two cases the 1B-T8 spy now arms). The
default mode applies each mutant alone, runs the test files its pins live in,
restores the file, and reports whether every required case failed.

Usage (take the heavy lock first, release it after):
  python3 -I mutants.py <apps/edge directory> <scratch directory> [LABEL ...]
  python3 -I mutants.py --red <apps/edge directory> <scratch directory>
  python3 -I mutants.py --check <apps/edge directory>   (no lock needed: checks
      that each mutant's old text occurs exactly once in its file, and that
      every required case name is a case of its test file)

The scratch directory receives the backups (mutant-*.keep) and one log per
run under mutant-logs/. Exit status 1 if a mutant fails to apply, a restore
differs from the backup, a mutant leaves any REQUIRED case passing, or --red
fails other cases than the expected ones.
"""
import filecmp
import os
import re
import shutil
import subprocess
import sys

RT = 'src/v1/routes.ts'
REC = 'src/v1/files/receipts.ts'
ATT = 'src/vault/files/attachments.ts'
SN = 'src/vault/files/snapshots.ts'
DL = 'src/v1/files/downloads.ts'
PV = 'src/vault/files/previews.ts'
CF = 'src/vault/files/confirmation.ts'
AIR = 'src/v1/ai/routes.ts'
HD = 'src/v1/handler.ts'

EX = 'exports.test.ts'
AT = 'attachments.test.ts'
SNT = 'snapshots.test.ts'
IR = 'imports-review.test.ts'
AI = 'ai.test.ts'
FILES = [EX, AT, SNT, IR, AI]


def case(file: str, name: str) -> str:
    return f'{file}: {name}'


# The new and changed cases, by file.
EXPORT_HEAD = case(EX, 'a HEAD on a download answers its headers, reads its file to the end and gives its slot back')
RECEIPT_HEAD = case(AT, 'a HEAD on a receipt download answers its headers, reads its image to the end and gives its slot back (ruling R96)')
AC1 = case(AT, 'a signed-out session is refused at the prepare step, and nothing is reserved or copied')
AC2 = case(AT, 'a session without the current terms is refused at the prepare step of a retain and a replace, and at a removal, and nothing is reserved or copied')
AC3 = case(AT, 'a deleting account refuses retain, replace, remove, the grant and the download without reserving or copying, and the release step still runs')
DU1 = case(AT, 'a stamped release whose object is still live is not due yet; once the object is gone, the row is due 30 days after its release')
DU2 = case(AT, 'a retained receipt that nothing holds makes attachmentsDueAt now, so the safety net is scheduled')
CP1 = case(AT, 'a request waiting on another copy of the same image gives up at copyDeadlineMs with 503')
AC5 = case(AT, 'an unknown body field is refused before anything is reserved or copied, as the API controller reads the body')
CP2 = case(AT, 'the image of a preview that is no longer ready is not copied, though its image is still published')
RB2 = case(AT, 'a second request for an image whose copy is held only waits, until the first attaches the receipt both then hold')
TWO_AT_ONCE = case(AT, 'two records retaining one image at once keep one receipt, made by one copy')
READS_FIRST = case(SNT, 'reads every row before the first R2 call')
TEN = case(SNT, 'ten times the yearly ledger builds and exports inside the memory budget')
NOT_PENDING = case(SNT, 'a build of a snapshot that is no longer pending reads nothing and stores nothing')
PROBE_E = case(SNT, 'a chunk whose stored bytes no longer match its digest, at the same length, fails as it streams, and gives its slot back')
PROBE_C2 = case(SNT, 'a snapshot read exactly at the purge revision, with nothing after the purge, is recorded, served and reused')
READY_DUE = case(SNT, 'a ready snapshot that is not stale is due only a week past its expiry, and an alarm with one leaves nothing due now')
TOMBSTONES = case(SNT, "pruneSnapshots leaves a stale snapshot's tombstones their own day: keys deleted at its expiry are not made due again at once")
CHUNK_HEAD = case(SNT, 'a HEAD on a chunk download answers its headers, reads its chunk to the end and gives its slot back')
R57 = case(IR, 'a correction of 500 rows at once, the most a correction takes, binds its row ids as one parameter and is saved')
U1 = case(IR, 'an upload that was never accepted (still receiving, or refused at intake) has no preview: 404, as the API answers')
P2_ACCEPTED = case(AI, 'a signed-out session with a malformed body gets 422, with no vault call and no model call; a well-formed body is 401 at its first step')
P2_PARITY = case(AI, 'a signed-in person without consent who sends a malformed body gets 422, as the PostgreSQL route parsed before AiService checked consent, with no vault call')
CONSUME = case(AI, 'a session signed out between the context step and the use is refused at the use: 401, no model call and no use spent')

DRAIN = '  await response.body?.pipeTo(new WritableStream()).catch(() => undefined)\n'
CORRECTION_KNOWN = "    const known = new Set(c.sql.exec<{ source_row_id: string }>(`SELECT source_row_id FROM import_candidates WHERE job_id = ? AND source_row_id ${IN_IDS}`, jobId, ids).toArray().map((row) => row.source_row_id))"
CORRECTION_COMMITTED = '      .exec<{ source_row_id: string }>(`SELECT source_row_id FROM import_row_progress WHERE job_id = ? AND source_row_id ${IN_IDS} ORDER BY source_row_id`, jobId, ids)'
ASK_ROUTE = 'export async function aiAskRoute(w: WorkerContext): Promise<VaultReply> {\n  const request = parseAiAskRequest(w.body)\n  const { service, vault } = aiOf(w)\n'

# (label, description, file, [(old, new)], required cases, test files to run, part of --red)
MUTANTS = [
    # 1B-T9 review m-1 (its X1): prepare's session, policy and account checks.
    ('V1', 'the prepare step skips the session, policy and account checks (anySession)', RT,
     [("  'attachments.prepare': {},\n", "  'attachments.prepare': { anySession: true },\n")], {AC1, AC2, AC3}, [AT], True),
    # 1B-T9 review m-3 (its X4 and X5): attachmentsDueAt's two guards.
    ('V2', 'attachmentsDueAt counts a release whose object is still live', ATT,
     [("(SELECT min(released_at) FROM attachments WHERE status = 'released' AND released_at IS NOT NULL AND ${OBJECT_GONE}) AS oldest",
       "(SELECT min(released_at) FROM attachments WHERE status = 'released' AND released_at IS NOT NULL) AS oldest")], {DU1}, [AT], True),
    ('V3', 'attachmentsDueAt ignores a retained receipt nothing holds (no safety net)', ATT,
     [("WHERE (status = 'released' AND released_at IS NULL) OR (${UNHELD})) AS waiting", "WHERE (status = 'released' AND released_at IS NULL)) AS waiting")], {DU2}, [AT], True),
    # 1B-T9 review n-1 to n-4 (its X2, X3, X6, and the planner's M38).
    ('V4', 'a waiting request polls with no deadline', REC, [('    if (Date.now() >= deadline) throw busy()\n', '')], {CP1}, [AT], True),
    ('V5', 'unknown body fields are not refused', REC,
     [("  const attachmentId = receiptChoice(assertKnownFields(w.body, ['attachment_id', 'consent']))", '  const attachmentId = receiptChoice(w.body as Record<string, unknown>)')], {AC5}, [AT], True),
    ('V6', 'prepare copies the image of a preview that is no longer ready', ATT,
     [("WHERE p.image_attachment_id = ? AND p.status = 'ready' AND o.purpose = 'import_image'", "WHERE p.image_attachment_id = ? AND o.purpose = 'import_image'")], {CP2}, [AT], True),
    ('V7', 'a copy in flight is answered 503 at once instead of waited for (1B-T9 M38)', REC, [('    await delay(WAIT_POLL_MS)\n', '    throw busy()\n')], {RB2, TWO_AT_ONCE}, [AT], False),
    # R96's HEAD (1B-T9 review m-2, probe HD-1; 1B-T6 confirming review n-2).
    ('V8', "headOf cancels the body it drops instead of reading it to its end (R96's first wording)", HD,
     [(DRAIN, '  await response.body?.cancel().catch(() => undefined)\n')], {RECEIPT_HEAD, EXPORT_HEAD, CHUNK_HEAD}, [AT, EX, SNT], False),
    ('V9', 'headOf starts the read of the body it drops but answers before it ends', HD,
     [(DRAIN, '  void response.body?.pipeTo(new WritableStream()).catch(() => undefined)\n')], {EXPORT_HEAD, RECEIPT_HEAD, CHUNK_HEAD}, [EX, AT, SNT], False),
    # 1B-T8 review m-2, m-3, n-1 and n-2 (its X1, X6, X2 and X3).
    ('V10', 'the entity read collects every row by spread before it encodes any', SN,
     [('  for (const row of c.sql.exec<HeadRow>(ENTITY_READ)) {\n', '  for (const row of [...c.sql.exec<HeadRow>(ENTITY_READ)]) {\n')], {READS_FIRST, TEN}, [SNT], True),
    ('V11', 'the read does not check that the snapshot is still pending', SN,
     [("  if (!row || row.status !== 'pending' || !v.active(c)) return { kind: 'skipped' }\n", "  if (!row || !v.active(c)) return { kind: 'skipped' }\n")], {NOT_PENDING}, [SNT], True),
    ('V12', 'the chunk download streams without verifiedChunks (no digest check as it streams)', DL,
     [('    const chunks = verifiedChunks(body, file.bytes, file.sha256)[Symbol.asyncIterator]()\n    return fileResponse(bodyStream(chunks, release), { contentType: SNAPSHOT_CONTENT_TYPE',
       '    const chunks = body[Symbol.asyncIterator]()\n    return fileResponse(bodyStream(chunks, release), { contentType: SNAPSHOT_CONTENT_TYPE')], {PROBE_E}, [SNT], True),
    ('V13', 'reuse refuses a snapshot read exactly at the purge watermark (strict)', SN,
     [('expires_at > ? AND high_water >= ${PURGE_WATERMARK} ORDER BY ready_at DESC', 'expires_at > ? AND high_water > ${PURGE_WATERMARK} ORDER BY ready_at DESC')], {PROBE_C2}, [SNT], True),
    # 1B-T11 review m3 and n6 (the data lens's R1 and R2).
    ('V14', "snapshotsDueAt's stale term counts every chunk row", SN,
     [('EXISTS (SELECT 1 FROM ${STALE_CHUNKS}) AS stale', 'EXISTS (SELECT 1 FROM snapshot_chunks) AS stale')], {READY_DUE}, [SNT], True),
    ('V15', "pruneSnapshots makes a stale snapshot's tombstones due at once too", SN,
     [("UPDATE vault_objects SET delete_after = 0 WHERE status <> 'tombstone' AND key IN (SELECT object_key FROM ${STALE_CHUNKS})",
       'UPDATE vault_objects SET delete_after = 0 WHERE key IN (SELECT object_key FROM ${STALE_CHUNKS})')], {TOMBSTONES}, [SNT], True),
    # 1B-T10 review m-1 (its U9, and the same at the committed-row check) and m-2 (its U1).
    ('V16', "the correction's known-row check binds one ? per row id (R57)", CF,
     [(CORRECTION_KNOWN, "    const known = new Set(c.sql.exec<{ source_row_id: string }>(`SELECT source_row_id FROM import_candidates WHERE job_id = ? AND source_row_id IN (${rows.map(() => '?').join(', ')})`, jobId, ...rows.map((row) => row.source_row_id)).toArray().map((row) => row.source_row_id))")], {R57}, [IR], True),
    ('V17', "the correction's committed-row check binds one ? per row id (R57)", CF,
     [(CORRECTION_COMMITTED, "      .exec<{ source_row_id: string }>(`SELECT source_row_id FROM import_row_progress WHERE job_id = ? AND source_row_id IN (${rows.map(() => '?').join(', ')}) ORDER BY source_row_id`, jobId, ...rows.map((row) => row.source_row_id))")], {R57}, [IR], True),
    ('V18', 'the preview reads an upload that was never accepted', PV, [('        WHERE u.job_id = ? AND u.accepted_at IS NOT NULL`,', '        WHERE u.job_id = ?`,')], {U1}, [IR], True),
    # 1B-T7 review m-2 (its W7) and n-1 (its W5).
    ('V19', 'the use step runs after the session ended (anySession)', RT, [("  'ai.consume': {},\n", "  'ai.consume': { anySession: true },\n")], {CONSUME}, [AI], True),
    ('V20', "Ask Bun's route makes its first step before it reads its input", AIR,
     [(ASK_ROUTE, "export async function aiAskRoute(w: WorkerContext): Promise<VaultReply> {\n  const { service, vault } = aiOf(w)\n  const first = await vault.call('ai.context')\n  if (!first.ok) return first\n  const request = parseAiAskRequest(w.body)\n")],
     {P2_ACCEPTED, P2_PARITY}, [AI], True),
]

# What --red must fail: every required case of the RED mutants (the two 1B-T8 spy cases included), and nothing else.
RED_EXPECTED = set().union(*(required for _l, _d, _f, _e, required, _t, red in MUTANTS if red))

FAILED = re.compile(r'^\s*×\s+test/(?:workers/)?(\S+)\s+>\s+(?:.+? > )?(.+?)(?:\s+\d+ms)?$')
IT_NAME = re.compile(r"""^\s*it\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")""")


def case_names(edge: str) -> set:
    names = set()
    for file in FILES:
        for line in open(os.path.join(edge, 'test/workers', file), encoding='utf-8'):
            match = IT_NAME.match(line)
            if match:
                raw = match.group(1) if match.group(1) is not None else match.group(2)
                names.add(case(file, raw.replace("\\'", "'").replace('\\"', '"')))
    return names


def run(edge: str, files: list, log_path: str) -> tuple:
    args = [f'test/workers/{file}' for file in files]
    out = subprocess.run(['npx', 'vitest', 'run', '--config', 'vitest.workers.config.ts', '--reporter=verbose', *args], cwd=edge, capture_output=True, text=True, timeout=1800)
    text = out.stdout + out.stderr
    with open(log_path, 'w') as log:
        log.write(text)
    failed = set()
    for line in text.splitlines():
        match = FAILED.match(line)
        if match:
            failed.add(f'{match.group(1)}: {match.group(2).strip()}')
    totals = re.search(r'Tests\s+(.+)', text)
    return failed, f'workers {totals.group(1).strip() if totals else "no totals"}'


def check(edge: str) -> int:
    ok = True
    names = case_names(edge)
    labels = set()
    for label, _description, rel, edits, required, _files, _red in MUTANTS:
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
    print(f'{len(MUTANTS)} mutants, {len(names)} cases in the five files; old text found exactly once and every required case exists: {ok}')
    return 0 if ok else 1


def apply_all(edge: str, scratch: str, chosen: list) -> dict:
    """Applies the chosen mutants, several to one file if need be; returns {path: backup}."""
    backups = {}
    for label, _description, rel, edits, _required, _files, _red in chosen:
        path = os.path.join(edge, rel)
        if path not in backups:
            keep = os.path.join(scratch, f'mutant-{len(backups)}.keep')
            shutil.copyfile(path, keep)
            backups[path] = keep
        text = open(path, encoding='utf-8').read()
        for old, new in edits:
            if text.count(old) != 1:
                raise RuntimeError(f'{label} NOT APPLIED: an old text is not found exactly once in {rel}')
            text = text.replace(old, new)
        open(path, 'w', encoding='utf-8').write(text)
    return backups


def restore(backups: dict) -> bool:
    restored = True
    for path, keep in backups.items():
        shutil.copyfile(keep, path)
        restored = restored and filecmp.cmp(keep, path, shallow=False)
    return restored


def red(edge: str, scratch: str) -> int:
    os.makedirs(os.path.join(scratch, 'mutant-logs'), exist_ok=True)
    chosen = [m for m in MUTANTS if m[6]]
    backups = {}
    try:
        backups = apply_all(edge, scratch, chosen)
        failed, totals = run(edge, FILES, os.path.join(scratch, 'mutant-logs', 'RED.log'))
    finally:
        restored = restore(backups)
    missing = sorted(RED_EXPECTED - failed)
    extra = sorted(failed - RED_EXPECTED)
    print(f'RED with {", ".join(m[0] for m in chosen)} [{totals}] restored={restored}')
    print(f'    failed {len(failed)}, expected {len(RED_EXPECTED)}')
    for name in sorted(failed & RED_EXPECTED):
        print(f'    failed as expected: {name}')
    for name in missing:
        print(f'    EXPECTED TO FAIL BUT PASSED: {name}')
    for name in extra:
        print(f'    FAILED BUT NOT EXPECTED: {name}')
    return 0 if restored and not missing and not extra else 1


def main() -> int:
    if sys.argv[1] == '--check':
        return check(sys.argv[2])
    if sys.argv[1] == '--red':
        return red(sys.argv[2], sys.argv[3])
    edge, scratch = sys.argv[1], sys.argv[2]
    only = set(sys.argv[3:])
    os.makedirs(os.path.join(scratch, 'mutant-logs'), exist_ok=True)
    ok = True
    for mutant in MUTANTS:
        label, description, rel, _edits, required, files, _red = mutant
        if only and label not in only:
            continue
        backups = {}
        try:
            backups = apply_all(edge, scratch, [mutant])
            failed, totals = run(edge, files, os.path.join(scratch, 'mutant-logs', f'{label}.log'))
        except RuntimeError as error:
            print(error)
            ok = False
            continue
        finally:
            restored = restore(backups)
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
