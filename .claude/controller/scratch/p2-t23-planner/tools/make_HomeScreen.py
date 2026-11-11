# Builds real/ HomeScreen.tsx from orig/ by exact cuts, and checks that every
# block it cuts is in real/ homeData.ts byte for byte (the move is unchanged).
import sys
pl = sys.argv[1]
path = 'apps/app/src/screens/redesign/HomeScreen.tsx'
src = open(f'{pl}/orig/{path}', encoding='utf-8').read()
data = open(f'{pl}/real/apps/app/src/screens/redesign/homeData.ts', encoding='utf-8').read()
# readToday and useBudgetThresholdHaptic are exported from homeData.ts (the plan's interface); nothing else differs.
data = data.replace('export function readToday(', 'function readToday(').replace('export function useBudgetThresholdHaptic(', 'function useBudgetThresholdHaptic(')

def swap(old, new, moved=None):
    global src
    assert src.count(old) == 1, old[:80]
    if moved is not None:
        assert data.count(moved) == 1, 'not moved unchanged: ' + moved[:80]
    src = src.replace(old, new)

# Imports.
swap("import type { HistoryFilter, Minor } from '@gogospend/contracts';\n", "import type { Minor } from '@gogospend/contracts';\n")
swap("import { HISTORY_MAX_LIMIT, TRACKING_START_MIN, validateTrackingStart } from '@gogospend/contracts';\n", "import { validateTrackingStart } from '@gogospend/contracts';\n")
swap("import { useEffect, useMemo, useRef, useState } from 'react';\n", "import { useMemo, useState } from 'react';\n")
swap("import { useRefreshOnRevision } from './useRefreshOnRevision';\n", "import { useBudgetThresholdHaptic, useHomeData } from './homeData';\n")
swap("import { playHaptic } from '@mobile/lib/hapticMoment';\n", '')
swap("import { budgetLevel, crossedLevel } from '@mobile/spend/v1/redesign/milestones';\nimport type { LevelSeen } from '@mobile/spend/v1/redesign/milestones';\n", '')
swap("import { earlierWholeDays, homeModel, readWholeDay } from '@mobile/spend/v1/redesign/homeModel';\n", "import { homeModel } from '@mobile/spend/v1/redesign/homeModel';\n")
swap("import type { HomeData, LoadProblem, LoadProblemKind } from '@mobile/spend/v1/redesign/homeModel';\n", "import type { LoadProblem, LoadProblemKind } from '@mobile/spend/v1/redesign/homeModel';\n")
swap("import { addDays, moneyGroupOf } from '@mobile/spend/v1/redesign/shared';\n", "import { moneyGroupOf } from '@mobile/spend/v1/redesign/shared';\n")
swap("import type { SpendV1Resources } from '@mobile/spend/v1/resources';\n", '')
swap("useCommandKeys, useLoad, useMoneyLocale } from '../v1/parts';\n", "useCommandKeys, useMoneyLocale } from '../v1/parts';\n")

# The load's page sizes move; EARLIER_DAYS (the model's) stays.
consts = (
    "/** Earlier records read for those days (one page, cut back to whole days). */\n"
    "const EARLIER_RECORDS = 50;\n"
    "/** Pages of today's records read (each up to HISTORY_MAX_LIMIT); a busier day is shown as partial, never as an error. */\n"
    "const TODAY_PAGES = 20;\n"
)
swap(consts, '', moved=consts)

# readToday and useRefreshOnResolve, with their section heading.
start = src.index('// ---------------------------------------------------------------------------\n// Loading\n')
end = src.index('// ---------------------------------------------------------------------------\n// Pace: the logic\'s shape to the kit\'s\n')
loading = src[start:end]
for piece in loading.split('\n\n'):
    piece = piece.strip('\n')
    if piece == '' or piece.startswith('// ----'):
        continue
    assert data.count(piece) == 1, 'not moved unchanged: ' + piece[:80]
src = src[:start] + src[end:]

# The threshold haptic and its module state.
haptic_start = src.index('// The month\'s budget level last seen in this app session.')
haptic_end = src.index('export function HomeScreen(')
haptic = src[haptic_start:haptic_end].rstrip('\n')
assert data.count(haptic) == 1, 'the threshold haptic was not moved unchanged'
src = src[:haptic_start] + src[haptic_end:]

# The screen: the load and its two refreshes become useHomeData.
swap("export function HomeScreen({ now }: { now?: Date }) {\n  const resources = useSpendV1();\n  const router = useRouter();\n",
     "export function HomeScreen({ now }: { now?: Date }) {\n  const router = useRouter();\n")
load_start = src.index('  const loaded = useLoad<HomeData>(async () => {\n')
load_end = src.index('  const view = diary ? diaryView : null;\n')
load = src[load_start:load_end]
assert data.count(load.rstrip('\n')) == 1, 'the load was not moved unchanged'
src = src[:load_start] + (
    "  // Today's load and its refreshes live in homeData.ts (P2-T23), shared with the Bun Wallet Home.\n"
    "  const loaded = useHomeData(today);\n\n"
) + src[load_end:]
open(f'{pl}/real/{path}', 'w', encoding='utf-8').write(src)
print('ok: every cut block is in homeData.ts unchanged; HomeScreen.tsx written')
