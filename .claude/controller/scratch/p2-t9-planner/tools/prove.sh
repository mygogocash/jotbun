#!/bin/bash
# The planner's proof of P2-T9, one stage at a time, on a scratch copy of the
# integration head (W). Logs go to L. Stages: base, red, green, gate.
#   bash tools/prove.sh <stage>
# W was made with `git archive 5b7609e | tar -x -C work`, then
# `npm ci --ignore-scripts --no-audit --no-fund` inside it (1416 packages).
# The planner removes W after the gate: a whole tree does not belong in the
# kit. The mutants run between green and gate: tools/mutants.py.
# logs/ holds the final round. logs/round1/ holds the first full round, run
# before the clamp case was reordered (G7 survived the old order) and two code
# comments were reworded. logs/explore/ holds the first probe of Reanimated's
# web build in happy-dom (its source is probe.render.test.tsx.txt there).
set -u
K=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t9-planner
W=$K/work
L=$K/logs
A=$W/apps/app
M=src/wallet/motion
mkdir -p "$L"
stamp() { echo "[$(date +%T) load $(sysctl -n vm.loadavg | tr -d '{}' | awk '{print $1}')] $*" | tee -a "$L/summary.txt"; }
counts() { grep -E '^ℹ (tests|pass|fail) ' "$1" | tr '\n' ' '; }
vt() { grep -E '^ +(Test Files|Tests) ' "$1" | tr -s ' ' | tr '\n' ' '; }
RENDER="$M/GrowBar.render.test.tsx $M/useWalletMotion.render.test.tsx"

