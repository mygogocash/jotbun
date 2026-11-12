"""P3-T2's mutation check and its three comparison runs.

Usage:
  python3 -I mutants.py --tree <tree> --out <dir> [--only M1,M2] [--compat]

Each mutant replaces one exact text (found exactly once) in one file of <tree>,
runs every runner it names, each under the heavy lock through locked.sh (next to
this script), then writes the file back byte for byte and checks its sha256. A
mutant is killed when every runner it names exits non-zero. The last line is
"<k> of <n> killed; survivors [...]; not restored [...]".

--compat runs the comparison runs instead (C1 to C4): each one has an expected
exit code, and the last line is "<k> of 4 as expected; unexpected [...]".
"""
import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
LOCKED = os.path.join(HERE, 'locked.sh')

WORKERS = ['npx', 'vitest', 'run', '--config', 'vitest.workers.config.ts', '--reporter=verbose']
RUNNERS = {
    'contracts': ('apps/edge', ['npx', 'vitest', 'run', '--reporter=verbose', 'test/contracts-source.test.ts']),
    'workers': ('apps/edge', WORKERS + ['test/workers/transaction-source.test.ts', 'test/workers/vault-schema.test.ts', 'test/workers/currency-migration.test.ts']),
    'currency': ('apps/edge', WORKERS + ['test/workers/currency-migration.test.ts']),
    'app': ('.', ['npm', 'run', 'test:unit', '-w', 'gogospend-app', '--', 'src/storage/diaryRepository.test.ts', 'src/api/aiClientVersion.test.ts']),
}

CONTRACT = 'packages/contracts/src/v1/transactions.ts'
AI = 'packages/contracts/src/v1/ai.ts'
SQL = 'apps/edge/src/vault/migrations/0005_transaction_source.sql'
JOURNAL = 'apps/edge/src/vault/migrations/index.ts'
SCHEMA = 'apps/edge/src/vault/schema.ts'
DOMAIN = 'apps/edge/src/vault/domain/transactions.ts'
DIARY = 'apps/app/src/storage/diaryRepository.ts'
APP_JSON = 'apps/app/app.json'
M0001 = 'apps/edge/src/vault/migrations/0001_vault_files.sql'
M0002 = 'apps/edge/src/vault/migrations/0002_currencies_trips.sql'

SQL_END = "'share_extension', 'siri'));\n"
M0001_END = "CREATE INDEX entity_changes_purged_idx ON entity_changes (revision) WHERE state = 'purged';\n"
CHECK = " CHECK (source IN ('typed', 'photo', 'slip_import', 'tell_bun', 'statement', 'share_extension', 'siri'))"

