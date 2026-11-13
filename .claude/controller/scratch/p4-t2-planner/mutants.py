"""P4-T2's mutants: one per guard, each run against the focused test file that should kill it.

Usage: python3 -I mutants.py --tree <tree> --out <log dir> [--only ID,ID] [--batch sql|code|node]

Each mutant replaces exact text (each `old` must occur exactly once in its file),
runs its test file, and restores the file byte for byte (checked by SHA-256). A
mutant is killed when its run exits non-zero; the line says "killed (assertion)"
only when every failing case failed on an AssertionError (the count of failed
cases equals the count of AssertionError lines, and no other error starts a line).
Workers runs take the heavy lock through locked.sh, which sits next to this
script. The last line reads:
"<k> of <n> killed; survivors [...]; not clean [...]; not restored [...]".
"""
from __future__ import annotations

import argparse
import hashlib
import os
import re
import subprocess
import sys

KIT = os.path.dirname(os.path.abspath(__file__))

TABLES = 'apps/edge/migrations/catalog/0001_catalog.sql'
SEED = 'apps/edge/migrations/catalog/0002_catalog_seed.sql'
CATALOG = 'apps/edge/src/catalog/catalog.ts'
ROUTES = 'apps/edge/src/v1/routes.ts'
WORKER_ROUTES = 'apps/edge/src/v1/worker-routes.ts'
WRANGLER = 'apps/edge/wrangler.jsonc'
WORKERS_CONFIG = 'apps/edge/vitest.workers.config.ts'

BANK_CHECK = "CHECK (bank GLOB '[a-z]*' AND length(bank) BETWEEN 2 AND 16)"
PATTERN_CHECK = 'CHECK (length(pattern) BETWEEN 2 AND 60 AND pattern = lower(trim(pattern)))'
FRESH = 'if (last && nowMs - last.readAt < MERCHANTS_TTL_MS) return last.patterns\n'
LOGGED = "    logFailure('catalog_merchants_failed', error)\n"
SEPARATORS = "const SEPARATORS = /[^\\p{L}\\p{M}\\p{Nd}.'-]+/gu"
LOWER = '    .replace(/[A-Z]+/g, (upper) => upper.toLowerCase())\n'
FOUND = "const found = THAI.test(wanted) ? key.includes(wanted) : words.includes(` ${wanted} `)"
BETTER = '(best === null || wanted.length > best.length)'
TAG_TEST = "return header !== undefined && header.split(',').some((tag) => tag.trim().replace(/^W\\//, '') === etag)"
NOT_MODIFIED = "  if (namesTag(w.headers['if-none-match'], etag)) return { ok: true, status: 304, headers: { etag } }\n"
ALBUMS_QUERY = "'SELECT bank, platform, album_name FROM bank_albums ORDER BY bank, platform, album_name'"
NO_BINDING = "  if (!db) return { ok: false, status: 503, code: 'SERVICE_UNAVAILABLE', problem: { retryAfterSeconds: 30 } }\n"
ETAG = "const etag = `\"${createHash('sha256').update(JSON.stringify(body)).digest('hex')}\"`"
ROUTE = "{ method: 'GET', path: '/v1/catalog/bank-albums', access: 'public', worker: 'catalog.bankAlbums' }"
CATALOG_BINDING = (
    '    },\n'
    '    // The shared catalog (P4-T2): bank albums and merchant patterns. The id is a\n'
    '    // local placeholder until the owner creates jotbun-catalog (D33).\n'
    '    {\n'
    '      "binding": "CATALOG_DB",\n'
    '      "database_name": "jotbun-catalog",\n'
    '      "database_id": "00000000-0000-0000-0000-000000000002",\n'
    '      "migrations_dir": "migrations/catalog"\n'
    '    }\n'
    '  ],\n'
)

