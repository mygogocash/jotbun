#!/bin/bash
# The planner's proof of wallet-looks-unstored, one stage at a time, on a
# scratch copy of the integration head (W). Logs go to L. Stages: base, red,
# green, mutants, gate (run-all.sh runs them in that order).
#   bash tools/prove.sh <stage>
# W was made with `git archive 8194e7f | tar -x -C work` and
# `npm ci --ignore-scripts --no-audit --no-fund` (1416 packages).
set -u
K=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/wallet-looks-unstored-planner
W=$K/work
L=$K/logs
A=$W/apps/app
mkdir -p "$L"
stamp() { echo "[$(date +%T) load $(sysctl -n vm.loadavg | tr -d '{}' | awk '{print $1}')] $*" | tee -a "$L/summary.txt"; }
counts() { grep -E '^ℹ (tests|pass|fail) ' "$1" | tr '\n' ' '; }
vt() { grep -E '^ +(Test Files|Tests) ' "$1" | tr -s ' ' | tr '\n' ' '; }

PROVIDER=apps/app/src/wallet/looks/WalletLooksProvider.tsx
TEST=apps/app/src/wallet/looks/WalletLooks.render.test.tsx
FOCUSED=src/wallet/looks/WalletLooks.render.test.tsx
# Every other render file that mounts the provider (through mountWallet).
NEIGHBOURS="src/wallet/card/WalletCard.render.test.tsx src/wallet/testing/walletHarness.render.test.tsx src/wallet/privacy/PrivateMode.render.test.tsx src/wallet/money/WalletAmount.render.test.tsx src/wallet/motion/GrowBar.render.test.tsx"

place() { # place <from-dir> <paths...>
  local from=$1; shift
  for rel in "$@"; do cp "$K/$from/$rel" "$W/$rel"; done
}

case "${1:-}" in
  base)
    place orig $PROVIDER $TEST
    stamp "base: placed the head's two files"
    (cd "$A" && npx vitest run --config vitest.render.config.ts --reporter=verbose $FOCUSED $NEIGHBOURS > "$L/base-focused.log" 2>&1)
    stamp "base focused (looks + neighbours) exit=$? $(vt "$L/base-focused.log")"
    ;;
  red)
    place real $TEST
    place stubs $PROVIDER
    stamp "red: placed the final test file and the RED provider (the head's own)"
    (cd "$W" && npm run typecheck:app > "$L/red-typecheck.log" 2>&1); stamp "red typecheck:app exit=$?"
    (cd "$A" && npx vitest run --config vitest.render.config.ts --reporter=verbose $FOCUSED > "$L/red-render.log" 2>&1)
    stamp "red render exit=$? $(vt "$L/red-render.log") assertion=$(grep -c '^AssertionError' "$L/red-render.log") load-errors=$(grep -cE 'Cannot find module|Failed to resolve|TypeError|ReferenceError' "$L/red-render.log")"
    ;;
  green)
    place real $PROVIDER $TEST
    stamp "green: placed both final files"
    (cd "$W" && npm run typecheck:app > "$L/green-typecheck.log" 2>&1); stamp "green typecheck:app exit=$?"
    (cd "$A" && npx vitest run --config vitest.render.config.ts --reporter=verbose $FOCUSED > "$L/green-render.log" 2>&1)
    stamp "green render exit=$? $(vt "$L/green-render.log")"
    (cd "$A" && npx vitest run --config vitest.render.config.ts --reporter=verbose $NEIGHBOURS > "$L/green-neighbours.log" 2>&1)
    stamp "green neighbours exit=$? $(vt "$L/green-neighbours.log")"
    ;;
  mutants)
    stamp "mutants: start"
    (MUTANT_LOGS="$L/mutant-logs" python3 -I "$K/tools/mutants.py" "$W" > "$L/mutants.out" 2> "$L/mutants.err")
    stamp "mutants exit=$? $(tail -1 "$L/mutants.out")"
    ;;
  gate)
    stamp "gate: start"
    (cd "$W" && npm run typecheck:app > "$L/gate-1-typecheck-app.log" 2>&1); stamp "gate typecheck:app exit=$?"
    (cd "$A" && npx vitest run --config vitest.render.config.ts --reporter=verbose $FOCUSED $NEIGHBOURS > "$L/gate-2-focused.log" 2>&1); stamp "gate focused render exit=$? $(vt "$L/gate-2-focused.log")"
    (cd "$W" && npm run test:app > "$L/gate-3-test-app.log" 2>&1); stamp "gate test:app exit=$? $(counts "$L/gate-3-test-app.log")"
    (cd "$W" && npm run test:unit > "$L/gate-4-test-unit.log" 2>&1); stamp "gate test:unit exit=$? $(counts "$L/gate-4-test-unit.log")"
    (cd "$K" && for f in $PROVIDER $TEST; do /usr/bin/git diff --no-index --check "orig/$f" "real/$f"; done > "$L/gate-5-diff-check.log" 2>&1); stamp "gate diff --check: $(grep -c . "$L/gate-5-diff-check.log") lines of whitespace errors"
    (cd "$K" && for f in $PROVIDER $TEST; do cmp "real/$f" "$W/$f" && echo "same $f"; done > "$L/gate-6-real-in-work.txt" 2>&1); stamp "gate the work copy holds real/: $(grep -c '^same ' "$L/gate-6-real-in-work.txt") of 2"
    ;;
  *) echo "usage: prove.sh base|red|green|mutants|gate"; exit 2 ;;
esac