MUTANTS = [
    # The contract.
    ('M1', 'plan: parseTransactionSource accepts any string', CONTRACT, 'if (!isTransactionSource(value)) {', 'if (typeof value !== "string") {', ['contracts', 'workers']),
    ('M2', 'parseTransactionSource refuses null instead of reading it as none', CONTRACT, 'if (value === undefined || value === null) return null;\n  if (!isTransactionSource(value)) {', 'if (value === undefined) return null;\n  if (!isTransactionSource(value)) {', ['contracts', 'workers', 'app']),
    ('M3', 'a snapshot may hold any source', CONTRACT, '  if ("source" in record && !isTransactionSource(record.source)) return false;\n', '', ['contracts']),
    ('M4', 'a snapshot with a source fails the exact-key check', CONTRACT, '.filter((key) => key !== "attachment_id" && key !== "source")', '.filter((key) => key !== "attachment_id")', ['contracts', 'workers']),
    ('M5', 'the sources out of the spec order', CONTRACT, '["typed", "photo", "slip_import"', '["photo", "typed", "slip_import"', ['contracts']),
    ('M6', 'the client minimum lowered to 0.1.0', AI, 'export const AI_MIN_CLIENT_VERSION = "0.2.0";', 'export const AI_MIN_CLIENT_VERSION = "0.1.0";', ['app']),
    # The vault's column.
    ('M7', 'the column takes any text (no CHECK)', SQL, CHECK, '', ['workers']),
    ('M8', 'the CHECK leaves out siri', SQL, ", 'share_extension', 'siri'))", ", 'share_extension'))", ['workers']),
    ('M9', "the column is NOT NULL DEFAULT 'typed'", SQL, 'ADD COLUMN source TEXT CHECK', "ADD COLUMN source TEXT NOT NULL DEFAULT 'typed' CHECK", ['workers']),
    ('M10', "plan's rule: the upgrade loses the receipt links, as a rebuild's DROP TABLE would (CASCADE)", SQL, SQL_END, SQL_END + '--> statement-breakpoint\nDELETE FROM transaction_attachments;\n', ['workers']),
    ('M11', "checklist step 3: the journal entry's when equals 0004's", JOURNAL, "{ idx: 5, when: 1761782400000,", "{ idx: 5, when: 1761696000000,", ['workers']),
    ('M12', "the Drizzle schema has no source", SCHEMA, "  source: text('source'),\n", '', ['workers']),
    # The vault's commands and reads.
    ('M13', 'plan: the DTO mapping drops source', DOMAIN, '    ...(row.source ? { source: row.source } : {}),\n', '', ['workers']),
    ('M14', "plan: the edit's known fields include source", DOMAIN, 'assertKnownFields(call.body, [...COMMON_FIELDS, ...ENTRY_REFS, ...TRANSFER_REFS])', "assertKnownFields(call.body, [...COMMON_FIELDS, ...ENTRY_REFS, ...TRANSFER_REFS, 'source'])", ['workers']),
    ('M15', 'the create refuses source as an unknown field', DOMAIN, "...COMMON_FIELDS, ...refs, 'source'])", '...COMMON_FIELDS, ...refs])', ['workers']),
    ('M16', 'the digested payload always names the source, null when none', DOMAIN, 'payload: source === null ? draft : { ...draft, source }', 'payload: { ...draft, source }', ['workers']),
    ('M17', 'the digested payload leaves the source out', DOMAIN, 'payload: source === null ? draft : { ...draft, source }', 'payload: draft', ['workers']),
    ('M18', 'the insert writes no source', DOMAIN, 'draft.merchant,\n      source,\n', 'draft.merchant,\n      null,\n', ['workers']),
    ('M19', 'the shared read columns leave out source', DOMAIN, 'deleted_at, version, source,', 'deleted_at, version,', ['workers']),
    # The phone's outbox and version.
    ('M20', "the outbox never checks the source's value", DIARY, "  try {\n    parseTransactionSource(record.source);\n  } catch {\n    fail('source');\n  }\n", '', ['app']),
    ('M21', "an entry's allowed keys leave out source", DIARY, "'occurred_on', 'source', 'type', 'wallet_id'", "'occurred_on', 'type', 'wallet_id'", ['app']),
    ('M22', "a transfer's allowed keys leave out source", DIARY, "'occurred_on', 'source', 'source_wallet_id', 'type'", "'occurred_on', 'source_wallet_id', 'type'", ['app']),
    ('M23', 'plan: expo.version stays 0.1.0', APP_JSON, '"version": "0.2.0",', '"version": "0.1.0",', ['app']),
    # The follow-ups carried into currency-migration.test.ts (simulations on merged migrations, scratch only).
    ('M24', 'P5-T4 minor 1: an unseeded table that references wallets, made before the rebuild', M0001, M0001_END, M0001_END + '--> statement-breakpoint\nCREATE TABLE wallet_notes_probe (id TEXT PRIMARY KEY, wallet_id TEXT REFERENCES wallets (id)) STRICT;\n', ['currency']),
    ('M25', 'P5-T4 minor 2: a key to wallets with ON DELETE CASCADE, before the rebuild', M0001, 'wallet_id TEXT NOT NULL REFERENCES wallets (id),', 'wallet_id TEXT NOT NULL REFERENCES wallets (id) ON DELETE CASCADE,', ['currency']),
    ('M26', 'P5-T4 minor 2: a later key to wallets with ON DELETE CASCADE', SQL, SQL_END, SQL_END + '--> statement-breakpoint\nCREATE TABLE wallet_links_probe (id TEXT PRIMARY KEY, wallet_id TEXT REFERENCES wallets (id) ON DELETE CASCADE) STRICT;\n', ['currency']),
    ('M27', "the narrowed row check still pins 0002's columns (rate's default)", M0002, "rate TEXT NOT NULL DEFAULT '1'", "rate TEXT NOT NULL DEFAULT '2'", ['currency']),
]

BASE_TEST = 'apps/edge/test/workers/currency-migration-base.test.ts'
STANDIN = SQL_END + '--> statement-breakpoint\nCREATE TABLE slip_accounts_probe (id TEXT PRIMARY KEY, wallet_id TEXT REFERENCES wallets (id)) STRICT;\n'
# (id, description, edit or None, test file and extra vitest arguments, expected exit code)
COMPAT = [
    ('C1', "followup: the head's currency-migration test fails on this task's column (its exact-row case only)", None, [BASE_TEST], 1),
    ('C2', "followup: with a later table that references wallets (P4's slip_accounts), this task's test passes", (SQL, SQL_END, STANDIN), ['apps/edge/test/workers/currency-migration.test.ts'], 0),
    ('C3', "followup: with M24's unseeded table, the head's referencing-table case passes, so only this task's new assertion catches it", (M0001, M0001_END, M0001_END + '--> statement-breakpoint\nCREATE TABLE wallet_notes_probe (id TEXT PRIMARY KEY, wallet_id TEXT REFERENCES wallets (id)) STRICT;\n'), [BASE_TEST, '-t', 'every table that references wallets keeps its rows'], 0),
    ('C4', "followup: with C2's later table, the head's referencing-table case fails (the P5-T4 review's mutD), where this task's passes (C2)", (SQL, SQL_END, STANDIN), [BASE_TEST, '-t', 'every table that references wallets keeps its rows'], 1),
]


