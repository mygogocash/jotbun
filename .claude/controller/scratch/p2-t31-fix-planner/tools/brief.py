#!/usr/bin/env python3
"""Renders the brief or the round's receipt from its template and the planner's own logs.

Usage: python3 -I brief.py <kit> <out.md> [brief|receipt]

- brief: tools/brief.template.md, to briefs/P2-T31-fix.md;
- receipt: tools/receipt.template.md, to real/docs/implementation/receipts/P2-T31-fix.md.
Every count comes from a log in <kit>/logs, never typed by hand.
"""
import re
import sys
from pathlib import Path

kit = Path(sys.argv[1])
out = Path(sys.argv[2])
mode = sys.argv[3] if len(sys.argv) > 3 else 'brief'
logs = kit / 'logs'
ANSI = re.compile(r'\x1b\[[0-9;]*m')

INSIGHTS = 'src/wallet/insights/WalletInsights.render.test.tsx'
ROUTES = ('src/screens/redesign/SpendRoutes.render.test.tsx src/screens/redesign/account/AccountRoutes.render.test.tsx '
          'src/screens/redesign/insights/InsightsRoutes.render.test.tsx src/screens/redesign/planning/PlanningRoutes.render.test.tsx')
NEIGHBOURS = ('src/wallet/card/CardStack.render.test.tsx src/wallet/looks/WalletLooks.render.test.tsx src/wallet/privacy/PrivateMode.render.test.tsx '
              'src/wallet/testing/walletHarness.render.test.tsx src/wallet/tray/Tray.render.test.tsx src/wallet/lock/Lock.render.test.tsx '
              'src/wallet/add/AmountStep.render.test.tsx src/wallet/wallets/WalletsList.render.test.tsx '
              'src/screens/redesign/insights/InsightsScreen.render.test.tsx src/screens/redesign/insights/RecapScreen.render.test.tsx')
CATALOGUE = 'src/dev/catalogue/CatalogueScreen.render.test.tsx src/dev/catalogue/screenReader.render.test.tsx'

SCOPE = {
    'apps/app/src/ui/dateStep.ts': 'Shared, additive: `monthShortLabel(month, locale)` and `shortDateLabel(date, today, locale)` (P6).',
    'apps/app/src/ui/dateStep.test.ts': 'Shared, additive: the two new exports\' cases.',
    'apps/app/src/wallet/insights/calendarShade.ts': 'Reads `CALENDAR_STEP_LIMITS_BAHT`, by relative path (P19).',
    'apps/app/src/wallet/insights/copy.ts': 'The draft table: new lines, draft marks, `insights.sample` dropped (P8).',
    'apps/app/src/wallet/insights/insightsData.ts': 'Rewritten: one quiet load, drafts at render time, compare months that fail the load (P2, P3).',
    'apps/app/src/wallet/insights/WalletInsightsScreen.tsx': 'Rewritten: the tabs, the analytics, the load\'s states (P9, P10, P18).',
    'apps/app/src/wallet/insights/SpendingTab.tsx': 'Rewritten: the days left, the early state, the categories (P11, P16).',
    'apps/app/src/wallet/insights/MonthBars.tsx': 'Rewritten: one scale, the budget label, the short months (P4, P7).',
    'apps/app/src/wallet/insights/InOutTab.tsx': 'Rewritten: money in and out, the kept line, the named pairs (P13).',
    'apps/app/src/wallet/insights/CalendarTab.tsx': 'Rewritten: private days alike, exact money, labels, the chosen day, 44 pt days (P5, P12, P14, P17).',
    'apps/app/src/wallet/insights/InfoTray.tsx': 'The explanation in a `WalletText` role.',
    'apps/app/src/wallet/insights/WalletInsights.render.test.tsx': 'Rewritten: {cases} cases (11 before).',
    'apps/app/src/dev/catalogue/wallet/insightsSections.tsx': 'Rewritten: six section descriptors that load `insightsScreens.tsx` lazily (P15).',
    'apps/app/src/dev/catalogue/wallet/insightsScreens.tsx': '**New**: the real screen on fakes, one state per section (P15).',
    'docs/implementation/receipts/P2-T31.md': 'One line under "Notes for later tasks", pointing to the fix receipt.',
    'docs/implementation/receipts/P2-T31-fix.md': '**New**: the round\'s receipt (R87).',
}


def text(name):
    return ANSI.sub('', (logs / f'{name}.log').read_text(encoding='utf-8'))


def node(name):
    found = dict(re.findall(r'^ℹ (tests|pass|fail) (\d+)', text(name), re.M))
    return f"`ℹ tests {found['tests']}`, `ℹ pass {found['pass']}`, `ℹ fail {found['fail']}`"


def vitest(name):
    body = text(name)
    files = re.findall(r'^ (Test Files .+?)\s*$', body, re.M)
    tests = re.findall(r'^ +(Tests .+?)\s*$', body, re.M)
    return f'`{files[-1].strip()}`, `{tests[-1].strip()}`'


