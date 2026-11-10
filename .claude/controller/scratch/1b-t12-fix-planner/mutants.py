#!/usr/bin/env python3
"""1B-T12 fix kit: the mutants. Each mutant is a list of exact replacements (each must match once) in one file of
the tree. A mutant of src/ rebuilds the edge before its run and again after its restore. Runners:
  smoke       the files smoke (run-smoke.sh), checked against smoke/expected-nest.json; its answers go to <id>-run.json
  twin        the COMMITTED vault-parity-files.db.test.ts through the twin (run-twin.sh)
  twin-money  the COMMITTED vault-parity.db.test.ts through the twin, its two cases that run with no database
  probe       the n6 leak probe (test/n6-leak.probe.db.test.ts) through the twin config
Each run takes and gives back the heavy lock through its script. The file is restored from its saved copy and
compared byte for byte (cmp). Usage: mutants.py [--tree <repo root>] [--out <folder>] [ids...]
The defaults are the kit's tree and proof/mutants; the fixer passes its worktree and its scratch folder.
Exit 0 only when every mutant is killed and every file is restored."""
import filecmp
import json
import os
import shutil
import subprocess
import sys

K = '/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1b-t12-fix-planner'
TREE = K + '/tree'
OUT = K + '/proof/mutants'

VW = 'test/support/vault-worker.ts'
FS = 'test/support/files-session.ts'
UPLOADS_OFF = K + '/twin/expected-uploads-off.json'

# (id, file, [(old, new), ...], what, runner, env)
MUTANTS = [
    # The first round's twelve, through the files smoke (scratch/1b-t12-planner/mutants.py).
    ('M1', 'src/vault/files/snapshots.ts', [("status: dto.status === 'ready' ? 200 : 202", "status: dto.status === 'ready' ? 200 : 201")], 'plan: a new snapshot request answers 201', 'smoke', {}),
    ('M2', 'src/vault/files/intake.ts', [("  return row.parse_state ?? 'cancelled'\n}", "  return row.parse_state === 'queued' ? 'parsing' : (row.parse_state ?? 'cancelled')\n}")], 'plan: a queued import reads parsing', 'smoke', {}),
    ('M3', VW, [("  delete config.workflows\n", "")], 'background off keeps the Workflows', 'smoke', {}),
    ('M4', VW, [("  if (config.queues) delete config.queues.consumers\n", "")], 'background off keeps the queue consumer', 'smoke', {}),
    ('M5', VW, [("  delete config.containers\n", "")], 'background off keeps the container', 'smoke', {}),
    ('M6', VW, [("      ...o.vars,\n", "")], 'vars are not passed', 'smoke', {}),
    ('M7', FS, [("    if (mode === 'vault' && step.signIn) {", "    if (mode === 'vault' && step.signIn && false) {")], 'vault mode sends the two sign-in steps', 'smoke', {}),
    ('M8', FS, [("  if (mode === 'vault') st.proofId = randomUUID()\n", "")], 'vault mode leaves proof_id unset', 'smoke', {}),
    ('M9', FS, [("sub, sid, auth_time: now(), iat: now(), exp: now() + 300 })", "sub, sid, iat: now(), exp: now() + 300 })")], 'vault tokens carry no auth_time', 'smoke', {}),
    ('M10', FS, [("  const accepted = await vault.send(new Request(`${BASE}/v1/me/policy-acceptances`, { method: 'POST', headers: { ...(await user.headers()), 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'terms', version: 1 }) }))\n  if (accepted.status !== 204) throw new Error(`The vault user could not accept terms v1: ${accepted.status}`)\n", "")], 'the vault user never accepts terms v1', 'smoke', {}),
    ('M11', 'src/vault/files/previews.ts', [("WHERE u.job_id = ? AND u.accepted_at IS NOT NULL`", "WHERE u.job_id = ?`")], 'carry-in: the preview of a never-accepted upload is served', 'smoke', {}),
    ('M12', 'src/vault/files/intake.ts', [("  return row && row.accepted_at !== null ? dtoOf(row) : null", "  return row ? dtoOf(row) : null")], 'carry-in: the status of a never-accepted upload is served', 'smoke', {}),
    # This round's, through the committed tests (the twin) or the n6 probe.
    ('V1', VW, [("      ...o.vars,\n", "")], 'm1: uploads off on both sides (the vault without vars, NestJS replayed as the vault answers then)', 'twin', {'TWIN_EXPECTED': UPLOADS_OFF}),
    ('O1', VW, [("configFor(o.background ?? 'on')", "configFor(o.background ?? 'off')")], 'n5: the default background flips to off', 'twin-money', {}),
    ('O2', VW, [("  if (config.queues) delete config.queues.consumers\n", "  delete config.queues\n")], 'the parity config drops the whole queues key (the producer too)', 'twin', {}),
    ('O3', VW, [("    config,\n    stop() {", "    config: join(EDGE_DIR, VAULT_CONFIG),\n    stop() {")], 'the returned config names the built file, not the one started', 'twin', {}),
    ('O4', VW, [("  const worker = await startDevWorker({\n    config,\n", "  const worker = await startDevWorker({\n    config: join(EDGE_DIR, VAULT_CONFIG),\n")], 'wrangler starts the built file while the returned config names the parity copy', 'twin', {}),
    ('M3t', VW, [("  delete config.workflows\n", "")], 'n4 evidence: M3 (Workflows kept) through the committed test, a status difference', 'twin', {}),
    ('N6', VW, [
        ("  // Before the store is made: a config that cannot be read or written throws with no directory left behind.\n  const config = configFor(o.background ?? 'on')\n  const persistTo = mkdtempSync(", "  const persistTo = mkdtempSync("),
        ("  )\n  const worker = await startDevWorker({", "  )\n  const config = configFor(o.background ?? 'on')\n  const worker = await startDevWorker({"),
    ], "n6: configFor back after the store and the KV seeding (ef37c41's order)", 'probe', {}),
]


