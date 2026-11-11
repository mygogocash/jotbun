#!/usr/bin/env python3
"""P2-T23 mutation check. Usage: python3 -I mutants.py <worktree root> <log dir> [ids...]

Applies each mutant alone to the worktree, runs its tests (homeWallets.test.ts
for homeWallets.ts and the moved availableBalances.ts; budgetCardWords.test.ts
for budgetCardWords.ts and the copy; homeData.render.test.tsx for the hook;
HomeScreen.render.test.tsx for what only Home's own suite pins), restores the
file byte for byte (sha256 checked) and prints one line per mutant. Exits 0
only when every mutant ends as expected (all are expected killed).
"""
import hashlib
import os
import re
import subprocess
import sys

WALLETS = 'apps/app/src/wallet/home/homeWallets.ts'
BALANCES = 'apps/app/src/spend/v1/redesign/availableBalances.ts'
WORDS = 'apps/app/src/wallet/home/budgetCardWords.ts'
COPY = 'apps/app/src/wallet/home/copy.ts'
DATA = 'apps/app/src/screens/redesign/homeData.ts'
SCREEN = 'apps/app/src/screens/redesign/HomeScreen.tsx'

NODE_WALLETS = ['npm', 'run', 'test:unit', '--', 'src/wallet/home/homeWallets.test.ts']
NODE_WORDS = ['npm', 'run', 'test:unit', '--', 'src/wallet/home/budgetCardWords.test.ts']
HOOK = ['npx', 'vitest', 'run', '--config', 'vitest.render.config.ts', '--reporter=verbose', 'src/screens/redesign/homeData.render.test.tsx']
HOME = ['npx', 'vitest', 'run', '--config', 'vitest.render.config.ts', '--reporter=verbose', 'src/screens/redesign/HomeScreen.render.test.tsx']
NODE = (NODE_WALLETS, NODE_WORDS)

ON_TRACK = "  if (hidden || perDay === null) return { text: t('home.onTrack'), spoken: t('home.onTrack'), tone };\n"
HIDDEN_OVER = "    if (hidden) return { text: t('home.overWord'), spoken: t('home.overWord'), tone: 'over' };\n"
OVER = "    return { text: t('home.over', { amount: walletMoneyText(over) }), spoken: t('home.over', { amount: spokenMoney(over, t) }), tone: 'over' };\n"
PER_DAY = "  return { text: t('home.perDay', { amount: perDayText(perDay) }), spoken: t('home.perDay', { amount: spokenMoney(wholeBaht(perDay), t) }), tone };\n"
TOTAL = ("  const total = hidden\n"
         "    ? t('home.spokenSpent', { amount: t('common.amountHidden') })\n"
         "    : pace.limitMinor === null\n")
RESOLVE = "  useRefreshOnResolve(diaryView.outbox, loaded.refresh);\n"
REVISION = "  useRefreshOnRevision(diaryView.appliedRevision, loaded.refresh);\n"
CROSSING = "    if (crossedLevel(lastBudgetLevel, next) !== null) playHaptic('thresholdCrossed');\n"
KEEP_LEVEL = "    lastBudgetLevel = next;\n"

