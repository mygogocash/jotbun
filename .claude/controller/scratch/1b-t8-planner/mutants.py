#!/usr/bin/env python3
"""1B-T8 mutation check. Applies each mutant (one or more exact text
replacements in one file), runs the focused workers file
(test/workers/snapshots.test.ts), restores the file byte for byte, and reports
the failing cases.

Usage (take the heavy lock first, release it after):
  python3 -I mutants.py <apps/edge directory> <scratch directory> [LABEL ...]
  python3 -I mutants.py --check <apps/edge directory>   (no lock needed: checks
      that each mutant's old text occurs exactly once in its file, and that
      every required case name is a case of the test file)

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

SN = 'src/vault/files/snapshots.ts'
WF = 'src/background/snapshot-workflow.ts'
WK = 'src/vault/files/work.ts'
DL = 'src/v1/files/downloads.ts'
RT = 'src/v1/routes.ts'

F = 'snapshots.test.ts'
T = f'test/workers/{F}'


def case(name: str) -> str:
    return f'{F}: {name}'


# Required cases, by the names the test file gives them.
APPLY = case('applying the snapshot and then later deltas yields every latest entity exactly once, from one view')
DELETION = case('an account deletion during the build publishes nothing, and its chunks are swept')
OUT_OF_TIME = case('a build that runs out of time publishes no manifest')
EMPTY = case('an empty account still gets a one-chunk snapshot at its high-water')
INVALID = case('refuses to publish an entity that does not match its persisted DTO')
IDEMPOTENT = case('requests are idempotent, share an open build, and reuse a snapshot from the last hour')
GRANTS = case("grants are short-lived, bound to the owner, and refuse another account's snapshot")
FAILED_EXPIRED = case('reports failed and expired snapshots, and grants nothing for them')
WORKFLOW_RUNS = case('SnapshotWorkflow runs the build')
HIGH_WATER_VIEW = case('every entity comes from the high-water view even when writes land between single-entity pages')
READS_FIRST = case('reads every row before the first R2 call')
MISSING_CHANGE = case('a head whose change row is missing fails the build instead of vanishing from it')
NEAR_TARGET = case('keeps chunks near their target size and grants within the snapshot expiry')
TOMBSTONES = case('tombstones reach delta readers, older cursors resync, and snapshots built before the purge are dropped')
READ_BEFORE_PURGE = case('a snapshot read before a purge is never recorded afterwards, so it cannot serve the purged data')
JOBS = case('builds a requested snapshot, whose chunks the edge then serves')
CURSOR = case('a snapshot runs on SnapshotWorkflow, and its cursor continues with /v1/sync/changes')
READY_AT = case('a snapshot that became ready in the last hour is reused, judged by ready_at')
RETRIED = case("a build retried after its chunks were stored completes, and the first attempt's chunks are deleted at their deadline")
FINISHES_INACTIVE = case('a build that finishes after the vault stopped being active publishes nothing')
R57 = case('a build cut into more chunks than SQLite has parameters records them all')
TAMPERED = case('a chunk is served with its exact bytes and digest, and a tampered chunk is 404')
R37 = case('after pruneSnapshots at snapshotsDueAt, the next snapshotsDueAt is later or null')
TEN = case('ten times the yearly ledger builds and exports inside the memory budget')
STARTS_INACTIVE = case('a build that starts after the vault stopped being active reads nothing and stores nothing')
TOO_LARGE = case('a too-large snapshot fails visibly and publishes nothing')
THREE_FAIL = case('a snapshot whose build fails on all three attempts is recorded failed')
TWO_FAIL = case('a build that fails on its first two attempts is ready on its third')
STARTER = case('the snapshot starter starts each pending snapshot once on SnapshotWorkflow, and is due a minute after an unstarted request')
TWICE = case('a snapshot started twice by overlapping runs is built once')
PRUNE = case('pruneSnapshots fails a snapshot left pending for a day, drops one read below the purge watermark, and deletes one a week past its expiry')
VALIDATION = case('a request takes no body field and a UUID key, waits for the jobs gate, and a status of a malformed or unknown id is 404')
SLOTS = case('at most four chunk downloads run at once in a process, each streamed and never read whole; more are told to retry')
REFUSED_SLOT = case('a chunk download refused after it took its slot gives the slot back')
HEAD = case('a HEAD on a chunk download answers its headers, reads its chunk to the end and gives its slot back')

# The plan's mutant 2: the API's design, each chunk kept as one JS string until its upload. The count adds what the
# kept strings occupy, two bytes a UTF-16 unit, as V8 holds a string with Thai text.
READ_LOOP = """    const line = encoder.encode(JSON.stringify(change))
    const bytes = line.byteLength + 1
    total += bytes
    if (total > maxBytes) return null
    if (lines.length > 0 && size + bytes > chunkBytes) {
      chunks.push(chunkOf(id, highWater, chunks.length, lines))
      lines = []
      size = 0
    }
    lines.push(line)
    size += bytes
  }
  if (lines.length > 0 || chunks.length === 0) chunks.push(chunkOf(id, highWater, chunks.length, lines))
  return chunks"""
STRING_LOOP = """    const json = JSON.stringify(change)
    const bytes = Buffer.byteLength(json) + 1
    total += bytes
    if (total > maxBytes) return null
    if (texts.length > 0 && size + bytes > chunkBytes) {
      chunks.push(textChunk(chunks.length))
      texts = []
      size = 0
    }
    texts.push(json)
    size += bytes
  }
  if (texts.length > 0 || chunks.length === 0) chunks.push(textChunk(chunks.length))
  return chunks"""
TEXT_CHUNK = """  let texts: string[] = []
  const textChunk = (index: number) => {
    const text = `{"schema_version":${SNAPSHOT_SCHEMA_VERSION},"snapshot_id":${JSON.stringify(id)},"high_water":${JSON.stringify(highWater)},"index":${index},"entities":[${texts.join(',')}]}`
    const part = encoder.encode(text)
    return { parts: [part], bytes: part.byteLength, text }
  }
