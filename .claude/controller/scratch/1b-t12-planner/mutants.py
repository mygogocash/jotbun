#!/usr/bin/env python3
"""1B-T12 planner mutants. Each mutant is one exact replacement (it must match once) in the tree. A mutant of
src/ rebuilds the edge before its run and again after its restore. Each run is the local files smoke through
run-smoke.sh (which takes and gives back the heavy lock), checked against smoke/expected-nest.json; the run's
answers are written to proof/mutants/<id>-run.json. The file is restored from a saved copy and compared byte for
byte (cmp). Usage: mutants.py [--tree <repo root>] [--out <folder>] [ids...]
The defaults are the planner's tree and proof/mutants; the implementer passes its worktree and its scratch folder.
Exit 0 only when every mutant run is killed and every file is restored."""
import filecmp
import json
import os
import shutil
import subprocess
import sys

P = '/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1b-t12-planner'
TREE = P + '/tree'
OUT = P + '/proof/mutants'

MUTANTS = [
    ('M1', 'src/vault/files/snapshots.ts', "status: dto.status === 'ready' ? 200 : 202", "status: dto.status === 'ready' ? 200 : 201",
     "plan: a new snapshot request answers 201"),
    ('M2', 'src/vault/files/intake.ts', "  return row.parse_state ?? 'cancelled'\n}", "  return row.parse_state === 'queued' ? 'parsing' : (row.parse_state ?? 'cancelled')\n}",
     "plan: a queued import reads parsing"),
    ('M3', 'test/support/vault-worker.ts', "  delete config.workflows\n", "",
     "background off keeps the Workflows"),
    ('M4', 'test/support/vault-worker.ts', "  if (config.queues) delete config.queues.consumers\n", "",
     "background off keeps the queue consumer"),
    ('M5', 'test/support/vault-worker.ts', "  delete config.containers\n", "",
     "background off keeps the container"),
    ('M6', 'test/support/vault-worker.ts', "      ...o.vars,\n", "",
     "vars are not passed"),
    ('M7', 'test/support/files-session.ts', "    if (mode === 'vault' && step.signIn) {", "    if (mode === 'vault' && step.signIn && false) {",
     "vault mode sends the two sign-in steps"),
    ('M8', 'test/support/files-session.ts', "  if (mode === 'vault') st.proofId = randomUUID()\n", "",
     "vault mode leaves proof_id unset"),
    ('M9', 'test/support/files-session.ts', "sub, sid, auth_time: now(), iat: now(), exp: now() + 300 })", "sub, sid, iat: now(), exp: now() + 300 })",
     "vault tokens carry no auth_time"),
    ('M10', 'test/support/files-session.ts',
     "  const accepted = await vault.send(new Request(`${BASE}/v1/me/policy-acceptances`, { method: 'POST', headers: { ...(await user.headers()), 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'terms', version: 1 }) }))\n  if (accepted.status !== 204) throw new Error(`The vault user could not accept terms v1: ${accepted.status}`)\n",
     "", "the vault user never accepts terms v1"),
    ('M11', 'src/vault/files/previews.ts', "WHERE u.job_id = ? AND u.accepted_at IS NOT NULL`", "WHERE u.job_id = ?`",
     "carry-in: the preview of a never-accepted upload is served"),
    ('M12', 'src/vault/files/intake.ts', "  return row && row.accepted_at !== null ? dtoOf(row) : null", "  return row ? dtoOf(row) : null",
     "carry-in: the status of a never-accepted upload is served"),
]


def build(tag):
    with open(f'{OUT}/{tag}-build.log', 'w') as log:
        rc = subprocess.run(['npm', 'run', 'build:edge'], cwd=TREE, stdout=log, stderr=subprocess.STDOUT).returncode
    if rc != 0:
        sys.exit(f'build failed for {tag}')


def listed(run_file):
    expected = json.load(open(P + '/smoke/expected-nest.json'))
    if not os.path.exists(run_file):
        return None
    run = json.load(open(run_file))
    return [r['step'] for r, e in zip(run, expected) if json.dumps(r, ensure_ascii=False) != json.dumps(e, ensure_ascii=False)]


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
    if not os.path.exists(E + '/test/vault-files.smoke.db.test.ts'):
        sys.exit(f'copy the files smoke into {E}/test first')
    os.makedirs(OUT, exist_ok=True)
    results = []
    for mid, rel, old, new, what in MUTANTS:
        if ids and mid not in ids:
            continue
        path = f'{E}/{rel}'
        saved = f'{OUT}/{mid}.orig'
        shutil.copyfile(path, saved)
        text = open(path).read()
        if text.count(old) != 1:
            sys.exit(f'{mid}: the replacement matches {text.count(old)} times in {rel}')
        open(path, 'w').write(text.replace(old, new))
        src = rel.startswith('src/')
        if src:
            build(mid)
        run_file = f'{OUT}/{mid}-run.json'
        if os.path.exists(run_file):
            os.remove(run_file)
        env = dict(os.environ, TREE=TREE, SMOKE_EXPECTED=P + '/smoke/expected-nest.json', SMOKE_OUT=run_file)
        rc = subprocess.run([P + '/run-smoke.sh', f'{OUT}/{mid}.log'], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode
        shutil.copyfile(saved, path)
        same = filecmp.cmp(saved, path, shallow=False)
        if src:
            build(mid + '-restored')
        summary = [line.strip() for line in open(f'{OUT}/{mid}.log') if line.strip().startswith(('Tests ', '×'))]
        results.append({'id': mid, 'what': what, 'file': rel, 'exit': rc, 'killed': rc != 0, 'restored': same, 'summary': summary, 'listed': listed(run_file)})
        print(json.dumps(results[-1], ensure_ascii=False))
    json.dump(results, open(f'{OUT}/results{"-" + "-".join(ids) if ids else ""}.json', 'w'), indent=2, ensure_ascii=False)
    survivors = [r['id'] for r in results if not r['killed']]
    unrestored = [r['id'] for r in results if not r['restored']]
    print(f'{sum(r["killed"] for r in results)} of {len(results)} killed; survivors {survivors}; not restored {unrestored}')
    return 0 if not survivors and not unrestored else 1


sys.exit(main(sys.argv[1:]))
