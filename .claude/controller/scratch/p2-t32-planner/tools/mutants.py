#!/usr/bin/env python3
"""P2-T32 mutation check. Usage: python3 -I mutants.py <worktree root> <log dir> [ids...]

Applies each mutant alone to the worktree, runs its tests, restores the file
byte for byte (sha256 checked), and prints one line per mutant. Exits 0 only
when every mutant ends as expected.
"""
import hashlib
import os
import subprocess
import sys

BIGGEST = 'apps/app/src/wallet/recap/biggestDay.ts'
SHARE = 'apps/app/src/wallet/recap/recapShare.ts'
CONFETTI = 'apps/app/src/wallet/recap/Confetti.tsx'
SCREEN = 'apps/app/src/wallet/recap/WalletRecapScreen.tsx'
SECTIONS = 'apps/app/src/dev/catalogue/wallet/recapSections.tsx'
RECAP_DATA = 'apps/app/src/screens/redesign/insights/recapData.ts'

NODE_BIGGEST = ['node', '--test', 'apps/app/src/wallet/recap/biggestDay.test.ts']
NODE_SHARE = ['node', '--test', 'apps/app/src/wallet/recap/recapShare.test.ts']
RENDER = ['npx', 'vitest', 'run', '--config', 'vitest.render.config.ts', '--reporter=verbose', 'src/wallet/recap/WalletRecap.render.test.tsx']

MUTANTS = [
    # biggestDay.ts: Node unit tests
    ('F1', 'killed', 'count deleted records as active', BIGGEST, NODE_BIGGEST, [
        ("if (record.deleted_at !== null) continue;", "// deleted records counted"),
    ]),
    ('F2', 'killed', 'count records from other months', BIGGEST, NODE_BIGGEST, [
        ("if (!record.occurred_on.startsWith(month + '-')) continue;", "// all months counted"),
    ]),
    ('F3', 'killed', 'count income records as expense', BIGGEST, NODE_BIGGEST, [
        ("if (record.type === 'expense') {", "if (record.type === 'expense' || record.type === 'income') {"),
    ]),
    ('F4', 'killed', 'pick later date on tie instead of earlier', BIGGEST, NODE_BIGGEST, [
        ("if (total > maxOut) {", "if (total >= maxOut) {"),
    ]),
    ('F5', 'killed', 'never report payday', BIGGEST, NODE_BIGGEST, [
        ("payday: dayHasSalary.has(maxDate)", "payday: false"),
    ]),
    ('F6', 'killed', 'always report payday', BIGGEST, NODE_BIGGEST, [
        ("payday: dayHasSalary.has(maxDate)", "payday: true"),
    ]),
    ('F7', 'killed', 'treat any income as salary', BIGGEST, NODE_BIGGEST, [
        ("if (record.category_id === salaryId || record.category_id === 'salary') {", "if (true) {"),
    ]),
    ('F8', 'killed', 'return a fake object instead of null when no records exist', BIGGEST, NODE_BIGGEST, [
        ("if (dayTotals.size === 0) return null;", "if (dayTotals.size === 0) return { date: '2026-10-01', outMinor: '100' as Minor, payday: false };"),
    ]),

    # recapShare.ts: Node unit tests
    ('S1', 'killed', 'leave spending in private share text (plan mutant)', SHARE, NODE_SHARE, [
        ("if (!hidden) {\n    lines.push(`${t('recap.spentLabel')}: ${walletMoneyText(input.spentMinor)}`);",
         "if (true) {\n    lines.push(`${t('recap.spentLabel')}: ${walletMoneyText(input.spentMinor)}`);"),
    ]),
    ('S2', 'killed', 'include category amounts in private mode', SHARE, NODE_SHARE, [
        ("if (hidden) {\n        lines.push(`• ${cat.name}`);\n      } else {",
         "if (false) {\n        lines.push(`• ${cat.name}`);\n      } else {"),
    ]),
    ('S3', 'killed', 'leave ฿ in private mode text', SHARE, NODE_SHARE, [
        ("lines.push(`• ${cat.name}`);", "lines.push(`• ${cat.name}: ฿0`);"),
    ]),
    ('S4', 'killed', 'omit days logged line', SHARE, NODE_SHARE, [
        ("const lines: string[] = [t('recap.title', { month: input.monthLabel }), input.daysLogged];",
         "const lines: string[] = [t('recap.title', { month: input.monthLabel })];"),
    ]),
    ('S5', 'killed', 'omit month title', SHARE, NODE_SHARE, [
        ("const lines: string[] = [t('recap.title', { month: input.monthLabel }), input.daysLogged];",
         "const lines: string[] = [input.daysLogged];"),
    ]),
    ('S6', 'killed', 'omit top categories from share text', SHARE, NODE_SHARE, [
        ("if (input.top.length > 0) {", "if (false) {"),
    ]),

    # Confetti.tsx: render test
    ('C1', 'killed', 'render 23 pieces instead of 24', CONFETTI, RENDER, [
        ("Array.from({ length: 24 }", "Array.from({ length: 23 }"),
    ]),
    ('C2', 'killed', 'render 25 pieces instead of 24', CONFETTI, RENDER, [
        ("Array.from({ length: 24 }", "Array.from({ length: 25 }"),
    ]),

    # WalletRecapScreen.tsx & recapData.ts: render tests
    ('R1', 'killed', 'play confetti while answer is pending (plan mutant)', SCREEN, RENDER, [
        ("if (isReduced === false) {", "if (true) {"),
    ]),
    ('R2', 'killed', 'play confetti under reduced motion', SCREEN, RENDER, [
        ("if (isReduced === false) {", "if (isReduced === true) {"),
    ]),
    ('R3', 'killed', 'never play celebration haptic', SCREEN, RENDER, [
        ("playHaptic('celebration');", "// haptic omitted"),
    ]),
    ('R4', 'killed', 'play wrong haptic instead of celebration', SCREEN, RENDER, [
        ("playHaptic('celebration');", "playHaptic('walletOpen' as any);"),
    ]),
    ('R5', 'killed', 'do not record confetti seen in device store', SCREEN, RENDER, [
        ("void walletDeviceStore().set(CONFETTI_NAME(month), '1');", "// store write omitted"),
    ]),
    ('R6', 'killed', 'show cashback card when tips are off', SCREEN, RENDER, [
        ("const cashbackCount = preferences?.cashback_tips", "const cashbackCount = true"),
    ]),
    ('R7', 'killed', 'share button says การ์ด (board wording violation)', SCREEN, RENDER, [
        ("label={t('recap.share')}", "label=\"แชร์การ์ดสรุป\""),
    ]),
    ('R8', 'killed', 'do not track recap shared on share', RECAP_DATA, RENDER, [
        ("trackRecapShared();", "// trackRecapShared omitted"),
    ]),
    ('R9', 'killed', 'do not track recap opened on load', RECAP_DATA, RENDER, [
        ("trackRecapOpened();", "// trackRecapOpened omitted"),
    ]),
    ('R10', 'killed', 'empty catalogue sections list', SECTIONS, RENDER, [
        ("export const WALLET_RECAP_SECTIONS: readonly CatalogueSection[] = [",
         "export const WALLET_RECAP_SECTIONS: readonly CatalogueSection[] = []; const UNUSED = ["),
    ]),
    ('R11', 'killed', 'omit error state guard on load failure', SCREEN, RENDER, [
        ("if (load.state === 'error') {", "if (false && load.state === 'error') {"),
    ]),
    ('R12', 'killed', 'invert over/under budget label', SCREEN, RENDER, [
        ("<Text style={{ color: colors.quiet }}>{isOver ? t('recap.over') : t('recap.under')}</Text>",
         "<Text style={{ color: colors.quiet }}>{isOver ? t('recap.under') : t('recap.over')}</Text>"),
    ]),
    ('R13', 'killed', 'show budget row when budget is null', SCREEN, RENDER, [
        ("{budgetLimitMinor !== null ? (\n            <View style={styles.cardRow}>\n              <Text style={{ color: colors.quiet }}>{t('recap.budget')}</Text>",
         "{true ? (\n            <View style={styles.cardRow}>\n              <Text style={{ color: colors.quiet }}>{t('recap.budget')}</Text>"),
    ]),
    ('R14', 'killed', 'play confetti on current month (non-past)', SCREEN, RENDER, [
        ("const isPast = monthPhase(month, today) === 'past';\n    if (!isPast) return;",
         "const isPast = true;\n    if (!isPast) return;"),
    ]),
    ('R15', 'killed', 'show cashback card when count is zero', SCREEN, RENDER, [
        ("{cashbackCount > 0 ? (\n          <Pressable\n            testID=\"recap-cashback-card\"",
         "{true ? (\n          <Pressable\n            testID=\"recap-cashback-card\""),
    ]),
]


