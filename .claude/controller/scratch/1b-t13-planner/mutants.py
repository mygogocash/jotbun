#!/usr/bin/env python3
"""1B-T13 planner mutants. Each mutant is one exact replacement (it must match once) in a file under apps/edge.
Each runner a mutant names must fail for it to count as killed:
  node:<files>     npx vitest run --reporter=verbose <files>                      (Node unit tests)
  workers:<files>  npx vitest run --config vitest.workers.config.ts ... <files>   (workerd, focused files)
  c1               npm run build:edge, then the C1 Worker test on the built Worker (wrangler dev)
Every run takes and gives back the heavy lock (locked.sh). A c1 mutant rebuilds the edge before its run and again
after its restore. The file is restored from a saved copy and compared byte for byte (cmp).
Usage: mutants.py [--tree <repo root>] [--out <folder>] [--check] [ids...]   (--check: each replacement matches once; runs nothing)
The defaults are the planner's tree and proof/mutants; the implementer passes its worktree and its scratch folder.
Exit 0 only when every mutant is killed by every runner it names and every file is restored."""
import filecmp
import json
import os
import shutil
import subprocess
import sys

P = '/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1b-t13-planner'
TREE = P + '/tree'
OUT = P + '/proof/mutants'

SHAPE = 'node:test/c1-shape.test.ts'
COVERAGE = 'node:test/route-coverage.test.ts'
READY = 'node:test/ready.test.ts'
AI = 'workers:test/workers/ai.test.ts'