"""
HELD = '  let held = chunks.reduce((sum, chunk) => sum + chunk.bytes, 0)\n'
HELD_WITH_TEXT = '  let held = chunks.reduce((sum, chunk) => sum + chunk.bytes + 2 * ((chunk as { text?: string }).text?.length ?? 0), 0)\n'

REUSE = "`SELECT id FROM snapshots WHERE status = 'ready' AND ready_at > ? AND expires_at > ? AND high_water >= ${PURGE_WATERMARK} ORDER BY ready_at DESC, id LIMIT 1`,\n        iso(now - SNAPSHOT_REUSE_MS),\n        iso(now + SNAPSHOT_REUSE_LEFT_MS),\n"
CHUNK_WHERE = "WHERE k.snapshot_id = ? AND k.chunk_index = ? AND s.status = 'ready' AND s.expires_at > ? AND s.high_water >= ${PURGE_WATERMARK}`,\n      target.snapshotId,\n      target.index,\n      c.now.toISOString(),\n"
RECORD_GUARD = "  if (!row || row.status !== 'pending' || !v.active(c)) return 'skipped'\n"
LIVE_QUERY = """      "SELECT count(*) AS live FROM vault_objects WHERE key IN (SELECT value FROM json_each(?)) AND status = 'reserved' AND created_at + ? > ?",
      JSON.stringify(stored.map((chunk) => chunk.key)),
