#!/usr/bin/env python3
"""P2-T8 mutation check. Usage: python3 -I mutants.py <worktree root> <log dir>

Applies each mutant alone to the worktree, runs the harness render test,
restores the file byte for byte (sha256 checked) and prints one line per
mutant. Exits 0 only when every mutant ends as expected: killed, or, for the
equivalent ones, surviving with every test passing.
"""
import hashlib
import os
import re
import subprocess
import sys

H = 'apps/app/src/wallet/testing/walletHarness.tsx'
REG = 'apps/app/src/dev/catalogue/registry.tsx'
IDX = 'apps/app/src/dev/catalogue/wallet/index.ts'
TEST = 'src/wallet/testing/walletHarness.render.test.tsx'

AI_BLOCK = (
    '                        <AiCompanionProvider resources={ai}>\n'
    '                          {children}\n'
    '                        </AiCompanionProvider>\n'
)
DIARY_OPEN = '                      <SpendDiaryProvider diary={diary}>\n'
DIARY_CLOSE = '                      </SpendDiaryProvider>\n'
V1_OPEN = '                    <SpendV1Provider resources={resources}>\n'
V1_CLOSE = '                    </SpendV1Provider>\n'
ROOT_OPEN = '                  <WalletRoot>\n'
ROOT_CLOSE = '                  </WalletRoot>\n'
LANG_OPEN = '      <LanguageProvider device={locale}>\n'
LANG_CLOSE = '      </LanguageProvider>\n'
MODE_OPEN = '            <ThemePreferenceOverride preference={mode}>\n'
MODE_CLOSE = '            </ThemePreferenceOverride>\n'
SAFE_OPEN = '                <SafeAreaProvider initialMetrics={PHONE}>\n'
SAFE_CLOSE = '                </SafeAreaProvider>\n'
BUN_OPEN = '              <BunIntensityProvider>\n'
BUN_CLOSE = '              </BunIntensityProvider>\n'
INTL_OPEN = '        <IntlProvider locale={locale}>\n'
INTL_CLOSE = '        </IntlProvider>\n'
END_OPTIONS = '  } = options;\n'

