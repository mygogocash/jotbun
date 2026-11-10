#!/usr/bin/env python3
"""wallet-looks-unstored mutation check.

Usage: python3 -I mutants.py <worktree root> [--check] [ids...]
       (MUTANT_LOGS=<dir> keeps each mutant's test output there.)

Applies each mutant alone to WalletLooksProvider.tsx, runs the three render
files that mount the provider (the looks file holds its rules; the card and
harness files mount it through mountWallet), restores the file byte for byte
(sha256 checked) and prints one line per mutant. Exits 0 only when every
mutant is killed and every file is restored. With --check it only reports
whether each mutant's text matches exactly once, and runs nothing.
"""
import hashlib
import os
import re
import subprocess
import sys

PROVIDER = 'apps/app/src/wallet/looks/WalletLooksProvider.tsx'

# One file after the other: lighter on a shared machine.
COMMAND = ['npx', 'vitest', 'run', '--config', 'vitest.render.config.ts', '--reporter=verbose', '--no-file-parallelism',
           'src/wallet/looks/WalletLooks.render.test.tsx', 'src/wallet/card/WalletCard.render.test.tsx', 'src/wallet/testing/walletHarness.render.test.tsx']

FIRST_LAY = '      const shown = layOver(read, unstored.current.get(accountId) ?? []);\n'
FIRST_PUBLISH = '      setState((now) => (now.accountId === accountId ? shown : now));\n'
EARLIER = '      const earlier = unstored.current.get(accountId) ?? [];\n'
EDITS = '      const edits = [...earlier, edit];\n'
BASE = 'stored === null ? now : slot.put(now, slot.parse(stored.raw))'
PUBLISH = f'      setState((now) => (now.accountId === accountId ? layOver({BASE}, edits) : now));\n'
WRITE_VALUE = 'JSON.stringify(change(slot.parse(stored.raw)))'
CAUGHT = '.then(() => true, () => false)'
RECORD = '      if (!written || earlier.length > 0) unstored.current.set(accountId, edits);\n'
RESET = '    setState((now) => (now.accountId === accountId ? now : nothingKept(accountId)));\n'
LOAD_READ = '      const read: Kept = { accountId, looks: parseLooks(looks?.raw ?? null), order: parseOrder(order?.raw ?? null), icons: parseIcons(icons?.raw ?? null) };\n'

