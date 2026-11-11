# Builds real/ entryHelpers.ts from orig/ by exact text edits, and checks that
# availableBalances.ts holds the moved function byte for byte.
import sys
pl = sys.argv[1]
path = 'apps/app/src/screens/redesign/entry/entryHelpers.ts'
src = open(f'{pl}/orig/{path}', encoding='utf-8').read()

old_import = "import { WAITING_STATES, openDrafts } from '@mobile/spend/v1/redesign/shared';\n"
assert src.count(old_import) == 1
src = src.replace(old_import, '')

old_types = "import type { OutboxCommand, PendingEntry } from '@mobile/storage/types';\n"
assert src.count(old_types) == 1
src = src.replace(old_types, "import type { PendingEntry } from '@mobile/storage/types';\n")

start = src.index('/**\n * What each wallet holds as far as this device knows')
end = src.index('/**\n * Wallets for WalletPicker')
block = src[start:end]
assert block.count('export function availableBalances(') == 1
moved = open(f'{pl}/real/apps/app/src/spend/v1/redesign/availableBalances.ts', encoding='utf-8').read()
body = block.rstrip('\n') + '\n'
assert moved.endswith(body), 'the moved function differs from the original'
reexport = (
    "// Moved unchanged to a pure module, so the Bun Wallet Home's cards read the\n"
    "// same rule (P2-T23): `spend/v1/redesign/availableBalances.ts`.\n"
    "export { availableBalances } from '@mobile/spend/v1/redesign/availableBalances';\n\n"
)
src = src[:start] + reexport + src[end:]
open(f'{pl}/real/{path}', 'w', encoding='utf-8').write(src)
print('ok: moved function identical; entryHelpers.ts written')