def sha(path):
    with open(path, 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()


def run_locked(tree, out, name, runner):
    rel, cmd = RUNNERS[runner] if isinstance(runner, str) else runner
    log = os.path.join(out, f'{name}.log')
    done = subprocess.run([LOCKED, log, os.path.join(tree, rel)] + cmd, capture_output=True, text=True)
    with open(log, encoding='utf-8', errors='replace') as f:
        text = f.read()
    failed = re.findall(r'^ +(?:×|FAIL) (.+?)(?: \d+ms)?$', text, re.M) + re.findall(r'^✖ (.+?) \(\d', text, re.M)
    return done.returncode, sorted(set(failed))[:12]


def apply(tree, rel, find, replace):
    path = os.path.join(tree, rel)
    with open(path, 'rb') as f:
        data = f.read()
    count = data.count(find.encode())
    if count != 1:
        raise SystemExit(f'{rel}: expected the text once, found it {count} times: {find!r}')
    with open(path, 'wb') as f:
        f.write(data.replace(find.encode(), replace.encode()))
    return path, data


def mutants(tree, out, only):
    results, survivors, unrestored = [], [], []
    chosen = [m for m in MUTANTS if not only or m[0] in only]
    for mid, desc, rel, find, replace, runners in chosen:
        before = sha(os.path.join(tree, rel))
        path, data = apply(tree, rel, find, replace)
        runs = {}
        try:
            for runner in runners:
                rc, failed = run_locked(tree, out, f'{mid}-{runner}', runner)
                runs[runner] = {'exit': rc, 'failed': failed}
        finally:
            with open(path, 'wb') as f:
                f.write(data)
        restored = sha(path) == before
        killed = all(r['exit'] != 0 for r in runs.values())
        if not killed:
            survivors.append(mid)
        if not restored:
            unrestored.append(mid)
        results.append({'id': mid, 'mutant': desc, 'file': rel, 'runs': runs, 'killed': killed, 'restored': restored})
        print(f"{mid} {'killed' if killed else 'SURVIVED'} {json.dumps({k: v['exit'] for k, v in runs.items()})} {desc}", flush=True)
    with open(os.path.join(out, 'results.json'), 'w') as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    print(f'{len(chosen) - len(survivors)} of {len(chosen)} killed; survivors {survivors}; not restored {unrestored}')
    return 0 if not survivors and not unrestored else 1


def compat(tree, out, base_test):
    results, unexpected = [], []
    test_path = os.path.join(tree, BASE_TEST)
    shutil.copyfile(base_test, test_path)
    try:
        for cid, desc, edit, test, expected in COMPAT:
            saved = None
            if edit:
                saved = apply(tree, *edit)
            try:
                rc, failed = run_locked(tree, out, cid, ('apps/edge', WORKERS + [test[0].removeprefix('apps/edge/')] + test[1:]))
            finally:
                if saved:
                    with open(saved[0], 'wb') as f:
                        f.write(saved[1])
            ok = rc == expected
            if not ok:
                unexpected.append(cid)
            results.append({'id': cid, 'run': desc, 'exit': rc, 'expected': expected, 'failed': failed})
            print(f"{cid} exit {rc} (expected {expected}) {failed} {desc}", flush=True)
    finally:
        os.remove(test_path)
    with open(os.path.join(out, 'compat.json'), 'w') as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    print(f'{len(COMPAT) - len(unexpected)} of {len(COMPAT)} as expected; unexpected {unexpected}')
    return 0 if not unexpected else 1


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--tree', required=True)
    parser.add_argument('--out', required=True)
    parser.add_argument('--only', default='')
    parser.add_argument('--compat', action='store_true')
    args = parser.parse_args()
    tree = os.path.abspath(args.tree)
    os.makedirs(args.out, exist_ok=True)
    if args.compat:
        sys.exit(compat(tree, os.path.abspath(args.out), os.path.join(HERE, 'orig', 'apps/edge/test/workers/currency-migration.test.ts')))
    sys.exit(mutants(tree, os.path.abspath(args.out), {m for m in args.only.split(',') if m}))


if __name__ == '__main__':
    main()
