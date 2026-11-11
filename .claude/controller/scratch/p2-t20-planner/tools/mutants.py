#!/usr/bin/env python3
"""P2-T20 mutation check. Usage: python3 -I mutants.py <worktree root> <log dir> [ids...]

Applies each mutant alone to the worktree, runs its tests (the Node test for
walletsList.ts; WalletsList.render.test.tsx for the screen, the tray, the
copy and the catalogue; PlanningRoutes.render.test.tsx for the route),
restores the file byte for byte (sha256 checked) and prints one line per
mutant. Exits 0 only when every mutant ends as expected.
"""
import hashlib
import os
import re
import subprocess
import sys

LIST = 'apps/app/src/wallet/wallets/walletsList.ts'
SCREEN = 'apps/app/src/wallet/wallets/WalletsListScreen.tsx'
TRAY = 'apps/app/src/wallet/wallets/ReorderTray.tsx'
COPY = 'apps/app/src/wallet/wallets/copy.ts'
SECTIONS = 'apps/app/src/dev/catalogue/wallet/walletListSections.tsx'
INDEX = 'apps/app/src/dev/catalogue/wallet/index.ts'
ROUTE = 'apps/app/app/spend/wallets.tsx'

NODE = ['npm', 'run', 'test:unit', '--', 'src/wallet/wallets/walletsList.test.ts']
RENDER = ['npx', 'vitest', 'run', '--config', 'vitest.render.config.ts', '--reporter=verbose', 'src/wallet/wallets/WalletsList.render.test.tsx']
ROUTES = ['npx', 'vitest', 'run', '--config', 'vitest.render.config.ts', '--reporter=verbose', 'src/screens/redesign/planning/PlanningRoutes.render.test.tsx']

DONE = "        setUnarchiving(null);\n        onChanged();\n"
CONFLICT = "        setUnarchiving({ phase: 'problem', walletId, message: tc('This wallet changed on another device.') });\n        onChanged();\n"
CREDIT = "    if (balance > 0n) held += balance;\n    else if (balance < 0n && kindOf(wallet.id) === 'credit_card') creditUsed -= balance;\n"
WALLET_FIRST = "  if (isRedesignEnabled('wallet')) return <BunWalletWallets />;\n"
LEGACY = "  if (isLegacySpendEnabled()) return <Redirect href=\"/spend\" />;\n"
PLANNING = "  if (!isRedesignEnabled('planning')) return <Redirect href=\"/spend\" />;\n"