def sha(path):
    with open(path, 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()


def apply_mutant(tree, rel, patches):
    full = os.path.join(tree, rel)
    with open(full, 'r', encoding='utf-8') as f:
        content = f.read()

    for old, new in patches:
        if old not in content:
            raise ValueError(f"patch target not found in {rel}: {old!r}")
        if content.count(old) > 1:
            raise ValueError(f"patch target ambiguous in {rel} ({content.count(old)} occurrences): {old!r}")
        content = content.replace(old, new, 1)

    with open(full, 'w', encoding='utf-8') as f:
        f.write(content)


def main():
    if len(sys.argv) < 3:
        print("Usage: python3 mutants.py <worktree root> <log dir> [ids...]")
        sys.exit(1)

    tree = sys.argv[1]
    logdir = sys.argv[2]
    os.makedirs(logdir, exist_ok=True)
    filter_ids = set(sys.argv[3:]) if len(sys.argv) > 3 else None

    failed = False
    for mid, exp, desc, rel, cmd, patches in MUTANTS:
        if filter_ids and mid not in filter_ids:
            continue

        full = os.path.join(tree, rel)
        orig_sha = sha(full)

        try:
            apply_mutant(tree, rel, patches)
            mut_sha = sha(full)
            if mut_sha == orig_sha:
                print(f"[ERROR] mutant {mid}: file did not change")
                failed = True
                continue

            cwd = os.path.join(tree, 'apps/app') if cmd[0] == 'npx' else tree
            proc = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
            status = 'survived' if proc.returncode == 0 else 'killed'

            logfile = os.path.join(logdir, f"mutant_{mid}.log")
            with open(logfile, 'w', encoding='utf-8') as lf:
                lf.write(f"MUTANT: {mid} ({desc})\n")
                lf.write(f"EXIT CODE: {proc.returncode}\n")
                lf.write(f"STDOUT:\n{proc.stdout}\n")
                lf.write(f"STDERR:\n{proc.stderr}\n")

            if status == exp:
                print(f"[PASS] mutant {mid}: {status} ({desc})")
            else:
                print(f"[FAIL] mutant {mid}: expected {exp}, got {status} ({desc})")
                failed = True
        finally:
            # Restore file from real/
            kit = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            real_file = os.path.join(kit, 'real', rel)
            with open(real_file, 'rb') as rf, open(full, 'wb') as wf:
                wf.write(rf.read())
            if sha(full) != orig_sha:
                print(f"[ERROR] failed to restore {rel} for mutant {mid}")
                sys.exit(1)

    if failed:
        sys.exit(1)
    print("\nAll mutants evaluated as expected.")


if __name__ == '__main__':
    main()