files = [line.strip() for line in (kit / 'files.txt').read_text(encoding='utf-8').splitlines() if line.strip()]

red_render = text('red-render').splitlines()
failures = []
for index, line in enumerate(red_render):
    if line.startswith(' FAIL  ') and f'{INSIGHTS} >' in line:
        case = line.split(' > ', 1)[1].strip()
        message = next((later.strip() for later in red_render[index + 1:index + 60] if later.startswith('AssertionError')), None)
        assert message is not None, case
        failures.append(f'   - `{case}`: `{message[:160]}`')
cases = len(failures)

red_unit = text('red-unit')
red_unit_failed = sorted({name for name in re.findall(r'^✖ (.+?) \([\d.]+ms\)$', red_unit, re.M) if name != 'failing tests:'})

mutant_lines = [line for line in (logs / 'mutants.out').read_text(encoding='utf-8').splitlines() if not line.startswith('exit=')]
tail = mutant_lines[-1]
count = int(tail.split(' killed')[0])
assert tail == f'{count} killed, 0 survived, 0 not as expected', tail
assert len(mutant_lines) == count + 1, (len(mutant_lines), count)

scope_rows = []
for rel in files:
    real = (kit / 'real' / rel).read_text(encoding='utf-8').count('\n')
    orig_path = kit / 'orig' / rel
    size = f'{real} lines' if not orig_path.exists() else f'{real} lines; {orig_path.read_text(encoding="utf-8").count(chr(10))} before'
    scope_rows.append(f'| `{rel}` | {SCOPE[rel].format(cases=cases)} ({size}) |')

status = (logs / 'git-status.txt').read_text(encoding='utf-8').rstrip('\n') if mode == 'brief' else ''

diff_blocks = []
for rel in files:
    path = kit / 'diffs' / (rel.replace('/', '_') + '.diff')
    if path.exists():
        diff_blocks.append(f'### `{rel}`\n\n```diff\n{path.read_text(encoding="utf-8").rstrip(chr(10))}\n```')

values = {
    'SCOPE': '\n'.join(scope_rows),
    'INSIGHTS': INSIGHTS,
    'ROUTES': ROUTES,
    'NEIGHBOURS': NEIGHBOURS,
    'CATALOGUE': CATALOGUE,
    'RENDER_CASES': str(cases),
    'RED_RENDER': '\n'.join(failures),
    'RED_RENDER_ASSERTIONS': str(sum(1 for line in red_render if line.startswith('AssertionError'))),
    'RED_UNIT_ASSERTIONS': str(red_unit.count('AssertionError [ERR_ASSERTION]')),
    'RED_UNIT_FAILED_COUNT': str(len(red_unit_failed)),
    'RED_UNIT_FAILED': '\n'.join(f'     - `{name}`' for name in red_unit_failed),
    'GREEN_UNIT_TESTS': dict(re.findall(r'^ℹ (tests|pass|fail) (\d+)', text('green-unit'), re.M))['pass'],
    'COPY_REAL': '\n'.join(f'   cp PL/real/{rel} WT/{rel}' for rel in files),
    'STATUS': '\n'.join(f'   {line}' for line in status.splitlines()),
    'GIT_ADD': '\n'.join(f'/usr/bin/git -C WT add {rel}' for rel in files),
    'MUTANT_COUNT': str(count),
    'MUTANT_TAIL': tail,
    'MUTANT_MINUTES': (logs / 'mutants-minutes.txt').read_text(encoding='utf-8').strip() if mode == 'brief' else '',
    'RED_UNIT_SUMMARY': node('red-unit'),
    'RED_RENDER_SUMMARY': vitest('red-render'),
    'GREEN_UNIT_SUMMARY': node('green-unit'),
    'GREEN_RENDER_SUMMARY': vitest('green-render'),
    'GREEN_ROUTES_SUMMARY': vitest('green-routes'),
    'GREEN_NEIGHBOURS_SUMMARY': vitest('green-neighbours'),
    'GREEN_CATALOGUE_SUMMARY': vitest('green-catalogue'),
    'MUTANTS': '\n'.join(mutant_lines[:-1]),
    'DIFFS': '\n\n'.join(diff_blocks),
}

rendered = (kit / 'tools' / f'{mode}.template.md').read_text(encoding='utf-8')
rendered = re.sub(r'\{\{NODE:([a-z-]+)\}\}', lambda match: node(match.group(1)), rendered)
rendered = re.sub(r'\{\{VITEST:([a-z-]+)\}\}', lambda match: vitest(match.group(1)), rendered)
for key, value in values.items():
    rendered = rendered.replace('{{' + key + '}}', value)
left = re.findall(r'\{\{[A-Za-z_:-]+\}\}', rendered)
assert not left, left
out.write_text(rendered, encoding='utf-8')
print(f'Wrote {mode} {out}: {len(rendered.splitlines())} lines, {cases} render cases, {count} mutants, {len(diff_blocks)} diffs')
