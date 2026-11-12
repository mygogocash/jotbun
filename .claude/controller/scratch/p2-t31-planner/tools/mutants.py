#!/usr/bin/env python3
"""P2-T31 mutation check. Usage: python3 -I tools/mutants.py <worktree root> <log dir> [ids...]

Applies each mutant alone to the worktree, runs its tests, restores the file
byte for byte (sha256 checked), and prints one line per mutant. Exits 0 only
when every mutant ends as expected.
"""
import hashlib
import os
import subprocess
import sys

SHADE = 'apps/app/src/wallet/insights/calendarShade.ts'
SCREEN = 'apps/app/src/wallet/insights/WalletInsightsScreen.tsx'
MONTH_BARS = 'apps/app/src/wallet/insights/MonthBars.tsx'
CALENDAR_TAB = 'apps/app/src/wallet/insights/CalendarTab.tsx'
SPENDING_TAB = 'apps/app/src/wallet/insights/SpendingTab.tsx'
IN_OUT_TAB = 'apps/app/src/wallet/insights/InOutTab.tsx'

NODE_SHADE = ['node', '--test', 'apps/app/src/wallet/insights/calendarShade.test.ts']
RENDER = ['npx', 'vitest', 'run', '--config', 'vitest.render.config.ts', '--reporter=verbose', 'src/wallet/insights/WalletInsights.render.test.tsx']

MUTANTS = [
    # calendarShade.ts: Node unit tests
    ('M1', 'killed', 'make ฿200 step 2 (plan mutant)', SHADE, NODE_SHADE, [
        ("if (satang <= 20000n) return 1;", "if (satang <= 20000n) return 2;"),
    ]),
    ('M2', 'killed', 'map zero to step 1', SHADE, NODE_SHADE, [
        ("if (satang <= 0n) return 0;", "if (satang <= 0n) return 1;"),
    ]),
    ('M3', 'killed', 'boundary 500 mapped to step 3', SHADE, NODE_SHADE, [
        ("if (satang <= 50000n) return 2;", "if (satang <= 50000n) return 3;"),
    ]),
    ('M4', 'killed', 'boundary 1000 mapped to step 4', SHADE, NODE_SHADE, [
        ("if (satang <= 100000n) return 3;", "if (satang <= 100000n) return 4;"),
    ]),
    ('M5', 'killed', 'boundary 2000 mapped to step 5', SHADE, NODE_SHADE, [
        ("if (satang <= 200000n) return 4;", "if (satang <= 200000n) return 5;"),
    ]),
    ('M6', 'killed', 'above 2000 mapped to step 4', SHADE, NODE_SHADE, [
        ("return 5;", "return 4;"),
    ]),

    # WalletInsightsScreen.tsx: Render tests
    ('M7', 'killed', 'send tab: inOut instead of in_out (plan mutant)', SCREEN, RENDER, [
        ("trackInsightsViewed({ tab });", "trackInsightsViewed({ tab: (tab === 'in_out' ? 'inOut' : tab) as any });"),
    ]),
    ('M8', 'killed', 'suppress analytics trackInsightsViewed', SCREEN, RENDER, [
        ("trackInsightsViewed({ tab });", "// no analytics"),
    ]),
    ('M9', 'killed', 'suppress InOutTab on tab switch', SCREEN, RENDER, [
        ("{tab === 'in_out' ? (", "{false && tab === 'in_out' ? ("),
    ]),
    ('M10', 'killed', 'suppress CalendarTab on tab switch', SCREEN, RENDER, [
        ("{tab === 'calendar' ? (", "{false && tab === 'calendar' ? ("),
    ]),

    # MonthBars.tsx: Render tests
    ('M11', 'killed', 'spoken label carries amounts in private mode', MONTH_BARS, RENDER, [
        ("if (hidden) {", "if (false) {"),
    ]),
    ('M12', 'killed', 'invert month bar colors (barNow vs barPast)', MONTH_BARS, RENDER, [
        ("const fill = bar.current ? colors.barNow : colors.barPast;", "const fill = bar.current ? colors.barPast : colors.barNow;"),
    ]),
    ('M13', 'killed', 'suppress budget guideline', MONTH_BARS, RENDER, [
        ("{budgetLineY !== null ? (", "{false ? ("),
    ]),

    # CalendarTab.tsx: Render tests
    ('M14', 'killed', 'keep the shades in private mode (plan mutant)', CALENDAR_TAB, RENDER, [
        ("const bg = hidden ? colors.raised : paint.fill;", "const bg = paint.fill;"),
    ]),
    ('M15', 'killed', 'show day amounts in private mode', CALENDAR_TAB, RENDER, [
        ("{!hidden && bahtText ? (", "{bahtText ? ("),
    ]),
    ('M16', 'killed', 'show legend labels in private mode', CALENDAR_TAB, RENDER, [
        ("{!hidden ? (", "{true ? ("),
    ]),
    ('M17', 'killed', 'drop framing of today', CALENDAR_TAB, RENDER, [
        ("const borderWidth = isToday ? 2 : paint.border ? 1 : 0;", "const borderWidth = 0;"),
    ]),
    ('M18', 'killed', 'render future days as active and interactive', CALENDAR_TAB, RENDER, [
        ("if (day.isFuture) {", "if (false && day.isFuture) {"),
    ]),
    ('M19', 'killed', 'drop calendarShade mapping in calendar grid', CALENDAR_TAB, RENDER, [
        ("const step = calendarShade(day.outMinor);", "const step = 0;"),
    ]),

    # SpendingTab.tsx: Render tests
    ('M20', 'killed', 'lower early state threshold to 1 day', SPENDING_TAB, RENDER, [
        ("const isEarly = daysLogged < 3;", "const isEarly = daysLogged < 1;"),
    ]),
    ('M21', 'killed', 'corrupt early state remaining days count', SPENDING_TAB, RENDER, [
        ("{t('insights.earlyTitle', { n: 3 - daysLogged })}", "{t('insights.earlyTitle', { n: 99 })}"),
    ]),
    ('M22', 'killed', 'corrupt category route navigation param', SPENDING_TAB, RENDER, [
        ("params: { category: cat.categoryId }", "params: { category: 'corrupted' }"),
    ]),

    # InOutTab.tsx: Render tests
    ('M23', 'killed', 'corrupt money in plus sign', IN_OUT_TAB, RENDER, [
        ("+\n            </WalletText>", "-\n            </WalletText>"),
    ]),
]


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