case "${1:-}" in
  base)
    stamp "base: start"
    (cd "$W" && npm run test:app > "$L/base-test-app.log" 2>&1); stamp "base test:app exit=$? $(counts "$L/base-test-app.log")"
    (cd "$W" && npm run test:unit > "$L/base-test-unit.log" 2>&1); stamp "base test:unit exit=$? $(counts "$L/base-test-unit.log")"
    (cd "$A" && npm run test:unit -- src/lib/hapticPreference.test.ts > "$L/base-haptic-preference.log" 2>&1); stamp "base hapticPreference.test.ts exit=$? $(counts "$L/base-haptic-preference.log")"
    (cd "$A" && npx vitest list --config vitest.render.config.ts --json="$L/base-vitest-list.json" > "$L/base-vitest-list.log" 2>&1)
    stamp "base vitest list exit=$? $(node -e 'const l=require(process.argv[1]);console.log("files",new Set(l.map(t=>t.file)).size,"tests",l.length)' "$L/base-vitest-list.json")"
    (cd "$W" && npm run export:web -w gogospend-app -- --max-workers 2 > "$L/base-export-web.log" 2>&1); stamp "base export:web exit=$? $(grep -oE 'Web Bundled [0-9]+ms .*\([0-9]+ modules\)' "$L/base-export-web.log")"
    rm -rf "$A/dist"
    ;;
  red)
    mkdir -p "$A/$M"
    cp "$K/real/apps/app/$M/walletMotion.test.ts" "$A/$M/"
    cp "$K/real/apps/app/$M/GrowBar.render.test.tsx" "$A/$M/"
    cp "$K/real/apps/app/$M/useWalletMotion.render.test.tsx" "$A/$M/"
    cp "$K/stubs/apps/app/$M/walletMotion.ts" "$A/$M/"
    cp "$K/stubs/apps/app/$M/useWalletMotion.ts" "$A/$M/"
    cp "$K/stubs/apps/app/$M/GrowBar.tsx" "$A/$M/"
    cp "$K/stubs/apps/app/src/theme/motion.ts" "$A/src/theme/motion.ts"
    stamp "red: placed the three tests and the four typed stubs (motion.ts with the three moments silent)"
    (cd "$W" && npm run typecheck:app > "$L/red-typecheck.log" 2>&1); stamp "red typecheck:app exit=$?"
    (cd "$A" && npm run test:unit -- $M/walletMotion.test.ts > "$L/red-unit.log" 2>&1); stamp "red walletMotion.test.ts exit=$? $(counts "$L/red-unit.log")"
    (cd "$A" && npx vitest run --config vitest.render.config.ts --reporter=verbose $RENDER > "$L/red-render.log" 2>&1)
    stamp "red render exit=$? $(vt "$L/red-render.log") assertion=$(grep -c '^AssertionError' "$L/red-render.log") load-errors=$(grep -cE 'Cannot find module|Failed to resolve|SyntaxError' "$L/red-render.log")"
    ;;
  green)
    cp "$K/real/apps/app/$M/walletMotion.ts" "$A/$M/"
    cp "$K/real/apps/app/$M/useWalletMotion.ts" "$A/$M/"
    cp "$K/real/apps/app/$M/GrowBar.tsx" "$A/$M/"
    cp "$K/real/apps/app/src/theme/motion.ts" "$A/src/theme/motion.ts"
    stamp "green: placed the table, the builders, the grow bar and motion.ts"
    (cd "$W" && npm run typecheck:app > "$L/green-typecheck.log" 2>&1); stamp "green typecheck:app exit=$?"
    (cd "$A" && npm run test:unit -- $M/walletMotion.test.ts > "$L/green-unit.log" 2>&1); stamp "green walletMotion.test.ts exit=$? $(counts "$L/green-unit.log")"
    (cd "$A" && npm run test:unit -- src/lib/hapticPreference.test.ts > "$L/green-haptic-preference.log" 2>&1); stamp "green hapticPreference.test.ts exit=$? $(counts "$L/green-haptic-preference.log")"
    (cd "$A" && npx vitest run --config vitest.render.config.ts --reporter=verbose $RENDER > "$L/green-render.log" 2>&1)
    stamp "green render exit=$? $(vt "$L/green-render.log")"
    (cd "$A" && npx vitest run --config vitest.render.config.ts $RENDER src/wallet/WalletRoot.render.test.tsx src/wallet/testing/walletHarness.render.test.tsx > "$L/green-focused.log" 2>&1)
    stamp "green focused (GrowBar, builders, WalletRoot, harness) exit=$? $(vt "$L/green-focused.log")"
    ;;
  gate)
    stamp "gate: start"
    (cd "$W" && npm run typecheck:app > "$L/gate-1-typecheck-app.log" 2>&1); stamp "gate typecheck:app exit=$?"
    (cd "$W" && npm run typecheck:routes -w gogospend-app > "$L/gate-2-typecheck-routes.log" 2>&1); stamp "gate typecheck:routes exit=$?"
    (cd "$W" && npm run test:app > "$L/gate-3-test-app.log" 2>&1); stamp "gate test:app exit=$? $(counts "$L/gate-3-test-app.log")"
    (cd "$W" && npm run test:unit > "$L/gate-4-test-unit.log" 2>&1); stamp "gate test:unit exit=$? $(counts "$L/gate-4-test-unit.log")"
    (cd "$A" && npx vitest run --config vitest.render.config.ts $RENDER src/wallet/WalletRoot.render.test.tsx src/wallet/testing/walletHarness.render.test.tsx > "$L/gate-5-focused.log" 2>&1); stamp "gate focused render exit=$? $(vt "$L/gate-5-focused.log")"
    (cd "$W" && npm run test:render -w gogospend-app > "$L/gate-6-render-full.log" 2>&1); stamp "gate full render exit=$? $(vt "$L/gate-6-render-full.log")"
    (cd "$W" && npm run export:web -w gogospend-app -- --max-workers 2 > "$L/gate-7-export-web.log" 2>&1); stamp "gate export:web exit=$? $(grep -oE 'Web Bundled [0-9]+ms .*\([0-9]+ modules\)' "$L/gate-7-export-web.log")"
    rm -rf "$A/dist"
    ;;
  *) echo "usage: prove.sh base|red|green|gate"; exit 2 ;;
esac
