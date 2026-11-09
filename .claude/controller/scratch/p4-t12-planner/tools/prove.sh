#!/bin/bash
# The planner's proof of P4-T12, one stage at a time, on a scratch copy of the
# integration head (W). Logs go to L. Stages: base, red, green, gate (R100's
# fast local gate: no full render suite, no iOS export, no whole-suite totals).
#   bash tools/prove.sh <stage>
# W was made with `git archive 606e131 | tar -x -C work`, then
# `npm ci --ignore-scripts --no-audit --no-fund` inside it (1416 packages).
# 606e131 and 0bd5659 (the head when this kit was finished) differ only under
# .claude/. The mutants run between green and gate: tools/mutants.py.
# RED is every final file, then stubs/ over four of them: the three code
# stubs and today's DeviceDiaryProvider.tsx (the erase that forgets nothing).
set -u
K=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p4-t12-planner
W=$K/work
L=$K/logs
A=$W/apps/app
mkdir -p "$L"
stamp() { echo "[$(date +%T) load $(sysctl -n vm.loadavg | tr -d '{}' | awk '{print $1}')] $*" | tee -a "$L/summary.txt"; }
counts() { grep -E '^ℹ (tests|pass|fail) ' "$1" | tr '\n' ' '; }
vt() { grep -E '^ +(Test Files|Tests) ' "$1" | tr -s ' ' | tr '\n' ' '; }

REAL=$(cd "$K/real" && find apps -type f | sort)
STUBS=$(cd "$K/stubs" && find apps -type f | sort)
UNIT="src/slips/slipResources.test.ts src/slips/slipRefs.test.ts"
RENDER="src/slips/sharedSlipResources.render.test.tsx src/spend/v1/DeviceDiaryProvider.render.test.tsx src/mascot/bunSettingsErase.render.test.tsx"
# The shared transport's own header test (1D-T6), unchanged: it must still pass beside the new one.
NEIGHBOURS="src/api/sharedV1.render.test.tsx"

place() { # place <from-dir> <paths...>
  local from=$1; shift
  for rel in "$@"; do mkdir -p "$(dirname "$W/$rel")"; cp "$K/$from/$rel" "$W/$rel"; done
}

case "${1:-}" in
  base)
    stamp "base: start (work/ as archived; nothing placed)"
    (cd "$W" && npm run typecheck:app > "$L/base-typecheck.log" 2>&1); stamp "base typecheck:app exit=$?"
    (cd "$A" && node scripts/test-unit.mjs src/slips/slipQr.test.ts src/slips/qrDecoder.test.ts > "$L/base-unit.log" 2>&1)
    stamp "base unit (slipQr, qrDecoder) exit=$? $(counts "$L/base-unit.log")"
    (cd "$A" && npx vitest run --config vitest.render.config.ts --reporter=verbose src/spend/v1/DeviceDiaryProvider.render.test.tsx src/mascot/bunSettingsErase.render.test.tsx $NEIGHBOURS > "$L/base-render.log" 2>&1)
    stamp "base render (DeviceDiaryProvider, bunSettingsErase, sharedV1) exit=$? $(vt "$L/base-render.log")"
    ;;
  red)
    place real $REAL
    place stubs $STUBS
    stamp "red: placed every final file, then stubs/ over: $(echo $STUBS | tr '\n' ' ')"
    (cd "$W" && npm run typecheck:app > "$L/red-typecheck.log" 2>&1); stamp "red typecheck:app exit=$?"
    (cd "$A" && node scripts/test-unit.mjs $UNIT > "$L/red-unit.log" 2>&1)
    stamp "red unit exit=$? $(counts "$L/red-unit.log") assertion-errors=$(grep -c 'AssertionError' "$L/red-unit.log") missing-module=$(grep -cE 'ERR_MODULE_NOT_FOUND|Cannot find module' "$L/red-unit.log")"
    (cd "$A" && npx vitest run --config vitest.render.config.ts --reporter=verbose $RENDER $NEIGHBOURS > "$L/red-render.log" 2>&1)
    stamp "red render exit=$? $(vt "$L/red-render.log") assertion-errors=$(grep -c '^AssertionError' "$L/red-render.log") missing-module=$(grep -cE 'Cannot find module|Failed to resolve' "$L/red-render.log")"
    ;;
  green)
    place real $REAL
    stamp "green: placed every final file"
    (cd "$W" && npm run typecheck:app > "$L/green-typecheck.log" 2>&1); stamp "green typecheck:app exit=$?"
    (cd "$A" && node scripts/test-unit.mjs $UNIT > "$L/green-unit.log" 2>&1)
    stamp "green unit exit=$? $(counts "$L/green-unit.log")"
    (cd "$A" && npx vitest run --config vitest.render.config.ts --reporter=verbose $RENDER $NEIGHBOURS > "$L/green-render.log" 2>&1)
    stamp "green render (sharedSlipResources, DeviceDiaryProvider, bunSettingsErase, sharedV1) exit=$? $(vt "$L/green-render.log")"
    ;;
  gate)
    stamp "gate: start"
    (cd "$W" && npm run typecheck:app > "$L/gate-1-typecheck-app.log" 2>&1); stamp "gate typecheck:app exit=$?"
    (cd "$W" && npm run typecheck:routes -w gogospend-app > "$L/gate-2-typecheck-routes.log" 2>&1); stamp "gate typecheck:routes exit=$?"
    (cd "$A" && node scripts/test-unit.mjs $UNIT > "$L/gate-3-focused-unit.log" 2>&1); stamp "gate focused unit exit=$? $(counts "$L/gate-3-focused-unit.log")"
    (cd "$A" && npx vitest run --config vitest.render.config.ts $RENDER $NEIGHBOURS > "$L/gate-4-focused-render.log" 2>&1); stamp "gate focused render exit=$? $(vt "$L/gate-4-focused-render.log")"
    (cd "$W" && npm run test:app > "$L/gate-5-test-app.log" 2>&1); stamp "gate test:app exit=$? $(counts "$L/gate-5-test-app.log")"
    (cd "$W" && npm run test:unit > "$L/gate-6-test-unit.log" 2>&1); stamp "gate test:unit exit=$? $(counts "$L/gate-6-test-unit.log")"
    (cd "$W" && npm run export:web -w gogospend-app -- --max-workers 2 > "$L/gate-7-export-web.log" 2>&1); stamp "gate export:web exit=$? $(grep -E 'Web Bundled|Exported' "$L/gate-7-export-web.log" | tr -s ' ' | tr '\n' ' ')"
    stamp "gate export:web slip routes in dist: $(ls "$A/dist/spend/slips" 2>/dev/null | tr '\n' ' ')"
    rm -rf "$A/dist"
    ;;
  *) echo "usage: prove.sh base|red|green|gate"; exit 2 ;;
esac