# (id, expectation, description, file, tests, [(old, new), ...]); each old must occur exactly once.
MUTANTS = [
    # walletsList.ts: the Node test
    ('S1', 'killed', "a credit card's debt counted as held money (the plan's mutant)", LIST, NODE,
     [(CREDIT, "    if (balance > 0n) held += balance;\n    else if (balance < 0n && kindOf(wallet.id) === 'credit_card') { creditUsed -= balance; held -= balance; }\n")]),
    ('S2', 'killed', 'archived wallets counted', LIST, NODE, [('    if (wallet.archived) continue;\n', '')]),
    ('S3', 'killed', 'credit used ignores the kind', LIST, NODE, [("else if (balance < 0n && kindOf(wallet.id) === 'credit_card')", 'else if (balance < 0n)')]),
    ('S4', 'killed', 'a card paid ahead is not money held', LIST, NODE, [('if (balance > 0n) held += balance;', "if (balance > 0n && kindOf(wallet.id) !== 'credit_card') held += balance;")]),
    ('S5', 'killed', 'the total worked out in a JS number', LIST, NODE, [('    total += balance;\n', '    total = BigInt(Number(total) + Number(balance));\n')]),
    ('S6', 'killed', 'archived wallets counted as in use', LIST, NODE, [('    if (wallet.archived) continue;\n    activeCount += 1;\n', '    activeCount += 1;\n    if (wallet.archived) continue;\n')]),
    ('S7', 'killed', 'the total adds only balances above zero', LIST, NODE, [('    total += balance;\n', '    if (balance > 0n) total += balance;\n')]),
    ('O1', 'killed', 'an archived wallet the order names is listed', LIST, NODE, [('new Map(wallets.filter((wallet) => !wallet.archived).map(', 'new Map(wallets.map(')]),
    ('O2', 'killed', 'the rest in the order Jotbun lists them', LIST, NODE, [('[...left.values()].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))', '[...left.values()]')]),
    ('O3', 'killed', 'the same name not ordered by id', LIST, NODE, [('a.name.localeCompare(b.name) || a.id.localeCompare(b.id)', 'a.name.localeCompare(b.name)')]),
    ('O4', 'killed', 'the kept order ignored', LIST, NODE, [('  for (const id of order) {\n', '  for (const id of [] as string[]) {\n')]),
    ('O5', 'killed', 'an id the order names twice listed twice', LIST, NODE, [('    left.delete(id);\n', '')]),
    ('O6', 'killed', 'the kept wallets after the rest', LIST, NODE, [('  return [...kept, ...rest];\n', '  return [...rest, ...kept];\n')]),
    ('M1', 'killed', 'a move changes the order it was given', LIST, NODE, [('  const next = [...ids];\n', '  const next = ids as string[];\n')]),
    ('M2', 'killed', 'a move at the front goes past it', LIST, NODE, [('  if (from < 0 || to < 0 || to >= next.length) return next;\n', '  if (from < 0) return next;\n')]),
    ('M3', 'killed', 'a move goes the other way', LIST, NODE, [('  const to = from + by;\n', '  const to = from - by;\n')]),
    # WalletsListScreen.tsx: the render file
    ('L1', 'killed', 'จัดเรียง offered with no account open', SCREEN, RENDER, [('  const canReorder = accountId !== null;\n', '  const canReorder = true;\n')]),
    ('L2', 'killed', '?reorder=1 ignored', SCREEN, RENDER, [('useState(openReorder)', 'useState(false)')]),
    ('L3', 'killed', 'the rows ignore the kept order', SCREEN, RENDER, [('{frontFirst(wallets, order).map(', '{frontFirst(wallets, []).map(')]),
    ('L4', 'killed', 'the held line shown with no card spending', SCREEN, RENDER, [("{summary.creditUsedMinor === '0' ? null : (", '{false ? null : (')]),
    ('L5', 'killed', 'the held line never shown', SCREEN, RENDER, [("{summary.creditUsedMinor === '0' ? null : (", '{true ? null : (')]),
    ('L6', 'killed', "a credit card's row says ยอด", SCREEN, RENDER, [('  const label = (spent\n', '  const label = (false\n')]),
    ('L7', 'killed', "a missing kind's spaces kept in the label", SCREEN, RENDER, [("  ).replace(/\\s+/g, ' ').trim();\n", '  );\n')]),
    ('L8', 'killed', 'a row says its amount in private mode', SCREEN, RENDER, [("  const amount = hidden ? t('common.amountHidden') : spokenMoney(words.amountMinor, t);\n", '  const amount = spokenMoney(words.amountMinor, t);\n')]),
    ('L9', 'killed', 'a balance below zero said without its minus', SCREEN, RENDER, [(": spokenMoney(words.amountMinor, t);\n", ": spokenMoney(words.amountMinor.replace('-', ''), t);\n")]),
    ('L10', 'killed', 'a balance below zero drawn without its minus', SCREEN, RENDER, [("sign={spent ? 'none' : 'balance'}", 'sign="none"')]),
    ('L11', 'killed', 'a row opens the new-wallet flow', SCREEN, RENDER, [('onOpen={(walletId) => router.push(walletHref(walletId))}', 'onOpen={() => router.push(NEW_WALLET_HREF)}')]),
    ('L12', 'killed', 'the add tile opens nothing', SCREEN, RENDER, [('onAdd={() => router.push(NEW_WALLET_HREF)}', 'onAdd={() => undefined}')]),
    ('L13', 'killed', 'back always goes home', SCREEN, RENDER, [("    if (router.canGoBack()) router.back();\n    else router.replace('/spend');\n", "    router.replace('/spend');\n")]),
    ('L14', 'killed', 'unarchive presses held by React state, not a ref', SCREEN, RENDER, [('    if (sending.current) return;\n', '    if (held) return;\n')]),
    ('L15', 'killed', 'a done unarchive not read again', SCREEN, RENDER, [(DONE, '        setUnarchiving(null);\n')]),
    ('L16', 'killed', 'a conflict not read again', SCREEN, RENDER, [(CONFLICT, "        setUnarchiving({ phase: 'problem', walletId, message: tc('This wallet changed on another device.') });\n")]),
    ('L17', 'killed', 'a conflict worded as a refusal', SCREEN, RENDER, [("message: tc('This wallet changed on another device.')", "message: tc('This entry could not be saved.')")]),
    ('L18', 'killed', 'an unconfirmed unarchive not held', SCREEN, RENDER, [("  const held = unarchiving?.phase === 'saving' || unarchiving?.phase === 'unconfirmed';\n", "  const held = unarchiving?.phase === 'saving';\n")]),
    ('L19', 'killed', 'a refusal holds the list', SCREEN, RENDER, [("  const held = unarchiving?.phase === 'saving' || unarchiving?.phase === 'unconfirmed';\n", '  const held = unarchiving !== null;\n')]),
    ('L20', 'killed', 'Try again offered while blocked', SCREEN, RENDER, [("{unarchiving.phase === 'unconfirmed' && !unarchiving.blocked ? (", "{unarchiving.phase === 'unconfirmed' ? (")]),
    ('L21', 'killed', 'Try again sends another command', SCREEN, RENDER, [('void unarchive(unarchiving.walletId, unarchiving.version)', 'void unarchive(unarchiving.walletId, unarchiving.version + 1)')]),
    ('L22', 'killed', 'the archived row opens nothing', SCREEN, RENDER, [('onPress={() => setOpen((now) => !now)}', 'onPress={() => undefined}')]),
    ('L23', 'killed', 'the archived row does not say it is open', SCREEN, RENDER, [('        aria-expanded={open}\n', '')]),
    ('L24', 'killed', 'the chevron does not turn', SCREEN, RENDER, [("<Chevron direction={open ? 'up' : 'down'}", '<Chevron direction="down"')]),
    ('L25', 'killed', 'an unarchive problem is not an alert', SCREEN, RENDER, [('<WalletText role="label" accessibilityRole="alert">{unarchiving.message}</WalletText>', '<WalletText role="label">{unarchiving.message}</WalletText>')]),
    ('L26', 'killed', 'Try again offered for a load problem it cannot help', SCREEN, RENDER, [('{problem.retry ? <TextLink', '{true ? <TextLink')]),
    ('L27', 'killed', 'Try again does not read again', SCREEN, RENDER, [('onRetry={loaded.reload}', 'onRetry={() => undefined}')]),
    ('L28', 'killed', 'nothing said while loading', SCREEN, RENDER, [("{loaded.state === 'loading' ? <WalletText testID=\"wallets-loading\"", '{false ? <WalletText testID="wallets-loading"')]),
    ('L29', 'killed', 'at AX5 the amount stays beside the name', SCREEN, RENDER, [('        {large ? shown : null}\n', '        {false ? shown : null}\n'), ('      {large ? null : shown}\n', '      {false ? null : shown}\n')]),
    ('L30', 'killed', 'at AX5 an archived wallet does not stack', SCREEN, RENDER, [("                  flexDirection: large ? 'column' : 'row',\n", "                  flexDirection: 'row',\n")]),
    ('L31', 'killed', "a row's name clamped to one line", SCREEN, RENDER, [("<WalletText role=\"label\" style={{ fontWeight: '700', color: paint.text }}>{wallet.name}</WalletText>", "<WalletText role=\"label\" numberOfLines={1} style={{ fontWeight: '700', color: paint.text }}>{wallet.name}</WalletText>")]),
    ('L32', 'killed', "a row's name in the page's ink", SCREEN, RENDER, [("style={{ fontWeight: '700', color: paint.text }}>{wallet.name}", "style={{ fontWeight: '700' }}>{wallet.name}")]),
    ('L33', 'killed', "a row's kind line in the material's main colour", SCREEN, RENDER, [('<WalletText role="caption" style={{ color: paint.quietText }}>{words.kindLine}</WalletText>', '<WalletText role="caption" style={{ color: paint.text }}>{words.kindLine}</WalletText>')]),
    ('L34', 'killed', "no Bun face on a row", SCREEN, RENDER, [('      <BunFace face={look.face} size={36} />\n', '')]),
    ('L35', 'killed', 'every row on silk', SCREEN, RENDER, [('<MaterialFill material={look.material} radius={20} />', '<MaterialFill material="silk" radius={20} />')]),
    ('L36', 'killed', 'the add tile drawn solid', SCREEN, RENDER, [("        borderStyle: 'dashed',\n", "        borderStyle: 'solid',\n")]),
    ('L37', 'killed', 'the total drawn without its minus', SCREEN, RENDER, [('<WalletAmount testID="wallets-total" minor={summary.totalMinor} sign="balance" size={36} />', '<WalletAmount testID="wallets-total" minor={summary.totalMinor} size={36} />')]),
    ('L38', 'killed', 'the held amount shows the total', SCREEN, RENDER, [('minor={summary.heldMinor}', 'minor={summary.totalMinor}')]),
    ('L39', 'killed', 'จัดเรียง opens nothing', SCREEN, RENDER, [('onPress={() => setReordering(true)}', 'onPress={() => undefined}')]),
    ('L40', 'killed', 'the tray never closes', SCREEN, RENDER, [('onClose={() => setReordering(false)}', 'onClose={() => undefined}')]),
    ('L41', 'killed', 'the tray mounted with no account open', SCREEN, RENDER, [('{wallets !== null && canReorder ? <ReorderTray', '{wallets !== null ? <ReorderTray')]),
    # ReorderTray.tsx: the render file
    ('T1', 'killed', "the order kept last-first (the plan's mutant)", TRAY, RENDER, [('    void setOrder(next);\n', '    void setOrder([...next].reverse());\n')]),
    ('T2', 'killed', 'a move shows only once the kept order is drawn', TRAY, RENDER, [('    setMoved(next);\n', '')]),
    ('T3', 'killed', "the next press reads the drawn order, not the last press's", TRAY, RENDER, [('moveWallet(made.current ?? shown.map((wallet) => wallet.id), walletId, by)', 'moveWallet(shown.map((wallet) => wallet.id), walletId, by)')]),
    ('T4', 'killed', 'an opening starts from what the last one made', TRAY, RENDER, [('    made.current = null;\n    setMoved(null);\n', '')]),
    ('T5', 'killed', 'the first can go higher', TRAY, RENDER, [('disabled={index === 0}', 'disabled={false}')]),
    ('T6', 'killed', 'the last can go lower', TRAY, RENDER, [('disabled={index === shown.length - 1}', 'disabled={false}')]),
    ('T7', 'killed', 'move up does not name its wallet', TRAY, RENDER, [("label={t('wallets.moveUp', { name: wallet.name })}", "label={t('wallets.moveUp')}")]),
    ('T8', 'killed', 'a down press moves up', TRAY, RENDER, [('onPress={() => move(wallet.id, 1)}', 'onPress={() => move(wallet.id, -1)}')]),
    ('T9', 'killed', 'the tray ignores the kept order', TRAY, RENDER, [('const shown = frontFirst(wallets, moved ?? order);', 'const shown = frontFirst(wallets, moved ?? []);')]),
    ('T10', 'killed', 'at AX5 a tray row does not stack', TRAY, RENDER, [("              flexDirection: large ? 'column' : 'row',\n", "              flexDirection: 'row',\n")]),
    ('T11', 'killed', "every tray row's swatch silk", TRAY, RENDER, [('<MaterialFill material={lookOf(wallet.id).material} radius={5} />', '<MaterialFill material="silk" radius={5} />')]),
    ('T12', 'killed', 'the tray named as the list', TRAY, RENDER, [("title={t('wallets.reorder')}", "title={t('wallets.title')}")]),
    ('T13', 'killed', 'tray rows under 44 pt', TRAY, RENDER, [('              minHeight: 56,\n', '              minHeight: 40,\n')]),
    # copy.ts: the render file
    ('K1', 'killed', 'the row label without ยอด', COPY, RENDER, [("'wallets.rowLabel': { th: '{name} {kind} ยอด {amount}'", "'wallets.rowLabel': { th: '{name} {kind} {amount}'")]),
    ('K2', 'killed', 'move up spaced in Thai', COPY, RENDER, [("th: 'ย้าย{name}ขึ้น'", "th: 'ย้าย {name} ขึ้น'")]),
    # The catalogue: the render file
    ('C1', 'killed', 'the sections not in the wallet list', INDEX, RENDER, [('  ...WALLET_LIST_SECTIONS,\n', '')]),
    ('C2', 'killed', "the sections before the add tray's", INDEX, RENDER, [('  ...WALLET_ADD_SECTIONS,\n  ...WALLET_LIST_SECTIONS,\n', '  ...WALLET_LIST_SECTIONS,\n  ...WALLET_ADD_SECTIONS,\n')]),
    ('C3', 'killed', 'the archived section opens nothing', SECTIONS, RENDER, [("script: () => [LISTED, { call: 'onPress', on: { testID: 'wallets-archived-row' } }, { waitFor: 'wallets-archived' }],", 'script: () => [LISTED],')]),
    ('C4', 'killed', 'the reorder section opens no tray', SECTIONS, RENDER, [('render: () => <Stage openReorder />,', 'render: () => <Stage />,')]),
    ('C5', 'killed', "the sections write the person's account", SECTIONS, RENDER, [("const CATALOGUE_ACCOUNT = '0000000c-0000-4000-8000-00000000ca7a';", "const CATALOGUE_ACCOUNT = '00000000-0000-4000-8000-0000000000aa';")]),
    ('C6', 'killed', 'the sections drawn without the kept looks', SECTIONS, RENDER, [('    <WalletLooksProvider>\n', '    <>\n'), ('    </WalletLooksProvider>\n', '    </>\n')]),
    # The route: PlanningRoutes.render.test.tsx
    ('R1', 'killed', 'the wallet area shows the planning screen', ROUTE, ROUTES, [(WALLET_FIRST, '')]),
    ('R2', 'killed', 'the wallet area needs the planning area', ROUTE, ROUTES, [(WALLET_FIRST + PLANNING, PLANNING + WALLET_FIRST)]),
    ('R3', 'killed', 'the legacy build shows the wallet list', ROUTE, ROUTES, [(LEGACY + WALLET_FIRST, WALLET_FIRST + LEGACY)]),
    ('R4', 'killed', '?reorder=1 not passed on', ROUTE, ROUTES, [("openReorder={reorder === '1'}", 'openReorder={false}')]),
    ('R5', 'killed', 'any ?reorder opens the tray', ROUTE, ROUTES, [("openReorder={reorder === '1'}", 'openReorder={reorder !== undefined}')]),
    ('R6', 'killed', 'the wallet list without the shared resources', ROUTE, ROUTES, [("  return <SpendV1Provider resources={getSharedV1Resources()}><WalletsListScreen openReorder={reorder === '1'} /></SpendV1Provider>;\n", "  return <WalletsListScreen openReorder={reorder === '1'} />;\n")]),
]