# (id, description, file, tests, [(old, new), ...]); each old must occur exactly once. Every mutant is expected killed.
MUTANTS = [
    # homeWallets.ts: the Node test
    ('H1', "the front card drawn first (the plan's mutant)", WALLETS, NODE_WALLETS,
     [('  return frontFirst(input.wallets, input.order).reverse().map((wallet) => ({\n', '  return frontFirst(input.wallets, input.order).map((wallet) => ({\n')]),
    ('H2', 'archived wallets on the stack', WALLETS, NODE_WALLETS, [('new Map(wallets.filter((wallet) => !wallet.archived).map(', 'new Map(wallets.map(')]),
    ('H3', 'the rest in the order Jotbun lists them', WALLETS, NODE_WALLETS,
     [('[...left.values()].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))', '[...left.values()]')]),
    ('H4', 'the same name not ordered by id', WALLETS, NODE_WALLETS, [('a.name.localeCompare(b.name) || a.id.localeCompare(b.id)', 'a.name.localeCompare(b.name)')]),
    ('H5', 'the kept order ignored', WALLETS, NODE_WALLETS, [('  for (const id of order) {\n', '  for (const id of [] as string[]) {\n')]),
    ('H6', 'an id the order names twice drawn twice', WALLETS, NODE_WALLETS, [('    left.delete(id);\n', '')]),
    ('H7', 'the kept wallets behind the rest', WALLETS, NODE_WALLETS, [('  return [...kept, ...rest];\n', '  return [...rest, ...kept];\n')]),
    ('H8', "the server's balance, with nothing waiting taken off", WALLETS, NODE_WALLETS,
     [('    balanceMinor: balances.get(wallet.id) ?? wallet.balance_minor,\n', '    balanceMinor: wallet.balance_minor,\n')]),
    ('H9', 'drafts being checked or refused counted as saving', WALLETS, NODE_WALLETS, [('    if (!WAITING_STATES.includes(command.state)) continue;\n', '')]),
    ('H10', "a transfer not saving in the wallet it goes to", WALLETS, NODE_WALLETS, [('      add(entry.destination_wallet_id, amount);\n', '')]),
    ('H11', 'a transfer not saving in the wallet it leaves', WALLETS, NODE_WALLETS, [('      add(entry.source_wallet_id, amount);\n', '')]),
    ('H12', 'an expense or income never saving', WALLETS, NODE_WALLETS, [('      add(entry.wallet_id, amount);\n', '')]),
    ('H13', 'the saving total worked out in a JS number', WALLETS, NODE_WALLETS,
     [('    saving.set(id, (saving.get(id) ?? 0n) + amount);\n', '    saving.set(id, BigInt(Number(saving.get(id) ?? 0n) + Number(amount)));\n')]),
    ('H14', 'income and transfers counted as spent today', WALLETS, NODE_WALLETS, [("    if (record.type !== 'expense') continue;\n", '')]),
    ('H15', 'income counted as spent today', WALLETS, NODE_WALLETS, [("    if (record.type !== 'expense') continue;\n", "    if (record.type === 'transfer') continue;\n")]),
    ('H16', "today's money out worked out in a JS number", WALLETS, NODE_WALLETS,
     [('    spent.set(record.wallet_id, (spent.get(record.wallet_id) ?? 0n) + BigInt(record.amount_minor));\n',
       '    spent.set(record.wallet_id, BigInt(Number(spent.get(record.wallet_id) ?? 0n) + Number(record.amount_minor)));\n')]),
    ('H17', 'waiting drafts counted as spent today', WALLETS, NODE_WALLETS,
     [('  const spent = spentByWallet(input.todayRecords);\n',
       '  const spent = spentByWallet([...input.todayRecords, ...input.outbox.map((command) => command.payload as TransactionDto)]);\n')]),
    ('H18', 'the look ignores what is kept', WALLETS, NODE_WALLETS,
     [("import type { WalletLook } from '../looks/walletLooks.ts';\n", "import type { WalletLook } from '../looks/walletLooks.ts';\nimport { derivedLook } from '../looks/walletLooks.ts';\n"),
      ('    look: input.lookOf(wallet.id),\n', '    look: derivedLook(wallet.id),\n')]),
    ('H19', 'a card with nothing saving says null, not 0', WALLETS, NODE_WALLETS,
     [('    pendingMinor: (saving.get(wallet.id) ?? 0n).toString(),\n', '    pendingMinor: saving.get(wallet.id)?.toString() ?? null,\n')]),
    ('H20', 'a card named by its id', WALLETS, NODE_WALLETS, [('    name: wallet.name,\n', '    name: wallet.id,\n')]),
    # availableBalances.ts (P2-T5's rule, moved): the homeWallets Node test
    ('B1', "drafts being checked taken off the balance", BALANCES, NODE_WALLETS, [('    if (!WAITING_STATES.includes(command.state)) continue;\n', '')]),
    ('B2', 'waiting income taken off too', BALANCES, NODE_WALLETS,
     [("      move(entry.wallet_id, entry.type === 'expense' ? -amount : amount);\n", '      move(entry.wallet_id, -amount);\n')]),
    ('B3', 'a transfer leaves its source untouched', BALANCES, NODE_WALLETS, [('      move(entry.source_wallet_id, -amount);\n', '')]),
    ('B4', 'a transfer moves the wrong way', BALANCES, NODE_WALLETS,
     [('      move(entry.source_wallet_id, -amount);\n      move(entry.destination_wallet_id, amount);\n', '      move(entry.source_wallet_id, amount);\n      move(entry.destination_wallet_id, -amount);\n')]),
    ('B5', 'a draft for a wallet not listed is moved anyway', BALANCES, NODE_WALLETS,
     [('    if (balance !== undefined) held.set(id, balance + delta);\n', '    held.set(id, (balance as bigint) + delta);\n')]),
    ('B6', 'the balance worked out in a JS number', BALANCES, NODE_WALLETS,
     [('    if (balance !== undefined) held.set(id, balance + delta);\n', '    if (balance !== undefined) held.set(id, BigInt(Number(balance) + Number(delta)));\n')]),
    # budgetCardWords.ts: the Node test
    ('W1', "the per-day amount shown in private mode (the plan's mutant)", WORDS, NODE_WORDS,
     [(ON_TRACK, "  if (perDay === null) return { text: t('home.onTrack'), spoken: t('home.onTrack'), tone };\n")]),
    ('W2', 'on track drawn in ink', WORDS, NODE_WORDS, [("  const tone = pace.state === 'tight' ? 'ink' : 'under';\n", "  const tone = 'ink';\n")]),
    ('W3', 'tight drawn in the under colour', WORDS, NODE_WORDS, [("  const tone = pace.state === 'tight' ? 'ink' : 'under';\n", "  const tone = 'under';\n")]),
    ('W4', 'over drawn in ink', WORDS, NODE_WORDS, [(OVER, OVER.replace("tone: 'over' };", "tone: 'ink' };"))]),
    ('W5', 'over says the per-day hint', WORDS, NODE_WORDS, [("  if (pace.state === 'over') {\n", '  if (false) {\n')]),
    ('W6', 'no budget still draws a line', WORDS, NODE_WORDS, [('  if (pace.overByMinor === null) return null;\n', '')]),
    ('W7', 'the figure is the confirmed spending, not the estimate', WORDS, NODE_WORDS,
     [('  const spent = pace.spent.estimatedMinor;\n', '  const spent = pace.spent.confirmedMinor;\n')]),
    ('W8', 'the figure shown in private mode', WORDS, NODE_WORDS,
     [('    headline: hidden ? HIDDEN_AMOUNT : walletMoneyText(spent),\n', '    headline: walletMoneyText(spent),\n')]),
    ('W9', 'the per-day figure said with its satang', WORDS, NODE_WORDS, [('spokenMoney(wholeBaht(perDay), t)', 'spokenMoney(perDay, t)')]),
    ('W10', 'the amounts said in private mode', WORDS, NODE_WORDS, [(TOTAL, TOTAL.replace('  const total = hidden\n', '  const total = false\n'))]),
    ('W11', 'the limit never said', WORDS, NODE_WORDS, [(TOTAL, TOTAL.replace('    : pace.limitMinor === null\n', '    : true\n'))]),
    ('W12', 'the line never said', WORDS, NODE_WORDS, [('    spoken: line === null ? total : `${total}, ${line.spoken}`,\n', '    spoken: total,\n')]),
    ('W13', 'private mode says ตามแผน when over', WORDS, NODE_WORDS, [(HIDDEN_OVER, HIDDEN_OVER.replace("t('home.overWord')", "t('home.onTrack')"))]),
    ('W14', 'the per-day hint shown with its satang', WORDS, NODE_WORDS, [("t('home.perDay', { amount: perDayText(perDay) })", "t('home.perDay', { amount: walletMoneyText(perDay) })")]),
    ('W15', 'no per-day figure (after the month) not handled', WORDS, NODE_WORDS,
     [(ON_TRACK, "  if (hidden) return { text: t('home.onTrack'), spoken: t('home.onTrack'), tone };\n")]),
    ('W16', 'how far over said with ฿, not as baht', WORDS, NODE_WORDS,
     [("spoken: t('home.over', { amount: spokenMoney(over, t) })", "spoken: t('home.over', { amount: walletMoneyText(over) })")]),
    ('W17', 'private mode shows how far over', WORDS, NODE_WORDS, [(HIDDEN_OVER, '')]),
    ('W18', 'the limit said as the spending', WORDS, NODE_WORDS, [('limit: spokenMoney(pace.limitMinor, t)', 'limit: spokenMoney(spent, t)')]),
    ('W19', 'the per-day figure said rounded up', WORDS, NODE_WORDS, [('((BigInt(minor) / 100n) * 100n)', '(((BigInt(minor) + 99n) / 100n) * 100n)')]),
    ('W20', "private mode drops the line's colour", WORDS, NODE_WORDS, [(ON_TRACK, ON_TRACK.replace(' tone };', " tone: 'ink' };"))]),
    ('W21', 'private mode over drawn in ink', WORDS, NODE_WORDS, [(HIDDEN_OVER, HIDDEN_OVER.replace("tone: 'over' };", "tone: 'ink' };"))]),
    # home/copy.ts: the budgetCardWords Node test
    ('K1', 'the Thai per-day line loses its amount', COPY, NODE_WORDS, [("'home.perDay': { th: 'เหลือวันละ {amount}',", "'home.perDay': { th: 'เหลือวันละ',")]),
    ('K2', "on track says what the voice table never says (§5.1)", COPY, NODE_WORDS, [("'home.onTrack': { th: 'ตามแผน',", "'home.onTrack': { th: 'เก่งมาก ประหยัดสุดๆ!',")]),
    ('K3', 'the spoken budget line drops จากงบ', COPY, NODE_WORDS, [("th: 'ใช้ไปเดือนนี้ {spent} จากงบ {limit}'", "th: 'ใช้ไปเดือนนี้ {spent} {limit}'")]),
    ('K4', 'over budget scolds (§5.1)', COPY, NODE_WORDS, [("'home.over': { th: 'เกินงบไป {amount}',", "'home.over': { th: 'ใช้เงินเกินอีกแล้ว {amount}',")]),
    # homeData.ts: the hook's render file, or Home's own suite where only it pins the rule
    ('D1', 'a resolved draft never reads again', DATA, HOOK, [(RESOLVE, '')]),
    ('D2', 'every outbox change reads again', DATA, HOOK, [('    if (resolved) refresh();\n', '    refresh();\n')]),
    ('D3', 'a draft that is being sent counts as resolved', DATA, HOOK,
     [("outbox.filter((command) => command.state !== 'acknowledged')", "outbox.filter((command) => command.state === 'unsent')")]),
    ('D4', 'the open drafts never remembered', DATA, HOOK, [('    open.current = now;\n', '')]),
    ('D5', "the revision refresh left behind (the carry rule)", DATA, HOOK, [(REVISION, '')]),
    ('D6', "a refresh on every view update (P2-T24's mutant)", DATA, HOOK,
     [(REVISION, '  useEffect(() => {\n    loaded.refresh();\n  }, [diaryView, loaded.refresh]);\n')]),
    ('D7', 'a new revision reloads from loading', DATA, HOOK, [(REVISION, REVISION.replace('loaded.refresh', 'loaded.reload'))]),
    ('D8', 'a resolved draft reloads from loading', DATA, HOOK, [(RESOLVE, RESOLVE.replace('loaded.refresh', 'loaded.reload'))]),
    ('D9', "the hook's refresh does nothing", DATA, HOOK, [('  return loaded;\n', '  return { ...loaded, refresh: () => undefined };\n')]),
    ('D10', "the hook's reload reads in place", DATA, HOOK, [('  return loaded;\n', '  return { ...loaded, reload: loaded.refresh };\n')]),
    ('D11', "a new day keeps the old day's read", DATA, HOOK, [('  }, [resources, month, today]);\n', '  }, [resources, month]);\n')]),
    ('D12', "today read in one page only", DATA, HOME, [('const TODAY_PAGES = 20;\n', 'const TODAY_PAGES = 1;\n')]),
    ('D13', "today's pages at the default size", DATA, HOOK, [('resources.history(filter, cursor, HISTORY_MAX_LIMIT)', 'resources.history(filter, cursor)')]),
    ('D14', 'two pages of earlier records', DATA, HOOK, [('const EARLIER_RECORDS = 50;\n', 'const EARLIER_RECORDS = 100;\n')]),
    ('D15', 'earlier records not cut back to whole days', DATA, HOME,
     [('    const whole = earlierWholeDays(earlier);\n', '    const whole = { records: earlier.items, oldestWholeDay: null };\n')]),
    ('D16', 'earlier days read through today', DATA, HOOK, [('through: addDays(today, -1)', 'through: today')]),
    ('D17', "today's completeness dropped", DATA, HOOK, [('      todayComplete: todays.complete,\n', '')]),
    ('D18', "the cut day dropped", DATA, HOOK, [('      oldestWholeDay: whole.oldestWholeDay,\n', '')]),
    ('T1', 'the threshold never plays', DATA, HOOK, [(CROSSING, '')]),
    ('T2', 'every reading past 80% plays', DATA, HOOK, [('if (crossedLevel(lastBudgetLevel, next) !== null)', 'if (next.level > 0)')]),
    ('T3', 'the last reading kept in a ref, not module state', DATA, HOOK,
     [('  useEffect(() => {\n    if (spentMinor === null) return;\n', '  const seen = useRef<LevelSeen | null>(null);\n  useEffect(() => {\n    if (spentMinor === null) return;\n'),
      (CROSSING + KEEP_LEVEL, "    if (crossedLevel(seen.current, next) !== null) playHaptic('thresholdCrossed');\n    seen.current = next;\n")]),
    ('T4', 'the reading never kept', DATA, HOOK, [(KEEP_LEVEL, '')]),
    ('T5', 'a reading before the load', DATA, HOOK, [('    if (spentMinor === null) return;\n', '')]),
    ('T6', 'the month ignored', DATA, HOOK,
     [('    const next: LevelSeen = { month, level: budgetLevel(spentMinor, limitMinor) };\n', "    const next: LevelSeen = { month: 'any', level: budgetLevel(spentMinor, limitMinor) };\n")]),
    ('T7', 'read once, at mount', DATA, HOOK, [('  }, [month, spentMinor, limitMinor]);\n', '  }, []);\n')]),
    # HomeScreen.tsx: Home's own suite reads through the hook
    ('S1', "Home's load never finishes", SCREEN, HOME,
     [('  const loaded = useHomeData(today);\n', "  const loaded = { state: 'loading' as const, reload: () => undefined, refresh: () => undefined };\n")]),
]