# (id, description, [(old, new), ...]); each old must occur exactly once when it is applied.
MUTANTS = [
    # This task: what was never stored is laid over each read.
    ('WU1', 'the first read lays nothing over what it reads', [(FIRST_LAY, '      const shown = read;\n')]),
    ('WU2', "the first read lays every account's unstored changes", [(FIRST_LAY, '      const shown = layOver(read, [...unstored.current.values()].flat());\n')]),
    ('WU3', "a change lays every account's unstored changes", [(EARLIER, '      const earlier = [...unstored.current.values()].flat();\n')]),
    ('WU4', 'a change keeps and lays only itself', [(EDITS, '      const edits = [edit];\n')]),
    ('WU5', 'a change goes under the earlier unstored ones', [(EDITS, '      const edits = [edit, ...earlier];\n')]),
    ('WU6', "a change's own read shows only that change over it", [(PUBLISH, f'      setState((now) => (now.accountId === accountId ? layOver({BASE}, [edit]) : now));\n')]),
    ('WU7', "a change's own read is not shown, only what was shown", [(f'layOver({BASE}, edits)', 'layOver(now, edits)')]),
    ('WU8', 'a change to a name the store cannot read does not show', [(f'layOver({BASE}, edits)', 'stored === null ? now : layOver(slot.put(now, slot.parse(stored.raw)), edits)')]),
    ('WU9', 'a change shows only what was read, nothing laid over it', [(f'layOver({BASE}, edits)', f'({BASE})')]),
    ('WU10', 'a write holds only the change, not what was read', [(WRITE_VALUE, 'JSON.stringify(change(slot.parse(null)))')]),
    ('WU11', 'a write folds in what was never stored', [(WRITE_VALUE, 'JSON.stringify(slot.of(layOver(slot.put(nothingKept(accountId), slot.parse(stored.raw)), edits)))')]),
    ('WU12', 'a name the store cannot read is written over, as nothing kept', [('      const stored = await readName(store, slot.name);\n', '      const stored = (await readName(store, slot.name)) ?? { raw: null };\n')]),
    ('WU13', 'a write that fails counts as stored', [(CAUGHT, '.then(() => true, () => true)')]),
    ('WU14', 'a write that fails is not caught', [(CAUGHT, '.then(() => true)')]),
    ('WU15', 'a change not stored is kept in memory only after an earlier one', [(RECORD, '      if (earlier.length > 0) unstored.current.set(accountId, edits);\n')]),
    ('WU16', 'a stored change after an unstored one is not kept in memory', [(RECORD, '      if (!written) unstored.current.set(accountId, edits);\n')]),
    ('WU17', 'changes are kept in memory only after two unstored ones', [(RECORD, '      if (!written || earlier.length > 1) unstored.current.set(accountId, edits);\n')]),
    ('WU18', 'nothing is kept in memory', [(RECORD, '')]),
    ('WU19', 'the memory is forgotten when the account changes', [(RESET, RESET + '    unstored.current.clear();\n')]),
    ('WU20', 'the memory is forgotten when the diary locks or closes', [('    if (accountId === null) return;\n', '    if (accountId === null) {\n      unstored.current.clear();\n      return;\n    }\n')]),
    # P2-T11's provider mutants, on the new lines where they moved: every rule of P3 that held still holds.
    ('PR1', 'the store is never read', [(LOAD_READ, '      const read: Kept = { accountId, looks: parseLooks(null), order: parseOrder(null), icons: parseIcons(null) };\n')]),
    ('PR2', 'setLook keeps nothing', [('  const setLook = useCallback((walletId: string, look: WalletLook) => keep(LOOKS, (looks) => ({ ...looks, [walletId]: look })), [keep]);\n', '  const setLook = useCallback((_walletId: string, _look: WalletLook) => Promise.resolve(), []);\n')]),
    ('PR3', 'setOrder keeps nothing', [('  const setOrder = useCallback((ids: readonly string[]) => keep(ORDER, () => [...new Set(ids)]), [keep]);\n', '  const setOrder = useCallback((_ids: readonly string[]) => Promise.resolve(), []);\n')]),
    ('PR4', 'setIcon keeps nothing', [('  const setIcon = useCallback((categoryId: string, icon: GlyphKey) => keep(ICONS, (icons) => ({ ...icons, [categoryId]: icon })), [keep]);\n', '  const setIcon = useCallback((_categoryId: string, _icon: GlyphKey) => Promise.resolve(), []);\n')]),
    ('PR5', 'changes run at once, not one after another', [('    const run = queue.current.then(step);\n', '    const run = step();\n')]),
    ('PR6', "the account's first read does not wait its turn", [('    void enqueue(async () => {\n      const [looks, order, icons]', '    void (async () => {\n      const [looks, order, icons]'), (FIRST_PUBLISH + '    });\n', FIRST_PUBLISH + '    })();\n')]),
    ('PR7', 'nothing resets when the account changes', [(RESET, '')]),
    ('PR8', "the last account's looks show for a render after the switch", [('  const kept = useMemo(() => (state.accountId === accountId ? state : nothingKept(accountId)), [state, accountId]);\n', '  const kept = state;\n')]),
    ('PR9', 'a late first read lands on the next account', [(FIRST_PUBLISH, '      setState(shown);\n')]),
    ('PR10', 'a late change shows under the next account', [(PUBLISH, f'      setState((now) => layOver({BASE}, edits));\n')]),
    ('PR14', 'a read that fails is not caught', [('store.get(name).then((raw) => ({ raw }), () => null)', 'store.get(name).then((raw) => ({ raw }))')]),
    ('PR15', 'setOrder keeps a repeated id', [('keep(ORDER, () => [...new Set(ids)])', 'keep(ORDER, () => [...ids])')]),
    ('PR16', 'with no account open a change is kept anyway', [('    if (accountId === null) return Promise.resolve();\n', '')]),
    ('PR17', 'lookOf ignores what was kept', [('    lookOf: (walletId: string) => kept.looks[walletId] ?? derivedLook(walletId),\n', '    lookOf: (walletId: string) => derivedLook(walletId),\n')]),
    ('PR18', 'the kept order is not given', [('    order: kept.order,\n', '    order: [],\n')]),
    ('PR19', 'iconOf ignores what was kept', [('iconOf: (category) => iconFor(category, icons)', 'iconOf: (category) => iconFor(category, {})')]),
    ('PR20', 'icons kept under another name', [("export const CATEGORY_ICONS_NAME = 'category-icons';", "export const CATEGORY_ICONS_NAME = 'category-icon';")]),
]