"""
SERVE_BODY = """  const release = SNAPSHOT_SLOTS.take()
  try {
    const body = await matchingObject(w.env, file)
    const chunks = verifiedChunks(body, file.bytes, file.sha256)[Symbol.asyncIterator]()
    return fileResponse(bodyStream(chunks, release), { contentType: SNAPSHOT_CONTENT_TYPE, bytes: file.bytes })
  } catch (error) {
    release()
    throw error
  }"""

# (label, description, file, [(old, new), ...], required cases)
MUTANTS = [
    # The plan's five (Step 6).
    ('M1', 'the entity rows are read with toArray', SN,
     [('  for (const row of c.sql.exec<HeadRow>(ENTITY_READ)) {', '  for (const row of c.sql.exec<HeadRow>(ENTITY_READ).toArray()) {')], {TEN, READS_FIRST}),
    ('M2', 'each chunk is kept as one string until its upload (the API design; the count adds the strings)', SN,
     [('  let lines: Uint8Array[] = []\n', TEXT_CHUNK), (READ_LOOP, STRING_LOOP), (HELD, HELD_WITH_TEXT)], {TEN}),
    ('M3', 'reuse compares created_at', SN,
     [("status = 'ready' AND ready_at > ? AND expires_at > ? AND high_water >= ${PURGE_WATERMARK} ORDER BY ready_at DESC",
       "status = 'ready' AND created_at > ? AND expires_at > ? AND high_water >= ${PURGE_WATERMARK} ORDER BY created_at DESC")], {READY_AT, PRUNE}),
    ('M4', 'the record check drops the purge watermark', SN,
     [('BETWEEN max(s.pruned_through, ${PURGE_WATERMARK}) AND s.revision', 'BETWEEN s.pruned_through AND s.revision')], {READ_BEFORE_PURGE}),
    ('M5', 'every attempt reuses one key set (no attempt token)', SN,
     [('  const token = crypto.randomUUID()\n', '  const token = id\n')], {RETRIED, TWICE, OUT_OF_TIME, READ_BEFORE_PURGE}),
    # The request (S1 to S7).
    ('S1', 'the idempotency key is not checked', SN,
     [("  if (!isUuid(key)) throw new ContractValidationError('VALIDATION_FAILED', 'Idempotency-Key must be a UUID.', 'idempotency-key')\n", '')], {VALIDATION}),
    ('S2', 'a body field is accepted', SN, [('  assertKnownFields(call.body ?? {}, [])\n', '')], {VALIDATION}),
    ('S3', 'a resent request does not answer its own snapshot', SN,
     [("    c.sql.exec<{ id: string }>('SELECT id FROM snapshots WHERE id = ?', id).toArray()[0]?.id ??\n", '')], {FAILED_EXPIRED}),
    ('S4', 'reuse ignores how long the snapshot has left', SN,
     [(REUSE, "`SELECT id FROM snapshots WHERE status = 'ready' AND ready_at > ? AND high_water >= ${PURGE_WATERMARK} ORDER BY ready_at DESC, id LIMIT 1`,\n        iso(now - SNAPSHOT_REUSE_MS),\n")], {READY_AT}),
    ('S5', 'reuse ignores the purge watermark', SN,
     [('AND expires_at > ? AND high_water >= ${PURGE_WATERMARK} ORDER BY ready_at DESC', 'AND expires_at > ? ORDER BY ready_at DESC')], {TOMBSTONES}),
    ('S6', 'an open build is not shared', SN,
     [("    c.sql.exec<{ id: string }>(\"SELECT id FROM snapshots WHERE status = 'pending' ORDER BY created_at, id LIMIT 1\").toArray()[0]?.id\n",
       '    (undefined as string | undefined)\n')], {IDEMPOTENT}),
    ('S7', 'a ready snapshot answers 202', SN, [("status: dto.status === 'ready' ? 200 : 202", 'status: 202')], {IDEMPOTENT, READY_AT}),
    # The status and the chunk lookup (S8 to S12).
    ('S8', 'a snapshot never expires by time', SN,
     [('if (Date.parse(expiresAt) <= c.now.getTime() || row.current !== 1)', 'if (row.current !== 1)')], {FAILED_EXPIRED}),
    ('S9', 'the status ignores the purge watermark', SN,
     [('if (Date.parse(expiresAt) <= c.now.getTime() || row.current !== 1)', 'if (Date.parse(expiresAt) <= c.now.getTime())')], {TOMBSTONES}),
    ('S10', "a grant is not capped at the snapshot's expiry", SN,
     [('{ snapshotId: id, index: chunk.chunk_index }, c.now, new Date(expiresAt))', '{ snapshotId: id, index: chunk.chunk_index }, c.now)')], {NEAR_TARGET}),
    ('S11', 'the chunk lookup ignores the expiry', SN,
     [(CHUNK_WHERE, "WHERE k.snapshot_id = ? AND k.chunk_index = ? AND s.status = 'ready' AND s.high_water >= ${PURGE_WATERMARK}`,\n      target.snapshotId,\n      target.index,\n")], {FAILED_EXPIRED}),
    ('S12', 'the chunk lookup ignores the purge watermark', SN,
     [("AND s.status = 'ready' AND s.expires_at > ? AND s.high_water >= ${PURGE_WATERMARK}`", "AND s.status = 'ready' AND s.expires_at > ?`")], {TOMBSTONES}),
    # The build (S13 to S27).
    ('S13', 'the read does not check that the vault is active', SN,
     [("  if (!row || row.status !== 'pending' || !v.active(c)) return { kind: 'skipped' }\n", "  if (!row || row.status !== 'pending') return { kind: 'skipped' }\n")], {STARTS_INACTIVE}),
    ('S14', 'the record does not check that the vault is active', SN,
     [(RECORD_GUARD, "  if (!row || row.status !== 'pending') return 'skipped'\n")], {FINISHES_INACTIVE, DELETION}),
    ('S15', 'the record does not check that the snapshot is still pending', SN,
     [(RECORD_GUARD, "  if (!row || !v.active(c)) return 'skipped'\n")], {TWICE}),
    ('S16', 'the record reads the clock before the PUTs', SN,
     [('  const p = v.context()\n', '  const p = c\n')], {OUT_OF_TIME}),
    ('S17', "the record ignores its reservations' own deadline", SN,
     [("  if (live !== stored.length) throw new Error('the snapshot chunks outlived their reservations')\n", '')], {OUT_OF_TIME}),
    ('S18', 'a change is not checked against its DTO', SN,
     [("    if (!isEntityChange(change)) throw new Error(`A ${row.entity} in the snapshot does not match its persisted DTO.`)\n", '')], {INVALID}),
    ('S19', 'snapshots keep their stored key order (no jsonbOrder)', SN,
     [('snapshot: row.snapshot === null ? null : jsonbOrder(JSON.parse(row.snapshot))', 'snapshot: row.snapshot === null ? null : JSON.parse(row.snapshot)')], {APPLY}),
    ('S20', 'every chunk header says index 0', SN, [(',"index":${index},"entities":[`)', ',"index":0,"entities":[`)')], {APPLY}),
    ('S21', 'the chunk header names high water 0', SN, [('"high_water":${JSON.stringify(highWater)},"index"', '"high_water":"0","index"')], {APPLY}),
    ('S22', 'a chunk never closes', SN, [('    if (lines.length > 0 && size + bytes > chunkBytes) {\n', '    if (lines.length < 0) {\n')], {APPLY, R57, NEAR_TARGET, HIGH_WATER_VIEW, TEN}),
    ('S23', 'an empty vault gets no chunk', SN,
     [('  if (lines.length > 0 || chunks.length === 0) chunks.push(chunkOf(id, highWater, chunks.length, lines))\n', '  if (lines.length > 0) chunks.push(chunkOf(id, highWater, chunks.length, lines))\n')], {EMPTY}),
    ('S24', 'maxBytes is ignored', SN, [('    if (total > maxBytes) return null\n', '')], {TOO_LARGE}),
    ('S25', 'a too-large snapshot stays pending', SN,
     [("    c.sql.exec(\"UPDATE snapshots SET status = 'failed' WHERE id = ? AND status = 'pending'\", id)\n    touch(c)\n    return { kind: 'too_large' }", "    return { kind: 'too_large' }")], {TOO_LARGE}),
    ('S26', "the chunks are published past the snapshot's expiry", SN,
     [('    publishObject(c, chunk.key, chunk, expiresAt)\n', '    publishObject(c, chunk.key, chunk, expiresAt + HOUR_MS)\n')], {APPLY, PRUNE}),
    ('S27', 'the high water is read when the snapshot is recorded', SN,
     [("\"UPDATE snapshots SET status = 'ready', high_water = CAST(? AS INTEGER), chunk_count = ?, ready_at = ?, expires_at = ? WHERE id = ? AND status = 'pending'\",\n    highWater,\n",
       "\"UPDATE snapshots SET status = 'ready', high_water = (SELECT revision FROM sync_state WHERE id = 1), chunk_count = ?, ready_at = ?, expires_at = ? WHERE id = ? AND status = 'pending'\",\n")], {APPLY, HIGH_WATER_VIEW}),
    ('S28', 'the reservation check binds one ? per chunk key (ruling R57)', SN,
     [(LIVE_QUERY, """      `SELECT count(*) AS live FROM vault_objects WHERE key IN (${stored.map(() => '?').join(', ')}) AND status = 'reserved' AND created_at + ? > ?`,
      ...stored.map((chunk) => chunk.key),
