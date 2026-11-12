#!/bin/bash
# Probe (P8): typed routes refuse /spend/setup without the hand-typed cast. Takes the proof copy at GREEN, drops
# the cast on `destination` in NewWalletFlow.tsx, runs typecheck:routes, and restores the file (sha256 checked).
set -u
PL=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t21-planner
F=$PL/work/apps/app/src/wallet/wallets/NewWalletFlow.tsx
before=$(shasum -a 256 "$F" | cut -d' ' -f1)
python3 - "$F" <<'PY'
import sys
p = sys.argv[1]; s = open(p, encoding='utf-8').read()
old = "  const destination = (returnTo ?? '/spend') as Href;\n"
assert s.count(old) == 1
open(p, 'w', encoding='utf-8').write(s.replace(old, "  const destination = returnTo ?? '/spend';\n"))
PY
cd "$PL/work" && npm run typecheck:routes -w gogospend-app > "$PL/logs/probe-routes-uncast.log" 2>&1; echo "typecheck:routes without the cast: exit $?" | tee -a "$PL/logs/probe-routes-uncast.log"
cp "$PL/real/apps/app/src/wallet/wallets/NewWalletFlow.tsx" "$F"
after=$(shasum -a 256 "$F" | cut -d' ' -f1)
[ "$before" = "$after" ] && echo "restored sha256 equal" | tee -a "$PL/logs/probe-routes-uncast.log"
grep "error TS" "$PL/logs/probe-routes-uncast.log"