MUTANTS = [
    # The plan's three (Step 5).
    ('M1', 'wrangler.jsonc', '  "send_email": [{ "name": "EMAIL" }],\n',
     '  "send_email": [{ "name": "EMAIL" }],\n  "hyperdrive": [{ "binding": "HYPERDRIVE", "id": "00000000000000000000000000000000" }],\n',
     'plan: the hyperdrive block stays in wrangler.jsonc', [SHAPE]),
    ('M2', 'src/server.ts', '  queue: vaultWorker.queue,\n', '',
     'plan: src/server.ts drops the queue export', [SHAPE]),
    ('M3', 'src/v1/ready.ts', ' || !env.COMMAND_DIGEST_KEY) return notReady()', ') return notReady()',
     'plan: /ready skips the COMMAND_DIGEST_KEY check', ['c1', READY]),
    # /live and /ready.
    ('M4', 'src/v1/ready.ts', 'if (!env.AUTH_ISSUER || !env.AUTH_AUDIENCE', 'if (!env.AUTH_AUDIENCE', '/ready skips AUTH_ISSUER', [READY]),
    ('M5', 'src/v1/ready.ts', ' || !env.AUTH_AUDIENCE || ', ' || ', '/ready skips AUTH_AUDIENCE', [READY]),
    ('M6', 'src/v1/ready.ts', ' || !env.AUTH_JWKS_URL || ', ' || ', '/ready skips AUTH_JWKS_URL', [READY]),
    ('M7', 'src/v1/ready.ts', "    await env.CONFIG.get(EDGE_CONFIG_KEY, 'text')\n", '', '/ready never reads config:v1', [READY]),
    ('M8', 'src/v1/ready.ts',
     "  try {\n    await env.CONFIG.get(EDGE_CONFIG_KEY, 'text')\n  } catch (error) {\n    logFailure('ready_config_unreadable', error)\n    return notReady()\n  }\n",
     "  await env.CONFIG.get(EDGE_CONFIG_KEY, 'text')\n", '/ready lets a KV failure throw', [READY]),
    ('M9', 'src/v1/ready.ts', "env.CONFIG.get(EDGE_CONFIG_KEY, 'text')", "env.CONFIG.get('config', 'text')", '/ready reads another key', [READY]),
    ('M10', 'src/v1/ready.ts', 'const NOT_READY_RETRY_SECONDS = 30', 'const NOT_READY_RETRY_SECONDS = 5', '/ready asks for a 5-second retry', [READY]),
    ('M11', 'src/v1/ready.ts', "  return jsonResponse(200, { status: 'live' }, crypto.randomUUID())", "  return Response.json({ status: 'live' })",
     '/live answers without no-store', [READY]),
    ('M12', 'src/routes/ready.ts', 'GET: () => readyResponseOf(env as unknown as ReadyEnv)',
     "GET: () => new Response(JSON.stringify({ status: 'ready' }), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })",
     'the /ready route answers 200 whatever the settings', ['c1']),
    ('M13', 'src/routes/v1/$.ts', 'const handle = ({ request }: { request: Request }) => handleVaultV1(request, env as unknown as V1Env)',
     'const handle = (_: { request: Request }) => new Response(null, { status: 404 })', 'the /v1 route never reaches the vault', ['c1']),
    # The shape of the one Worker.
    ('M14', 'src/server.ts', "export { ExportWorkflow, SnapshotWorkflow, StatementParser, UserVault } from './vault-worker'",
     "export { ExportWorkflow, StatementParser, UserVault } from './vault-worker'", 'src/server.ts does not re-export SnapshotWorkflow', [SHAPE]),
    ('M15', 'wrangler.jsonc', '"class_name": "ExportWorkflow", "default_retention": { "success_retention": "1 day", "error_retention": "7 days" } }',
     '"class_name": "ExportWorkflow" }', 'carry-in n1: the export Workflow loses its retention', [SHAPE]),
    ('M16', 'wrangler.jsonc', '  "observability": { "enabled": true },\n', '  "observability": { "enabled": true },\n  "triggers": { "crons": ["0 * * * *"] },\n',
     'carry-in n7: a Cron Trigger the parity copy would keep', [SHAPE]),
    ('M17', 'wrangler.jsonc', '"dev": { "enable_containers": false }', '"dev": { "enable_containers": true }', 'local runs start containers', [SHAPE]),
    ('M18', 'wrangler.jsonc', '"producers": [{ "binding": "PARSE_QUEUE", "queue": "jotbun-statement-parse" }]',
     '"producers": [{ "binding": "PARSE_QUEUE", "queue": "jotbun-statement-parse" }, { "binding": "JOBS", "queue": "jotbun-jobs" }]',
     'a wake-up producer of the retired Workers stays', [SHAPE]),
    ('M19', 'vitest.workers.config.ts', "          main: './src/vault-worker.ts',\n", '', 'the workers tests lose their main (B15)', [SHAPE]),
    ('M20', 'vite.config.ts', "cloudflare({ viteEnvironment: { name: 'ssr' } }),", "cloudflare({ viteEnvironment: { name: 'ssr' }, auxiliaryWorkers: [] }),",
     'vite.config.ts keeps auxiliaryWorkers', [SHAPE]),
    # Route coverage against NestJS.
    ('M21', 'src/v1/routes.ts', "  'GET /v1/bridge/gogocash/catalogue',\n]", ']', 'the edge-only list loses the bridge', [COVERAGE]),
    ('M22', 'src/v1/routes.ts', "  'GET /v1/bridge/gogocash/catalogue',\n]", "  'GET /v1/bridge/gogocash/catalogue',\n  'GET /v1/sync/live',\n]",
     'the live socket is edge-only and added at once', [COVERAGE]),
    ('M23', 'src/v1/routes.ts', "vault: 'exports.request', gates: ['jobs'],", "vault: 'exports.request', gates: [],", 'a served route drifts from its NestJS gates', [COVERAGE]),
    ('M24', 'src/v1/routes.ts', "  'POST /v1/auth/deletion-receipt',\n]", "  'POST /v1/auth/deletion-receipt',\n  'POST /v1/auth/bootstrap',\n]",
     'a retired route is deferred too', [COVERAGE]),
    # The 1B-T7 review's m-1.
    ('M25', 'src/vault/ai.ts', "      if (month < '1970-01') return { result: null, figures: [] }\n", '', "carry-in m-1: no guard before the summary's month check", [AI]),
    ('M26', 'src/vault/ai.ts', "if (month < '1970-01')", "if (month <= '1970-01')", 'carry-in m-1: 1970-01 reads as no budget', [AI]),
    ('M27', 'src/vault/ai.ts', "      if (month < '1970-01') return { result: null, figures: [] }\n",
     "      if (month < '1970-01') throw new ToolInputError('month must be 1970-01 or later')\n", 'carry-in m-1: a tool error instead of no budget', [AI]),
    # The renamed module is the one the parse consumer test runs.
    ('M28', 'src/vault-worker.ts', '    return handleParseBatch(batch, env)\n', '    void [batch, env]\n    return Promise.resolve()\n',
     "the vault module's queue handler drops the batch", ['workers:test/workers/imports-parse.test.ts']),
]