def build(tag):
    with open(f'{OUT}/{tag}-build.log', 'w') as log:
        rc = subprocess.run(['npm', 'run', 'build:edge'], cwd=TREE, stdout=log, stderr=subprocess.STDOUT).returncode
    if rc != 0:
        sys.exit(f'build failed for {tag}')


def listed(run_file):
    if not os.path.exists(run_file):
        return None
    expected = json.load(open(K + '/smoke/expected-nest.json'))
    run = json.load(open(run_file))
    return [r['step'] for r, e in zip(run, expected) if json.dumps(r, ensure_ascii=False) != json.dumps(e, ensure_ascii=False)]


def run(runner, mid, env):
    e = dict(os.environ, TREE=TREE, **env)
    log = f'{OUT}/{mid}.log'
    if runner == 'smoke':
        e.update(SMOKE_EXPECTED=K + '/smoke/expected-nest.json', SMOKE_OUT=f'{OUT}/{mid}-run.json')
        cmd = [K + '/run-smoke.sh', log]
    elif runner == 'twin':
        cmd = [K + '/run-twin.sh', 'vault-parity-files.db.test.ts', log]
    elif runner == 'twin-money':
        cmd = [K + '/run-twin.sh', 'vault-parity.db.test.ts', log, '-t', 'starts the built config|isolates people']
    else:
        cmd = [K + '/run-twin.sh', 'n6-leak.probe.db.test.ts', log]
    return subprocess.run(cmd, env=e, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode


def main(args):
    global TREE, OUT
    ids = []
    while args:
        arg = args.pop(0)
        if arg == '--tree':
            TREE = args.pop(0)
        elif arg == '--out':
            OUT = args.pop(0)
        else:
            ids.append(arg)
    E = TREE + '/apps/edge'
    for need in ('test/vault-files.smoke.db.test.ts', 'test/twin-mocks.ts', 'test/n6-leak.probe.db.test.ts', 'vitest.twin.config.ts'):
        if not os.path.exists(f'{E}/{need}'):
            sys.exit(f'copy {need} into {E} first')
    os.makedirs(OUT, exist_ok=True)
    results = []
    for mid, rel, pairs, what, runner, env in MUTANTS:
        if ids and mid not in ids:
            continue
        path = f'{E}/{rel}'
        saved = f'{OUT}/{mid}.orig'
        shutil.copyfile(path, saved)
        text = open(path).read()
        for old, new in pairs:
            if text.count(old) != 1:
                sys.exit(f'{mid}: a replacement matches {text.count(old)} times in {rel}')
            text = text.replace(old, new)
        open(path, 'w').write(text)
        src = rel.startswith('src/')
        if src:
            build(mid)
        run_file = f'{OUT}/{mid}-run.json'
        if os.path.exists(run_file):
            os.remove(run_file)
        try:
            rc = run(runner, mid, env)
        finally:
            shutil.copyfile(saved, path)
        same = filecmp.cmp(saved, path, shallow=False)
        if src:
            build(mid + '-restored')
        log = f'{OUT}/{mid}.log'
        lines = [line.strip() for line in open(log) if line.strip().startswith(('Tests ', '×', '→'))] if os.path.exists(log) else []
        results.append({'id': mid, 'what': what, 'file': rel, 'runner': runner, 'exit': rc, 'killed': rc != 0, 'restored': same, 'summary': lines, 'listed': listed(run_file) if runner == 'smoke' else None})
        print(json.dumps(results[-1], ensure_ascii=False), flush=True)
    json.dump(results, open(f'{OUT}/results{"-" + "-".join(ids) if ids else ""}.json', 'w'), indent=2, ensure_ascii=False)
    survivors = [r['id'] for r in results if not r['killed']]
    unrestored = [r['id'] for r in results if not r['restored']]
    print(f'{sum(r["killed"] for r in results)} of {len(results)} killed; survivors {survivors}; not restored {unrestored}')
    return 0 if not survivors and not unrestored else 1


sys.exit(main(sys.argv[1:]))
