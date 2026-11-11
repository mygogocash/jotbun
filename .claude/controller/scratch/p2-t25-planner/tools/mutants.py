#!/usr/bin/env python3
"""P2-T25 mutation check. Usage: python3 -I mutants.py <worktree root> <log dir> [ids...]

Applies each mutant alone to the worktree, runs the test suite, restores the file byte for byte (sha256 checked) and prints one line per mutant. Exits 0 only when every mutant ends as expected.
"""
import hashlib
import os
import subprocess
import sys

DATA = 'apps/app/src/screens/redesign/deleted/deletedData.ts'
SCREEN = 'apps/app/src/wallet/records/WalletDeletedScreen.tsx'

VITEST = ['npx', 'vitest', 'run', '--config', 'vitest.render.config.ts', 'src/wallet/records/WalletDeleted.render.test.tsx']

MUTANTS = [
    ('M1', 'killed', 'Count days left from delete day plus 31 (the plan\'s mutant)', SCREEN, VITEST, [
        ("isLastDay ? t('records.lastDay') : t('records.daysLeft', { n: row.daysLeft })",
         "isLastDay ? t('records.lastDay') : t('records.daysLeft', { n: row.daysLeft + 1 })")
    ]),
    ('M2', 'killed', 'Last day not highlighted in bold 700', SCREEN, VITEST, [
        ("const isLastDay = row.daysLeft === 1;",
         "const isLastDay = false;")
    ]),
    ('M3', 'killed', 'Private mode does not mask spoken restore label', SCREEN, VITEST, [
        ("const spoken = hidden ? t('common.amountHidden') : spokenMoney(row.amountMinor, t);",
         "const spoken = spokenMoney(row.amountMinor, t);")
    ]),
    ('M4', 'killed', 'Private mode does not hide amounts', SCREEN, VITEST, [
        ("const { hidden } = usePrivateMode();",
         "const hidden = false;")
    ]),
    ('M5', 'killed', 'Restore button height is 40 pt instead of 44 pt', SCREEN, VITEST, [
        ("minHeight: 44,\n          height: 44,",
         "minHeight: 40,\n          height: 40,")
    ]),
    ('M6', 'killed', 'Restore button border radius is 4 pt instead of pill 999 pt', SCREEN, VITEST, [
        ("borderRadius: 999,",
         "borderRadius: 4,")
    ]),
    ('M7', 'killed', 'Unconfirmed restore does not disable other restores', SCREEN, VITEST, [
        ("disabled={(busy && restoring !== row.recordId) || (held !== null && held.id !== row.recordId)}",
         "disabled={false}")
    ]),
    ('M8', 'killed', 'Frozen entry does not switch accessibilityLabel to Try again', SCREEN, VITEST, [
        ("accessibilityLabel={frozen ? tc('Try again') : restoreAriaLabel}",
         "accessibilityLabel={restoreAriaLabel}")
    ]),
    ('M9', 'killed', 'Frozen entry does not show Try again text', SCREEN, VITEST, [
        ("{tc('Try again')}",
         "{tc('Cancel')}")
    ]),
    ('M10', 'killed', 'Frozen entry generates new command key instead of resending same key', DATA, VITEST, [
        ("const key = keys.keyFor(slot, target);",
         "const key = `resend:${Math.random()}`;")
    ]),
    ('M11', 'killed', 'Restore refusal does not show plain domain reason', DATA, VITEST, [
        ("setNotice({ tone: 'alert', message: restoreRefusalText(v1?.outcome, v1?.fields ?? {}, tc) ?? saved.message, ...(saved.unconfirmed ? { about: target.id } : {}) });",
         "setNotice({ tone: 'alert', message: saved.message, ...(saved.unconfirmed ? { about: target.id } : {}) });")
    ]),
    ('M12', 'killed', 'Definite refusal does not reload the list in place', DATA, VITEST, [
        ("if (!saved.unconfirmed) void load(true);",
         "// if (!saved.unconfirmed) void load(true);")
    ]),
    ('M13', 'killed', 'Restore sends wrong row version to API', DATA, VITEST, [
        ("await resources.restoreTransaction(row.recordId, row.version, key);",
         "await resources.restoreTransaction(row.recordId, 1, key);")
    ]),
    ('M14', 'killed', 'Carry rule: omit trackRecordRestored on restore', DATA, VITEST, [
        ("trackRecordRestored({ kind: row.type });",
         "// trackRecordRestored({ kind: row.type });")
    ]),
    ('M15', 'killed', 'Empty state title does not say 30 days', SCREEN, VITEST, [
        ("title={model.emptyText ?? tc('Nothing deleted in the last 30 days')}",
         "title=\"Nothing deleted\"")
    ]),
    ('M16', 'killed', 'Empty state mascot art omitted', SCREEN, VITEST, [
        ("art={<Bun pose=\"sleepy\" size=\"l\" testID=\"recently-deleted-empty-bun\" />}",
         "art={null}")
    ]),
    ('M17', 'killed', 'Empty state mascot pose changed from sleepy', SCREEN, VITEST, [
        ("pose=\"sleepy\"",
         "pose=\"quiet\"")
    ]),
    ('M18', 'killed', 'Back fallback does not route to /spend/all', SCREEN, VITEST, [
        ("const goBack = useGoBack();",
         "const goBack = useGoBack('/spend');")
    ]),
    ('M19', 'killed', 'Retention policy header text omitted', SCREEN, VITEST, [
        ("{t('records.deletedPolicy')}",
         "// policy omitted")
    ]),
]