# (id, expectation, description, file, [(old, new), ...]); each old must occur exactly once.
MUTANTS = [
    ('M1', 'killed', 'no AiCompanionProvider (the plan\'s mutant)', H, [(AI_BLOCK, '                        {children}\n')]),
    ('M2', 'killed', 'no SpendDiaryProvider', H, [(DIARY_OPEN, ''), (DIARY_CLOSE, '')]),
    ('M3', 'killed', 'no SpendV1Provider', H, [(V1_OPEN, ''), (V1_CLOSE, '')]),
    ('M4', 'killed', 'no WalletRoot', H, [(ROOT_OPEN, ''), (ROOT_CLOSE, '')]),
    ('M5', 'killed', 'no LanguageProvider', H, [(LANG_OPEN, ''), (LANG_CLOSE, '')]),
    ('M6', 'killed', 'the mode ignored (no ThemePreferenceOverride)', H, [(MODE_OPEN, ''), (MODE_CLOSE, '')]),
    ('M7', 'killed', 'the mode defaults to dark', H, [("    mode = 'light',\n", "    mode = 'dark',\n")]),
    ('M8', 'killed', 'the locale ignored (always Thai)', H, [(INTL_OPEN, '        <IntlProvider locale="th">\n'), ('      <LanguageProvider device={locale}>\n', '      <LanguageProvider device="th">\n')]),
    ('M9', 'killed', 'the locale defaults to English', H, [("    locale = 'th',\n", "    locale = 'en',\n")]),
    ('M10', 'killed', 'the text size ignored (no Dimensions spy)', H, [('  vi.spyOn(Dimensions, \'get\').mockImplementation((dimension) => ({ ...realDimensionsGet(dimension), fontScale }));\n', '')]),
    ('M11', 'killed', 'AX5 is 3.5', H, [('export const AX5 = 3.571;', 'export const AX5 = 3.5;')]),
    ('M12', 'killed', 'reduced motion defaults to true', H, [('    reducedMotion = false,\n', '    reducedMotion = true,\n')]),
    ('M13', 'killed', 'a given answer is ignored (always false)', H, [('    : Promise.resolve(reducedMotion);\n', '    : Promise.resolve(false);\n')]),
    ('M14', 'killed', "'pending' is answered at once, as full motion", H, [("  const answer = reducedMotion === 'pending'\n    ? new Promise<boolean>((resolve) => { release = resolve; })\n    : Promise.resolve(reducedMotion);\n", '  const answer = Promise.resolve(reducedMotion === true);\n')]),
    ('M15', 'killed', 'answerReducedMotion never gives the answer', H, [('      held(value);\n', '')]),
    ('M16', 'killed', 'answerReducedMotion gives the answer more than once', H, [('      release = null;\n', '')]),
    ('M17', 'killed', 'answerReducedMotion is silent when nothing is held', H, [('      if (held === null) throw new Error("answerReducedMotion gives a reducedMotion: \'pending\' mount its answer, once.");\n', '      if (held === null) return;\n')]),
    ('M18', 'killed', 'diary: null mounts the default diary', H, [(DIARY_OPEN, '                      <SpendDiaryProvider diary={diary ?? createFakeDiary().diary}>\n')]),
    ('M19', 'killed', 'the given resources are ignored', H, [('    resources = createFakeResources().resources,\n', ''), (END_OPTIONS, END_OPTIONS + '  const resources = createFakeResources().resources;\n')]),
    ('M20', 'killed', 'the given diary is ignored', H, [('    diary = createFakeDiary().diary,\n', ''), (END_OPTIONS, END_OPTIONS + '  const diary = createFakeDiary().diary;\n')]),
    ('M21', 'killed', 'the given AI resources are ignored', H, [('    ai = fakeAiResources().resources,\n', ''), (END_OPTIONS, END_OPTIONS + '  const ai = fakeAiResources().resources;\n')]),
    ('M22', 'killed', 'device seeds without their prefix', H, [('stored.set(`${DEVICE_PREFIX}${name}`, value);', 'stored.set(name, value);')]),
    ('M23', 'killed', 'account seeds without the account id', H, [('stored.set(`${ACCOUNT_PREFIX}${TEST_ACCOUNT_ID}.${name}`, value);', 'stored.set(`${ACCOUNT_PREFIX}${name}`, value);')]),
    ('M24', 'killed', "TEST_ACCOUNT_ID is not the fake diary's account", H, [("export const TEST_ACCOUNT_ID = '00000000-0000-4000-8000-0000000000aa';", "export const TEST_ACCOUNT_ID = '00000000-0000-4000-8000-0000000000ab';")]),
    ('M25', 'killed', 'the memory store is not installed', H, [('  installStoreBackend(memoryBackend(stored));\n', '')]),
    ('M26', 'killed', 'the memory store reads nothing', H, [('    getItem: async (key) => stored.get(key) ?? null,\n', '    getItem: async () => null,\n')]),
    ('M27', 'killed', 'a write does not reach stored', H, [('    setItem: async (key, value) => { stored.set(key, value); },\n', '    setItem: async () => undefined,\n')]),
    ('M28', 'killed', 'a removal does nothing', H, [('    removeItem: async (key) => { stored.delete(key); },\n', '    removeItem: async () => undefined,\n')]),
    ('M29', 'killed', 'the store lists no keys (no erase by scope)', H, [('    getAllKeys: async () => [...stored.keys()],\n', '    getAllKeys: async () => [],\n')]),
    ('M30', 'killed', 'multiRemove does nothing', H, [('    multiRemove: async (keys) => { for (const key of keys) stored.delete(key); },\n', '    multiRemove: async () => undefined,\n')]),
    ('M31', 'killed', 'rerender drops the providers (no wrapper)', H, [('  const view = render(element, { wrapper: Providers });\n', '  const view = render(<Providers>{element}</Providers>);\n')]),
    ('R1', 'killed', 'the registry without the wallet spread', REG, [('  ...BUN_WALLET_SECTIONS,\n', '')]),
    ('R2', 'killed', 'the wallet spread before the conflict choice', REG, [('  ...CONFLICT_SECTIONS,\n  ...BUN_WALLET_SECTIONS,\n', '  ...BUN_WALLET_SECTIONS,\n  ...CONFLICT_SECTIONS,\n')]),
    ('R3', 'killed', 'a wallet section with an id from outside the wallet', IDX, [('= [];', "= [{ id: 'amount-x', title: 'Bun Wallet: probe', group: 'Kit', render: () => null }];")]),
    ('R4', 'killed', "a wallet section whose title lacks 'Bun Wallet: '", IDX, [('= [];', "= [{ id: 'bw-probe', title: 'Probe', group: 'Kit', render: () => null }];")]),
    ('E1', 'survived', 'no SafeAreaProvider (equivalent: the stub answers the same insets)', H, [(SAFE_OPEN, ''), (SAFE_CLOSE, '')]),
    ('E2', 'survived', 'no BunIntensityProvider (equivalent: the default intensity reads the same)', H, [(BUN_OPEN, ''), (BUN_CLOSE, '')]),
    ('E3', 'survived', "no inner IntlProvider (equivalent here: LanguageProvider's own speaks the device locale)", H, [(INTL_OPEN, ''), (INTL_CLOSE, '')]),
]

