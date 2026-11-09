#!/bin/bash
# The planner's proof of P2-T10, one stage at a time, on a scratch copy of the
# integration head (W). Logs go to L. Stages: base, red, green, gate.
#   bash tools/prove.sh <stage>
# W was made with `git archive 1ddc7f7 | tar -x -C work`, then
# `npm ci --ignore-scripts --no-audit --no-fund` inside it (1416 packages).
# The mutants run between green and gate: tools/mutants.py.
set -u
K=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t10-planner
W=$K/work
L=$K/logs
A=$W/apps/app
mkdir -p "$L"
stamp() { echo "[$(date +%T) load $(sysctl -n vm.loadavg | tr -d '{}' | awk '{print $1}')] $*" | tee -a "$L/summary.txt"; }
counts() { grep -E '^ℹ (tests|pass|fail) ' "$1" | tr '\n' ' '; }
vt() { grep -E '^ +(Test Files|Tests) ' "$1" | tr -s ' ' | tr '\n' ' '; }

NEW_TESTS="apps/app/src/wallet/money/walletMoney.test.ts apps/app/src/wallet/money/WalletAmount.render.test.tsx apps/app/src/wallet/privacy/PrivateMode.render.test.tsx"
DATA="apps/app/src/wallet/privacy/copy.ts"
CODE="apps/app/src/wallet/money/walletMoney.ts apps/app/src/wallet/money/WalletAmount.tsx apps/app/src/wallet/controls/IconButton.tsx apps/app/src/wallet/privacy/PrivateModeProvider.tsx apps/app/src/wallet/privacy/PrivateEyeButton.tsx apps/app/src/wallet/privacy/PrivateTip.tsx"
SHARED="apps/app/src/wallet/WalletRoot.tsx apps/app/src/dev/catalogue/wallet/index.ts"
SECTIONS="apps/app/src/dev/catalogue/wallet/kitSections.tsx"
RENDER_NEW="src/wallet/money/WalletAmount.render.test.tsx src/wallet/privacy/PrivateMode.render.test.tsx"
FOCUSED="src/wallet/money/WalletAmount.render.test.tsx src/wallet/privacy/PrivateMode.render.test.tsx src/wallet/testing/walletHarness.render.test.tsx src/wallet/WalletRoot.render.test.tsx src/screens/redesign/RootLayout.render.test.tsx src/dev/catalogue/CatalogueScreen.render.test.tsx src/dev/catalogue/screenReader.render.test.tsx src/dev/catalogue/largeText.render.test.tsx src/dev/catalogue/catalogueRoute.render.test.tsx"

place() { # place <from-dir> <paths...>
  local from=$1; shift
  for rel in "$@"; do mkdir -p "$(dirname "$W/$rel")"; cp "$K/$from/$rel" "$W/$rel"; done
}