# (id, what it breaks, file, [(old, new), ...], test kind)
MUTANTS = [
    # The tables (migrations/catalog/0001_catalog.sql; the rules case and the seed case).
    ('S1', 'a bank may start with a capital', TABLES, [(BANK_CHECK, 'CHECK (length(bank) BETWEEN 2 AND 16)')], 'workers'),
    ('S2', 'a bank of any length', TABLES, [(BANK_CHECK, "CHECK (bank GLOB '[a-z]*')")], 'workers'),
    ('S3', 'any platform', TABLES, [("platform TEXT NOT NULL CHECK (platform IN ('ios', 'android'))", 'platform TEXT NOT NULL')], 'workers'),
    ('S4', 'an album name of any length', TABLES, [('album_name TEXT NOT NULL CHECK (length(album_name) BETWEEN 1 AND 60)', 'album_name TEXT NOT NULL')], 'workers'),
    ('S5', 'no album key: the same album twice', TABLES, [(', PRIMARY KEY (bank, platform, album_name)) STRICT;', ') STRICT;')], 'workers'),
    ('S6', 'bank_albums not STRICT', TABLES, [('PRIMARY KEY (bank, platform, album_name)) STRICT;', 'PRIMARY KEY (bank, platform, album_name));')], 'workers'),
    ('S7', 'a pattern of any length', TABLES, [(PATTERN_CHECK, 'CHECK (pattern = lower(trim(pattern)))')], 'workers'),
    ('S8', 'a pattern in any case or spacing', TABLES, [(PATTERN_CHECK, 'CHECK (length(pattern) BETWEEN 2 AND 60)')], 'workers'),
    ('S9', 'a pattern with spaces around it', TABLES, [('pattern = lower(trim(pattern))', 'pattern = lower(pattern)')], 'workers'),
    ('S10', 'a pattern in capitals', TABLES, [('pattern = lower(trim(pattern))', 'pattern = trim(pattern)')], 'workers'),
    ('S11', 'no pattern key: the same pattern twice, or none', TABLES, [('pattern TEXT PRIMARY KEY CHECK', 'pattern TEXT CHECK')], 'workers'),
    ('S12', 'a merchant with no category', TABLES, [('category_key TEXT NOT NULL CHECK', 'category_key TEXT CHECK')], 'workers'),
    ('S13', 'a category of any length', TABLES, [('category_key TEXT NOT NULL CHECK (length(category_key) BETWEEN 2 AND 32),', 'category_key TEXT NOT NULL,')], 'workers'),
    ('S14', 'an unknown GoGoCash flag', TABLES, [('gogocash_eligible INTEGER NOT NULL DEFAULT 0', 'gogocash_eligible INTEGER DEFAULT 0')], 'workers'),
    ('S15', 'merchants GoGoCash-eligible unless told otherwise', TABLES, [('DEFAULT 0 CHECK', 'DEFAULT 1 CHECK')], 'workers'),
    ('S16', 'any GoGoCash flag', TABLES, [(' CHECK (gogocash_eligible IN (0, 1))', '')], 'workers'),
    ('S17', 'merchants not STRICT', TABLES, [('IN (0, 1))) STRICT;', 'IN (0, 1)));')], 'workers'),
    # The seed (migrations/catalog/0002_catalog_seed.sql).
    ('S18', 'the seed leaves K PLUS on Android out', SEED, [("('kbank', 'ios', 'K PLUS'), ('kbank', 'android', 'K PLUS'),", "('kbank', 'ios', 'K PLUS'),")], 'workers'),
    ('S19', 'the seed files เซเว่น under shopping', SEED, [("('เซเว่น', 'food')", "('เซเว่น', 'shopping')")], 'workers'),
    ('S20', 'the seed stores a pattern that is not its own merchant key', SEED, [("('big c', 'shopping')", "('big  c', 'shopping')")], 'workers'),
    # merchantPatterns (src/catalog/catalog.ts).
    ('C1', 'no binding reads as a failure', CATALOG, [('  if (!db) return []\n  const last', '  const last')], 'workers'),
    ('C2', "a query on every read (the plan's mutant)", CATALOG, [(FRESH, '')], 'workers'),
    ('C3', 'a list read an hour ago still counts as fresh', CATALOG, [('nowMs - last.readAt < MERCHANTS_TTL_MS', 'nowMs - last.readAt <= MERCHANTS_TTL_MS')], 'workers'),
    ('C4', 'a failed read forgets the last list', CATALOG, [('return last?.patterns ?? []', 'return []')], 'workers'),
    ('C5', 'a failed read is not logged', CATALOG, [(LOGGED, '')], 'workers'),
    ('C6', 'a failed read counts as a read', CATALOG, [(LOGGED, LOGGED + '    merchantReads.set(db, { readAt: nowMs, patterns: last?.patterns ?? [] })\n')], 'workers'),
    ('C7', 'one list for every catalog binding', CATALOG, [('merchantReads.get(db)', 'merchantReads.get(merchantReads as never)'), ('merchantReads.set(db, {', 'merchantReads.set(merchantReads as never, {')], 'workers'),
    ('C8', 'the list is kept a millisecond longer than an hour', CATALOG, [('export const MERCHANTS_TTL_MS = 3_600_000', 'export const MERCHANTS_TTL_MS = 3_600_001')], 'workers'),
    # merchantKey.
    ('K1', 'no NFC', CATALOG, [("    .normalize('NFC')\n", '')], 'workers'),
    ('K2', 'every letter lowered, not only ASCII', CATALOG, [(LOWER, '    .toLowerCase()\n')], 'workers'),
    ('K3', "marks are separators (the plan's mutant)", CATALOG, [(SEPARATORS, "const SEPARATORS = /[^\\p{L}\\p{Nd}.'-]+/gu")], 'workers'),
    ('K4', 'digits are separators', CATALOG, [(SEPARATORS, "const SEPARATORS = /[^\\p{L}\\p{M}.'-]+/gu")], 'workers'),
    ('K5', 'Thai digits are separators', CATALOG, [(SEPARATORS, "const SEPARATORS = /[^\\p{L}\\p{M}0-9.'-]+/gu")], 'workers'),
    ('K6', 'dots are separators', CATALOG, [(SEPARATORS, "const SEPARATORS = /[^\\p{L}\\p{M}\\p{Nd}'-]+/gu")], 'workers'),
    ('K7', 'apostrophes are separators', CATALOG, [(SEPARATORS, "const SEPARATORS = /[^\\p{L}\\p{M}\\p{Nd}.-]+/gu")], 'workers'),
    ('K8', 'hyphens are separators', CATALOG, [(SEPARATORS, "const SEPARATORS = /[^\\p{L}\\p{M}\\p{Nd}.']+/gu")], 'workers'),
    ('K9', 'each separator is its own space', CATALOG, [(SEPARATORS, "const SEPARATORS = /[^\\p{L}\\p{M}\\p{Nd}.'-]/gu")], 'workers'),
    ('K10', 'no trim', CATALOG, [("    .replace(SEPARATORS, ' ')\n    .trim()\n", "    .replace(SEPARATORS, ' ')\n")], 'workers'),
    ('K11', 'ASCII capitals kept', CATALOG, [(LOWER, '')], 'workers'),
    # matchMerchant.
    ('M1', "Latin patterns match inside words (the plan's mutant: Makrobiotic)", CATALOG, [(FOUND, 'const found = key.includes(wanted)')], 'workers'),
    ('M2', 'Thai patterns match whole words only', CATALOG, [(FOUND, 'const found = words.includes(` ${wanted} `)')], 'workers'),
    ('M3', 'the first match wins, not the longest', CATALOG, [(BETTER, 'best === null')], 'workers'),
    ('M4', 'the last listed wins a tie', CATALOG, [('wanted.length > best.length', 'wanted.length >= best.length')], 'workers'),
    ('M5', 'the name is not keyed', CATALOG, [('  const key = merchantKey(name)\n', '  const key = name\n')], 'workers'),
    ('M6', 'patterns are not keyed', CATALOG, [('    const wanted = merchantKey(pattern)\n', '    const wanted = pattern\n')], 'workers'),
    ('M7', 'a pattern with nothing left matches', CATALOG, [("    if (wanted === '') continue\n", '')], 'workers'),
    ('M8', 'a missing name throws', CATALOG, [('  if (name === null) return null\n', '')], 'workers'),
    # handleBankAlbums.
    ('H1', "no 304 (the plan's mutant)", CATALOG, [(NOT_MODIFIED, '')], 'workers'),
    ('H2', 'any If-None-Match is 304', CATALOG, [(TAG_TEST, 'return header !== undefined')], 'workers'),
    ('H3', 'a weak tag never matches', CATALOG, [(TAG_TEST, "return header !== undefined && header.split(',').some((tag) => tag.trim() === etag)")], 'workers'),
    ('H4', 'If-None-Match is one tag, not a list', CATALOG, [(TAG_TEST, "return header !== undefined && header.replace(/^W\\//, '') === etag")], 'workers'),
    ('H5', 'list entries are not trimmed', CATALOG, [('tag.trim().replace', 'tag.replace')], 'workers'),
    ('H6', "unknown banks kept (the plan's mutant)", CATALOG, [('results.filter((album) => isThaiBankKey(album.bank))', 'results')], 'workers'),
    ('H7', 'the albums in no order', CATALOG, [(ALBUMS_QUERY, "'SELECT bank, platform, album_name FROM bank_albums'")], 'workers'),
    ('H8', 'the albums by bank, name, then platform', CATALOG, [(ALBUMS_QUERY, "'SELECT bank, platform, album_name FROM bank_albums ORDER BY bank, album_name, platform'")], 'workers'),
    ('H9', 'the tag is not of the body', CATALOG, [('update(JSON.stringify(body))', 'update(JSON.stringify(body.albums))')], 'workers'),
    ('H10', 'the tag is not quoted', CATALOG, [(ETAG, "const etag = createHash('sha256').update(JSON.stringify(body)).digest('hex')")], 'workers'),
    ('H11', 'the 304 carries no tag', CATALOG, [('return { ok: true, status: 304, headers: { etag } }', 'return { ok: true, status: 304 }')], 'workers'),
    ('H12', 'no binding reaches the query (a 500)', CATALOG, [(NO_BINDING, '')], 'workers'),
    ('H13', 'the 503 asks for no retry', CATALOG, [('problem: { retryAfterSeconds: 30 }', 'problem: {}')], 'workers'),
    ('H14', 'a request without If-None-Match fails (a 500)', CATALOG, [(TAG_TEST, "return (header as string).split(',').some((tag) => tag.trim().replace(/^W\\//, '') === etag)")], 'workers'),
    ('H15', 'the 200 carries no tag', CATALOG, [('return { ok: true, status: 200, body, headers: { etag } }', 'return { ok: true, status: 200, body }')], 'workers'),
    # The route table, the binding and the test config (Node: route-coverage and c1-shape).
    ('R1', 'the list needs a session', ROUTES, [(ROUTE, ROUTE.replace("access: 'public'", "access: 'bound_session'"))], 'node'),
    ('R2', 'the list is not an added route', ROUTES, [(", 'GET /v1/catalog/bank-albums']", ']')], 'node'),
    ('R3', 'the list has no Worker handler', WORKER_ROUTES, [("  'catalog.bankAlbums': handleBankAlbums,\n", '')], 'node'),
    ('R4', 'the list waits for the imports gate', ROUTES, [(ROUTE, ROUTE.replace(" }", ", gates: ['imports'] }"))], 'node'),
    ('R5', 'the list waits for slip import', ROUTES, [(ROUTE, ROUTE.replace(" }", ", release: 'SLIP_IMPORT_ENABLED' }"))], 'node'),
    ('R6', 'no CATALOG_DB binding', WRANGLER, [(CATALOG_BINDING, '    }\n  ],\n')], 'node'),
    ('R7', 'the binding names another migrations folder', WRANGLER, [('"migrations_dir": "migrations/catalog"', '"migrations_dir": "migrations/catalogue"')], 'node'),
    ('R8', 'the workers tests migrate another folder', WORKERS_CONFIG, [("readD1Migrations('./migrations/catalog')", "readD1Migrations('./migrations/erasure')")], 'node'),
]