SUMMARY = re.compile(r'^\s*Tests  (.+?)\s*$', re.M)
FAILED = re.compile(r'^\s*×\s+\S+\s+>\s+(.+?)\s+\d+ms\s*$', re.M)
NODE_COUNT = re.compile(r'^ℹ (tests|pass|fail) (\d+)', re.M)
NODE_FAILED = re.compile(r'^✖ (.+?) \([\d.]+ms\)$', re.M)


def sha(path):
    with open(path, 'rb') as handle:
        return hashlib.sha256(handle.read()).hexdigest()


def main():
    root, logs = sys.argv[1], sys.argv[2]
    os.makedirs(logs, exist_ok=True)
    app = os.path.join(root, 'apps/app')
    wanted = set(sys.argv[3:])
    unexpected = 0
    killed = survived = 0
    for ident, description, rel, command, edits in MUTANTS:
        if wanted and ident not in wanted:
            continue
        path = os.path.join(root, rel)
        with open(path, 'rb') as handle:
            original = handle.read()
        before = hashlib.sha256(original).hexdigest()
        text = original.decode('utf-8')
        for old, new in edits:
            count = text.count(old)
            if count != 1:
                print(f'{ident} SETUP ERROR: {count} matches for {old!r} in {rel}', flush=True)
                sys.exit(2)
            text = text.replace(old, new)
        try:
            with open(path, 'wb') as handle:
                handle.write(text.encode('utf-8'))
            run = subprocess.run(command, cwd=app, capture_output=True, text=True, timeout=900)
            output = run.stdout + run.stderr
        finally:
            with open(path, 'wb') as handle:
                handle.write(original)
        after = sha(path)
        with open(os.path.join(logs, f'{ident}.log'), 'w', encoding='utf-8') as handle:
            handle.write(output)
        if command in NODE:
            totals = dict(NODE_COUNT.findall(output))
            summary = f"{totals.get('fail', '?')} failed | {totals.get('pass', '?')} passed ({totals.get('tests', '?')})"
            failed = [name for name in NODE_FAILED.findall(output) if name != 'failing tests:']
        else:
            found = SUMMARY.findall(output)
            summary = found[-1] if found else 'no summary'
            failed = FAILED.findall(output)
        assertions = output.count('AssertionError')
        outcome = 'killed' if run.returncode != 0 else 'survived'
        if outcome == 'killed':
            killed += 1
        else:
            survived += 1
        mark = 'KILLED' if outcome == 'killed' else 'SURVIVED'
        first = f' -> {failed[0].strip()}' if failed else ''
        restored = 'restored sha256 equal' if after == before else f'RESTORE MISMATCH {after}'
        print(f'{ident} {mark}: {description}{first} [{os.path.basename(rel)}; Tests {summary}; AssertionError x{assertions}; {restored}]', flush=True)
        if outcome != 'killed' or after != before:
            unexpected += 1
    print(f'{killed} killed, {survived} survived, {unexpected} not as expected')
    sys.exit(1 if unexpected else 0)


if __name__ == '__main__':
    main()