# vitest's totals line ("      Tests  1 failed | 5 passed (6)"), not the stderr "Failed Tests" banner.
SUMMARY = re.compile(r'^\s*Tests  (.+?)\s*$', re.M)
FAILED = re.compile(r'^\s*×\s+\S+\s+>\s+(.+?)\s+\d+ms\s*$', re.M)


def sha(path):
    with open(path, 'rb') as handle:
        return hashlib.sha256(handle.read()).hexdigest()


def main():
    root, logs = sys.argv[1], sys.argv[2]
    os.makedirs(logs, exist_ok=True)
    app = os.path.join(root, 'apps/app')
    wanted = {name for name in sys.argv[3:]}
    unexpected = 0
    killed = survived = 0
    for ident, expect, description, rel, edits in MUTANTS:
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
                print(f'{ident} SETUP ERROR: {count} matches for {old!r} in {rel}')
                sys.exit(2)
            text = text.replace(old, new)
        try:
            with open(path, 'wb') as handle:
                handle.write(text.encode('utf-8'))
            run = subprocess.run(
                ['npx', 'vitest', 'run', '--config', 'vitest.render.config.ts', '--reporter=verbose', TEST],
                cwd=app, capture_output=True, text=True, timeout=600,
            )
            output = run.stdout + run.stderr
        finally:
            with open(path, 'wb') as handle:
                handle.write(original)
        after = sha(path)
        with open(os.path.join(logs, f'{ident}.log'), 'w', encoding='utf-8') as handle:
            handle.write(output)
        found = SUMMARY.findall(output)
        summary = found[-1] if found else 'no summary'
        failed = FAILED.findall(output)
        outcome = 'killed' if run.returncode != 0 else 'survived'
        if outcome == 'killed':
            killed += 1
        else:
            survived += 1
        mark = 'KILLED' if outcome == 'killed' else 'SURVIVED' + (' (equivalent)' if expect == 'survived' else '')
        first = f'; first failing: "{failed[0]}"' if failed else ''
        restored = 'restored sha256 equal' if after == before else f'RESTORE MISMATCH {after}'
        print(f'{ident} {mark}: {description} [{rel}] -> Tests {summary}{first}; {restored}', flush=True)
        if outcome != expect or after != before:
            unexpected += 1
    print(f'{killed} killed, {survived} survived, {unexpected} not as expected')
    sys.exit(1 if unexpected else 0)


if __name__ == '__main__':
    main()