def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()

def run_mutants(worktree: str, log_dir: str, filter_ids: list[str]):
    os.makedirs(log_dir, exist_ok=True)
    all_ok = True
    active_mutants = [m for m in MUTANTS if not filter_ids or m[0] in filter_ids]

    app_dir = os.path.join(worktree, 'apps/app')

    for mid, expected, desc, rel_path, cmd, replacements in active_mutants:
        full_path = os.path.join(worktree, rel_path)
        orig_content = open(full_path, 'r', encoding='utf-8').read()
        orig_sha = sha256_file(full_path)

        mutated_content = orig_content
        for old, new in replacements:
            if old not in mutated_content:
                print(f"ERROR: mutant {mid} target pattern not found in {rel_path}: {old}")
                sys.exit(1)
            mutated_content = mutated_content.replace(old, new, 1)

        with open(full_path, 'w', encoding='utf-8') as f:
            f.write(mutated_content)

        log_file = os.path.join(log_dir, f"{mid}.log")
        res = subprocess.run(cmd, cwd=app_dir, capture_output=True, text=True)
        with open(log_file, 'w', encoding='utf-8') as lf:
            lf.write(f"=== {mid}: {desc} ===\nExit code: {res.returncode}\n--- STDOUT ---\n{res.stdout}\n--- STDERR ---\n{res.stderr}\n")

        with open(full_path, 'w', encoding='utf-8') as f:
            f.write(orig_content)

        restored_sha = sha256_file(full_path)
        if restored_sha != orig_sha:
            print(f"FATAL: file {rel_path} was not restored identically!")
            sys.exit(1)

        actual = 'killed' if res.returncode != 0 else 'survived'
        ok = (actual == expected)
        if not ok:
            all_ok = False
        status_sym = 'PASS' if ok else 'FAIL'
        print(f"[{status_sym}] {mid}: {actual} (expected {expected}) - {desc}")

    return 0 if all_ok else 1

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print("Usage: python3 -I mutants.py <worktree root> <log dir> [ids...]")
        sys.exit(1)
    worktree = sys.argv[1]
    log_dir = sys.argv[2]
    filter_ids = sys.argv[3:]
    sys.exit(run_mutants(worktree, log_dir, filter_ids))