def apply_mutant(root, rel_path, edits):
    full = os.path.join(root, rel_path)
    with open(full, 'r', encoding='utf-8') as f:
        content = f.read()
    orig = content
    for target, rep in edits:
        if target not in content:
            raise RuntimeError(f"target chunk not found in {rel_path}:\n{target[:80]}")
        content = content.replace(target, rep, 1)
    with open(full, 'w', encoding='utf-8') as f:
        f.write(content)
    return orig


def restore(root, rel_path, orig, expected_hash):
    full = os.path.join(root, rel_path)
    with open(full, 'w', encoding='utf-8') as f:
        f.write(orig)
    cur = sha256(full)
    if cur != expected_hash:
        raise RuntimeError(f"corrupt restore of {rel_path}: expected {expected_hash}, got {cur}")


def run_command(cmd, root, log_path):
    cwd = root
    if cmd[0] == 'npx':
        cwd = os.path.join(root, 'apps/app')
    with open(log_path, 'wb') as lf:
        proc = subprocess.run(cmd, cwd=cwd, stdout=lf, stderr=subprocess.STDOUT)
    return proc.returncode


def main():
    if len(sys.argv) < 3:
        print("Usage: python3 -I tools/mutants.py <worktree root> <log dir> [ids...]")
        sys.exit(1)
    root = os.path.abspath(sys.argv[1])
    log_dir = os.path.abspath(sys.argv[2])
    os.makedirs(log_dir, exist_ok=True)
    filter_ids = set(sys.argv[3:]) if len(sys.argv) > 3 else None

    # Record clean hashes
    hashes = {}
    for _, _, _, rel_path, _, _ in MUTANTS:
        if rel_path not in hashes:
            full = os.path.join(root, rel_path)
            hashes[rel_path] = sha256(full)

    passed_all = True
    print(f"Running {len(MUTANTS)} mutants...")
    for mid, expected, label, rel_path, cmd, edits in MUTANTS:
        if filter_ids and mid not in filter_ids:
            continue
        full = os.path.join(root, rel_path)
        orig_hash = hashes[rel_path]
        orig_content = apply_mutant(root, rel_path, edits)
        log_file = os.path.join(log_dir, f"mutant-{mid}.log")
        try:
            rc = run_command(cmd, root, log_file)
            actual = 'killed' if rc != 0 else 'survived'
            status = 'OK' if actual == expected else 'FAIL'
            if status != 'OK':
                passed_all = False
            print(f"{mid:4} {actual:8} {status:4} {label} ({rel_path})")
        finally:
            restore(root, rel_path, orig_content, orig_hash)

    if not passed_all:
        sys.exit(1)
    print("All mutants killed as expected!")


if __name__ == '__main__':
    main()