""")], {R57}),
    ('S29', 'a view below the purge watermark is skipped instead of retried (the plan read literally)', SN,
     [("  if (!current) throw new Error('the snapshot was read before a purge or the retention line')\n", "  if (!current) return 'skipped'\n")], {READ_BEFORE_PURGE}),
    ('S30', 'a head without its change row is read as a missing row (inner join)', SN,
     [('FROM entity_heads h LEFT JOIN entity_changes c', 'FROM entity_heads h JOIN entity_changes c')], {MISSING_CHANGE}),
    ('S31', 'the purge watermark counts every change, not only purges', SN,
     [("const PURGE_WATERMARK = \"(SELECT coalesce(max(revision), 0) FROM entity_changes WHERE state = 'purged')\"", "const PURGE_WATERMARK = \"(SELECT coalesce(max(revision), 0) FROM entity_changes)\"")], {APPLY}),
    ('S32', 'the count leaves out the copy putConcatenated joins', SN,
     [('    peakHeldBytes = Math.max(peakHeldBytes, held + (chunk.parts.length > 1 ? chunk.bytes : 0))\n', '')], {TEN}),
    # pruneSnapshots and snapshotsDueAt (S33 to S39).
    ('S33', 'a pending snapshot fails only after its day (strict)', SN,
     [("WHERE status = 'pending' AND created_at <= ? RETURNING id", "WHERE status = 'pending' AND created_at < ? RETURNING id")], {PRUNE, R37}),
    ('S34', "a stale snapshot's chunk keys are not made due", SN,
     [("""    c.sql.exec(
      `UPDATE vault_objects SET delete_after = 0
        WHERE status <> 'tombstone' AND key IN (SELECT object_key FROM snapshot_chunks WHERE snapshot_id IN (SELECT id FROM snapshots WHERE ${BELOW_WATERMARK}))`,
    )