# vitest's totals line ("      Tests  1 failed | 13 passed (14)") and its failed cases.
SUMMARY = re.compile(r'^\s*Tests  (.+?)\s*$', re.M)
FAILED = re.compile(r'^\s*×\s+(\S+)\s+>\s+(.+?)\s+\d+ms\s*$', re.M)
UNHANDLED = re.compile(r'Errors\s+(\d+) errors?')


def sha(path):
    with open(path, 'rb') as handle:
        return hashlib.sha256(handle.read()).hexdigest()


def mutated(text, ident, edits):
    for old, new in edits:
        count = text.count(old)
        if count != 1:
            return None, f'{ident} SETUP ERROR: {count} matches for {old!r}'
        text = text.replace(old, new)
    return text, None


def main():
    args = sys.argv[1:]
    check = '--check' in args
    args = [arg for arg in args if arg != '--check']
    root, wanted = args[0], set(args[1:])
    logs = os.environ.get('MUTANT_LOGS')
    if logs:
        os.makedirs(logs, exist_ok=True)
    app = os.path.join(root, 'apps/app')
    path = os.path.join(root, PROVIDER)
    with open(path, 'rb') as handle:
        original = handle.read()
    before = hashlib.sha256(original).hexdigest()
    source = original.decode('utf-8')
    unexpected = killed = survived = 0
    for ident, description, edits in MUTANTS:
        if wanted and ident not in wanted:
            continue
        text, error = mutated(source, ident, edits)
        if error:
            print(error, flush=True)
            sys.exit(2)
        if check:
            print(f'{ident} APPLIES: {description}', flush=True)
            continue
        try:
            with open(path, 'wb') as handle:
                handle.write(text.encode('utf-8'))
            run = subprocess.run(COMMAND, cwd=app, capture_output=True, text=True, timeout=900)
            output = run.stdout + run.stderr
        finally:
            with open(path, 'wb') as handle:
                handle.write(original)
        after = sha(path)
        if logs:
            with open(os.path.join(logs, f'{ident}.log'), 'w', encoding='utf-8') as handle:
                handle.write(output)
        found = SUMMARY.findall(output)
        summary = found[-1] if found else 'no summary'
        # vitest orders the files by its own cache, so the first failing case is taken in COMMAND's file order.
        files = [arg for arg in COMMAND if arg.endswith('.tsx')]
        cases = FAILED.findall(output)
        failed = [name for file in files for at, name in cases if at == file]
        errors = UNHANDLED.findall(output)
        outcome = 'KILLED' if run.returncode != 0 else 'SURVIVED'
        if outcome == 'KILLED':
            killed += 1
        else:
            survived += 1
        first = f'; first failing: "{failed[0].strip()}"' if failed else ''
        unhandled = f'; unhandled errors {errors[-1]}' if errors else ''
        restored = after == before
        print(f'{ident} {outcome}: {description} -> Tests {summary}{first}{unhandled}; AssertionError x{output.count("AssertionError")}; restored={restored}', flush=True)
        if outcome != 'KILLED' or not restored:
            unexpected += 1
    if check:
        return
    print(f'{killed} killed, {survived} survived, {unexpected} not as expected')
    sys.exit(1 if unexpected else 0)


if __name__ == '__main__':
    main()