BATCHES = {
    'sql': [m[0] for m in MUTANTS if m[0].startswith('S')],
    'code': [m[0] for m in MUTANTS if m[0][0] in 'CKMH'],
    'node': [m[0] for m in MUTANTS if m[4] == 'node'],
}


def command(kind: str, tree: str, log: str) -> list[str]:
    edge = os.path.join(tree, 'apps/edge')
    if kind == 'node':
        return ['npx', 'vitest', 'run', '--reporter=verbose', 'test/route-coverage.test.ts', 'test/c1-shape.test.ts']
    locked = os.path.join(KIT, 'locked.sh')
    return [locked, log, edge, 'npx', 'vitest', 'run', '--config', 'vitest.workers.config.ts', '--reporter=verbose', 'test/workers/catalog.test.ts']


def sha(target: str) -> str:
    with open(target, 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()


def verdict(body: str) -> tuple[int, int, int]:
    """(failed cases, AssertionError lines, other error lines) from a vitest log."""
    failed = re.search(r'Tests\s+(\d+) failed', body)
    assertions = len(re.findall(r'^AssertionError', body, re.M))
    others = len(re.findall(r'^(?:TypeError|ReferenceError|SyntaxError|RangeError|Error|SqliteError)\b[^\n]*:', body, re.M))
    return (int(failed.group(1)) if failed else 0, assertions, others)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--tree', required=True)
    parser.add_argument('--out', required=True)
    parser.add_argument('--only', default='')
    parser.add_argument('--batch', default='')
    args = parser.parse_args()
    tree = os.path.abspath(args.tree)
    out = os.path.abspath(args.out)
    os.makedirs(out, exist_ok=True)
    only = {m for m in args.only.split(',') if m}
    if args.batch:
        only |= set(BATCHES[args.batch])
    killed, survivors, unclean, unrestored, ran = [], [], [], [], 0
    for mid, what, rel, swaps, kind in MUTANTS:
        if only and mid not in only:
            continue
        ran += 1
        target = os.path.join(tree, rel)
        with open(target, encoding='utf-8') as f:
            original = f.read()
        digest = sha(target)
        text = original
        for old, new in swaps:
            count = text.count(old)
            if count != 1:
                print(f'{mid} BAD ANCHOR ({count} matches) in {rel}: {old[:60]!r}', flush=True)
                return 2
            text = text.replace(old, new)
        with open(target, 'w', encoding='utf-8') as f:
            f.write(text)
        log = os.path.join(out, f'{mid}.log')
        try:
            argv = command(kind, tree, log)
            if kind == 'node':
                with open(log, 'w', encoding='utf-8') as f:
                    rc = subprocess.run(argv, cwd=os.path.join(tree, 'apps/edge'), stdout=f, stderr=subprocess.STDOUT).returncode
            else:
                rc = subprocess.run(argv, cwd=tree, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode
        finally:
            with open(target, 'w', encoding='utf-8') as f:
                f.write(original)
        if sha(target) != digest:
            unrestored.append(mid)
        with open(log, encoding='utf-8', errors='replace') as f:
            body = f.read()
        failed, assertions, others = verdict(body)
        clean = failed > 0 and assertions == failed and others == 0
        if rc != 0:
            killed.append(mid)
            if not clean:
                unclean.append(mid)
            print(f'{mid} killed ({"assertion" if clean else "NOT CLEAN"}; {failed} failed): {what} [{kind}]', flush=True)
        else:
            survivors.append(mid)
            print(f'{mid} SURVIVED: {what} [{kind}]', flush=True)
    print(f'{len(killed)} of {ran} killed; survivors {survivors}; not clean {unclean}; not restored {unrestored}', flush=True)
    return 0 if not survivors and not unclean and not unrestored else 1


if __name__ == '__main__':
    sys.exit(main())