""", '')], {TOMBSTONES, PRUNE}),
    ('S35', 'a stale snapshot is kept', SN,
     [('    const stale = c.sql.exec(`DELETE FROM snapshots WHERE ${BELOW_WATERMARK} RETURNING id`).toArray()\n', '    const stale: unknown[] = []\n')], {TOMBSTONES, PRUNE, R37}),
    ('S36', 'a ready snapshot is deleted only after its week (strict)', SN,
     [("\"DELETE FROM snapshots WHERE status = 'ready' AND expires_at <= ? RETURNING id\"", "\"DELETE FROM snapshots WHERE status = 'ready' AND expires_at < ? RETURNING id\"")], {PRUNE, R37}),
    ('S37', 'snapshotsDueAt ignores a stale snapshot', SN, [('    stale > 0 ? c.now.getTime() : null,\n', '    null,\n')], {R37}),
    ('S38', 'snapshotsDueAt ignores a pending snapshot', SN, [('    pending === null ? null : Date.parse(pending) + SNAPSHOT_PENDING_MS,\n', '    null,\n')], {R37}),
    ('S39', 'snapshotsDueAt ignores the kept ready rows', SN, [('    ready === null ? null : Date.parse(ready) + SNAPSHOT_KEEP_MS,\n', '    null,\n')], {R37}),
    ('S40', 'the entity read has no order (the API reads by entity, then id)', SN, [('\n ORDER BY h.entity, h.entity_id`', '`')], {APPLY}),
    # SnapshotWorkflow (W) and its step.
    ('W1', 'the Workflow records no failure (rethrows)', WF,
     [("""      logFailure('snapshot_build_failed', error)
      await step.do('record the failure', async () => {
        await vaultById(this.env, p.vault).failSnapshot(p.snapshot)
        return { recorded: true }
      })
      return { outcome: 'failed' }""", '      throw error')], {THREE_FAIL}),
    ('W2', 'the step makes two attempts', WF, [('retries: { limit: 2,', 'retries: { limit: 1,')], {TWO_FAIL}),
    ('W3', 'the step makes four attempts', WF, [('retries: { limit: 2,', 'retries: { limit: 3,')], {THREE_FAIL}),
    # The snapshot starter (K).
    ('K1', 'markStarted stamps nothing', WK,
     [("    c.sql.exec(\"UPDATE snapshots SET started_at = ? WHERE id = ? AND status = 'pending' AND started_at IS NULL\", c.now.toISOString(), id)\n", '')], {STARTER, CURSOR, WORKFLOW_RUNS, THREE_FAIL, TWO_FAIL}),
    ('K2', 'the starter without its binding throws instead of answering unbound', WK, [("    if (!env.SNAPSHOT_WORKFLOW) return 'unbound'\n", '')], {STARTER}),
    ('K3', 'a started snapshot is started again', WK,
     [("\"SELECT id FROM snapshots WHERE status = 'pending' AND started_at IS NULL ORDER BY created_at, id\"", "\"SELECT id FROM snapshots WHERE status = 'pending' ORDER BY created_at, id\"")], {STARTER}),
    ('K4', 'an unstarted snapshot is due at once', WK,
     [("FROM snapshots WHERE status = 'pending' AND started_at IS NULL\").one()\n    return oldest === null ? null : Date.parse(oldest) + START_RETRY_MS",
       "FROM snapshots WHERE status = 'pending' AND started_at IS NULL\").one()\n    return oldest === null ? null : Date.parse(oldest)")], {STARTER}),
    ('K5', "the instance is not named by the snapshot's id", WK,
     [('    await createOnce(env.SNAPSHOT_WORKFLOW, id, { vault: vaultId, snapshot: id })\n', '    await createOnce(env.SNAPSHOT_WORKFLOW, crypto.randomUUID(), { vault: vaultId, snapshot: id })\n')], {CURSOR, WORKFLOW_RUNS, TWICE}),
    ('K6', 'the snapshot starter is not registered', WK, [('WORK_STARTERS.push(SNAPSHOT_STARTER)\n', '')], {WORKFLOW_RUNS, CURSOR}),
    # The chunk download (D) and its routes (R).
    ('D1', 'a chunk download takes no slot', DL, [(SERVE_BODY, SERVE_BODY.replace('  const release = SNAPSHOT_SLOTS.take()\n', '  const release = () => undefined\n'))], {SLOTS}),
    ('D2', 'a refused download keeps its slot', DL, [(SERVE_BODY, SERVE_BODY.replace('    release()\n    throw error', '    throw error'))], {REFUSED_SLOT}),
    ('D3', 'a finished download keeps its slot', DL, [(SERVE_BODY, SERVE_BODY.replace('bodyStream(chunks, release)', 'bodyStream(chunks, () => undefined)'))], {HEAD, SLOTS}),
    ('D4', 'the object is streamed without matching its record', DL,
     [(SERVE_BODY, SERVE_BODY.replace('    const body = await matchingObject(w.env, file)\n', '    const body = (await new R2ObjectStore(w.env.OBJECTS!).getStream(file.key))!.body\n'))], {TAMPERED, REFUSED_SLOT}),
    ('D5', 'the chunk is read whole before it is served (the PostgreSQL edge)', DL,
     [(SERVE_BODY, SERVE_BODY.replace('    const body = await matchingObject(w.env, file)\n', '    await matchingObject(w.env, file)\n    const body = [new Uint8Array(await (await w.env.OBJECTS!.get(file.key))!.arrayBuffer())]\n'))], {SLOTS, HEAD}),
    ('R1', 'the download step runs after sign-out', RT, [("  'snapshots.chunk': {},\n", "  'snapshots.chunk': { anySession: true },\n")], {GRANTS}),
    ('R2', 'the request does not wait for the jobs gate', RT,
     [("vault: 'snapshots.request', gates: ['jobs'], starts: true }", "vault: 'snapshots.request', starts: true }")], {VALIDATION}),
    ('R3', 'the request starts no pending work', RT,
     [("vault: 'snapshots.request', gates: ['jobs'], starts: true }", "vault: 'snapshots.request', gates: ['jobs'] }")], {WORKFLOW_RUNS, CURSOR}),
]

FAILED = re.compile(r'^\s*×\s+test/(?:workers/)?(\S+)\s+>\s+(?:.+? > )?(.+?)(?:\s+\d+ms)?$')
IT_NAME = re.compile(r"""^\s*it\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")""")


def case_names(edge: str) -> set:
    names = set()
    for line in open(os.path.join(edge, T), encoding='utf-8'):
        match = IT_NAME.match(line)
        if match:
            raw = match.group(1) if match.group(1) is not None else match.group(2)
            names.add(case(raw.replace("\\'", "'").replace('\\"', '"')))
    return names


def run_focused(edge: str, log_path: str) -> tuple:
    out = subprocess.run(['npx', 'vitest', 'run', '--config', 'vitest.workers.config.ts', '--reporter=verbose', T], cwd=edge, capture_output=True, text=True, timeout=1200)
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
    for label, _description, rel, edits, required in MUTANTS:
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
            print(f'{label} requires a case the test file does not have: {name}')
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
    for label, description, rel, edits, required in MUTANTS:
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