SUMMARY = re.compile(r'^\s*Tests  (.+?)\s*$', re.M)
FAILED = re.compile(r'^\s*×\s+\S+\s+>\s+(.+?)\s+\d+ms\s*$', re.M)
NODE_FAIL = re.compile(r'^ℹ (tests|pass|fail) (\d+)', re.M)
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
    for ident, expect, description, rel, command, edits in MUTANTS:
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
        if command is NODE:
            totals = dict(NODE_FAIL.findall(output))
            summary = f"{totals.get('fail', '?')} failed | {totals.get('pass', '?')} passed ({totals.get('tests', '?')})"
            failed = NODE_FAILED.findall(output)
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
        mark = 'KILLED' if outcome == 'killed' else 'SURVIVED' + (' (equivalent)' if expect == 'survived' else '')
        first = f'; first failing: "{failed[0].strip()}"' if failed else ''
        restored = 'restored sha256 equal' if after == before else f'RESTORE MISMATCH {after}'
        print(f'{ident} {mark}: {description} [{os.path.basename(rel)}] -> Tests {summary}{first}; AssertionError x{assertions}; {restored}', flush=True)
        if outcome != expect or after != before:
            unexpected += 1
    print(f'{killed} killed, {survived} survived, {unexpected} not as expected')
    sys.exit(1 if unexpected else 0)


if __name__ == '__main__':
    main()