def locked(log, argv, cwd):
    return subprocess.run([P + '/locked.sh', log, cwd, *argv], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode


def build(tag):
    with open(f'{OUT}/{tag}-build.log', 'w') as log:
        rc = subprocess.run(['npm', 'run', 'build:edge'], cwd=TREE, stdout=log, stderr=subprocess.STDOUT).returncode
    if rc != 0:
        sys.exit(f'build failed for {tag}')


def run(mid, runner, edge):
    tag = runner.split(':')[0]
    log = f'{OUT}/{mid}-{tag}.log'
    if runner == 'c1':
        argv = ['npx', 'vitest', 'run', '--config', 'vitest.db.config.ts', '--reporter=verbose', 'test/c1-worker.db.test.ts']
    elif tag == 'node':
        argv = ['npx', 'vitest', 'run', '--reporter=verbose', *runner.split(':', 1)[1].split(',')]
    elif tag == 'workers':
        argv = ['npx', 'vitest', 'run', '--config', 'vitest.workers.config.ts', '--reporter=verbose', *runner.split(':', 1)[1].split(',')]
    else:
        sys.exit(f'{mid}: unknown runner {runner}')
    rc = locked(log, argv, edge)
    summary = [line.strip() for line in open(log) if line.strip().startswith(('Tests ', '×', 'FAIL  test/'))][:12]
    return {'runner': runner, 'exit': rc, 'failed': rc != 0, 'summary': summary}


def main(args):
    global TREE, OUT
    ids = []
    check = False
    while args:
        arg = args.pop(0)
        if arg == '--tree':
            TREE = args.pop(0)
        elif arg == '--out':
            OUT = args.pop(0)
        elif arg == '--check':
            check = True
        else:
            ids.append(arg)
    E = TREE + '/apps/edge'
    if check:
        counts = [(mid, rel, open(f'{E}/{rel}', encoding='utf-8').read().count(old)) for mid, rel, old, _new, _what, _runners in MUTANTS]
        bad = [c for c in counts if c[2] != 1]
        print(f'{len(MUTANTS)} mutants; each replacement matches once: {not bad}; {bad}')
        return 0 if not bad else 1
    os.makedirs(OUT, exist_ok=True)
    results = []
    for mid, rel, old, new, what, runners in MUTANTS:
        if ids and mid not in ids:
            continue
        path = f'{E}/{rel}'
        saved = f'{OUT}/{mid}.orig'
        shutil.copyfile(path, saved)
        text = open(path, encoding='utf-8').read()
        if text.count(old) != 1:
            sys.exit(f'{mid}: the replacement matches {text.count(old)} times in {rel}')
        open(path, 'w', encoding='utf-8').write(text.replace(old, new))
        rebuild = 'c1' in runners
        if rebuild:
            build(mid)
        runs = [run(mid, runner, E) for runner in runners]
        shutil.copyfile(saved, path)
        same = filecmp.cmp(saved, path, shallow=False)
        if rebuild:
            build(mid + '-restored')
        results.append({'id': mid, 'what': what, 'file': rel, 'killed': all(r['failed'] for r in runs), 'restored': same, 'runs': runs})
        print(json.dumps(results[-1], ensure_ascii=False), flush=True)
    json.dump(results, open(f'{OUT}/results{"-" + "-".join(ids) if ids else ""}.json', 'w'), indent=2, ensure_ascii=False)
    survivors = [r['id'] for r in results if not r['killed']]
    unrestored = [r['id'] for r in results if not r['restored']]
    print(f'{sum(r["killed"] for r in results)} of {len(results)} killed; survivors {survivors}; not restored {unrestored}')
    return 0 if not survivors and not unrestored else 1


sys.exit(main(sys.argv[1:]))