case "${1:-}" in
  base)
    stamp "base: start"
    (cd "$W" && npm run test:app > "$L/base-test-app.log" 2>&1); stamp "base test:app exit=$? $(counts "$L/base-test-app.log")"
    (cd "$W" && npm run test:unit > "$L/base-test-unit.log" 2>&1); stamp "base test:unit exit=$? $(counts "$L/base-test-unit.log")"
    (cd "$A" && npx vitest list --config vitest.render.config.ts --json="$L/base-vitest-list.json" > "$L/base-vitest-list.log" 2>&1)
    stamp "base vitest list exit=$? $(node -e 'const l=require(process.argv[1]);console.log("files",new Set(l.map(t=>t.file)).size,"tests",l.length)' "$L/base-vitest-list.json")"
    (cd "$W" && npm run export:web -w gogospend-app -- --max-workers 2 > "$L/base-export-web.log" 2>&1); stamp "base export:web exit=$? $(grep -oE 'Web Bundled [0-9]+ms .*\([0-9]+ modules\)' "$L/base-export-web.log")"
    rm -rf "$A/dist"
    ;;
  red)
    place real $NEW_TESTS $DATA
    place stubs $CODE
    place orig $SHARED
    rm -f "$W/$SECTIONS"
    stamp "red: placed the tests, the copy table, the typed stubs and the original shared files"
    (cd "$W" && npm run typecheck:app > "$L/red-typecheck.log" 2>&1); stamp "red typecheck:app exit=$?"
    (cd "$W" && npm run test:unit -w gogospend-app -- src/wallet/money/walletMoney.test.ts > "$L/red-unit.log" 2>&1)
    stamp "red unit exit=$? $(counts "$L/red-unit.log") assertion=$(grep -c 'AssertionError' "$L/red-unit.log")"
    (cd "$A" && npx vitest run --config vitest.render.config.ts --reporter=verbose $RENDER_NEW > "$L/red-render.log" 2>&1)
    stamp "red render exit=$? $(vt "$L/red-render.log") assertion=$(grep -c '^AssertionError' "$L/red-render.log") load-errors=$(grep -cE 'Cannot find module|Failed to resolve' "$L/red-render.log")"
    ;;
  green)
    place real $NEW_TESTS $DATA $CODE $SHARED $SECTIONS
    stamp "green: placed every real file"
    (cd "$W" && npm run typecheck:app > "$L/green-typecheck.log" 2>&1); stamp "green typecheck:app exit=$?"
    (cd "$W" && npm run test:unit -w gogospend-app -- src/wallet/money/walletMoney.test.ts src/wallet/copy/draftText.test.ts > "$L/green-unit.log" 2>&1)
    stamp "green unit (walletMoney, draftText) exit=$? $(counts "$L/green-unit.log")"
    (cd "$A" && npx vitest run --config vitest.render.config.ts --reporter=verbose $RENDER_NEW > "$L/green-render.log" 2>&1)
    stamp "green render exit=$? $(vt "$L/green-render.log")"
    (cd "$A" && npx vitest run --config vitest.render.config.ts $FOCUSED > "$L/green-focused.log" 2>&1)
    stamp "green focused (new 2, harness, WalletRoot, RootLayout, catalogue x4) exit=$? $(vt "$L/green-focused.log")"
    ;;
  gate)
    stamp "gate: start"
    (cd "$W" && npm run typecheck:app > "$L/gate-1-typecheck-app.log" 2>&1); stamp "gate typecheck:app exit=$?"
    (cd "$W" && npm run typecheck:routes -w gogospend-app > "$L/gate-2-typecheck-routes.log" 2>&1); stamp "gate typecheck:routes exit=$?"
    (cd "$W" && npm run test:app > "$L/gate-3-test-app.log" 2>&1); stamp "gate test:app exit=$? $(counts "$L/gate-3-test-app.log")"
    (cd "$W" && npm run test:unit > "$L/gate-4-test-unit.log" 2>&1); stamp "gate test:unit exit=$? $(counts "$L/gate-4-test-unit.log")"
    (cd "$A" && npx vitest run --config vitest.render.config.ts $RENDER_NEW src/wallet/testing/walletHarness.render.test.tsx src/wallet/WalletRoot.render.test.tsx > "$L/gate-5-focused.log" 2>&1); stamp "gate focused render exit=$? $(vt "$L/gate-5-focused.log")"
    (cd "$W" && npm run test:render -w gogospend-app > "$L/gate-6-render-full.log" 2>&1); stamp "gate full render exit=$? $(vt "$L/gate-6-render-full.log")"
    (cd "$W" && npm run export:web -w gogospend-app -- --max-workers 2 > "$L/gate-7-export-web.log" 2>&1); stamp "gate export:web exit=$? $(grep -oE 'Web Bundled [0-9]+ms .*\([0-9]+ modules\)' "$L/gate-7-export-web.log")"
    rm -rf "$A/dist"
    ;;
  *) echo "usage: prove.sh base|red|green|gate"; exit 2 ;;
esac
