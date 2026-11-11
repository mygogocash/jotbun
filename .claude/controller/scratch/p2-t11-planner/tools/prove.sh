#!/bin/bash
# The planner's proof of P2-T11, one stage at a time, on a scratch copy of the
# integration head (W). Logs go to L. Stages: base, red, green, gate.
#   bash tools/prove.sh <stage>
# W was made with `git archive 30fb26b | tar -x -C work`, with the packages
# `npm ci --ignore-scripts --no-audit --no-fund` installed (1416, for 6d7fc6a,
# whose package-lock.json is the same file). The mutants run between green and
# gate: tools/mutants.py.
set -u
K=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t11-planner
W=$K/work
L=$K/logs
A=$W/apps/app
mkdir -p "$L"
stamp() { echo "[$(date +%T) load $(sysctl -n vm.loadavg | tr -d '{}' | awk '{print $1}')] $*" | tee -a "$L/summary.txt"; }
counts() { grep -E '^ℹ (tests|pass|fail) ' "$1" | tr '\n' ' '; }
vt() { grep -E '^ +(Test Files|Tests) ' "$1" | tr -s ' ' | tr '\n' ' '; }

# New and changed test files (the harness test is shared: three cases added).
TESTS="apps/app/src/wallet/looks/walletLooks.test.ts apps/app/src/wallet/looks/categoryIcons.test.ts apps/app/src/wallet/card/WalletCard.render.test.tsx apps/app/src/wallet/looks/WalletLooks.render.test.tsx apps/app/src/wallet/testing/walletHarness.render.test.tsx"
# Data and the drawings' move: in their final form from RED on.
DATA="apps/app/src/wallet/card/copy.ts apps/app/src/ui/categoryDrawings.ts apps/app/src/ui/categoryIcons.tsx"
# The eight code files: typed stubs at RED.
CODE="apps/app/src/wallet/looks/walletLooks.ts apps/app/src/wallet/looks/categoryGlyphs.ts apps/app/src/wallet/looks/categoryIcons.ts apps/app/src/wallet/looks/WalletLooksProvider.tsx apps/app/src/wallet/looks/BunFace.tsx apps/app/src/wallet/looks/MaterialFill.tsx apps/app/src/wallet/looks/WalletCategoryIcon.tsx apps/app/src/wallet/card/WalletCard.tsx"
# Shared code files: as the head has them at RED.
SHARED="apps/app/src/wallet/testing/walletHarness.tsx apps/app/src/dev/catalogue/wallet/kitSections.tsx"

UNIT_NEW="src/wallet/looks/walletLooks.test.ts src/wallet/looks/categoryIcons.test.ts"
RENDER_NEW="src/wallet/card/WalletCard.render.test.tsx src/wallet/looks/WalletLooks.render.test.tsx src/wallet/testing/walletHarness.render.test.tsx"
NEIGHBOURS="src/wallet/privacy/PrivateMode.render.test.tsx src/wallet/money/WalletAmount.render.test.tsx src/ui/CategoryGrid.render.test.tsx src/ui/CategoryChips.render.test.tsx src/ui/RecordRow.render.test.tsx src/ui/kitUnification.render.test.tsx"
SECTIONS="bw-materials|bw-card|bw-category-icons"

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
    stamp "base vitest list exit=$?"
    (cd "$A" && npx vitest run --config vitest.render.config.ts src/wallet/testing/walletHarness.render.test.tsx $NEIGHBOURS > "$L/base-focused.log" 2>&1)
    stamp "base focused (harness + neighbours) exit=$? $(vt "$L/base-focused.log")"
    ;;
  red)
    place real $TESTS $DATA
    place stubs $CODE
    place orig $SHARED
    stamp "red: placed the tests, the copy table, the drawings' move, the typed stubs and the head's shared files"
    (cd "$W" && npm run typecheck:app > "$L/red-typecheck.log" 2>&1); stamp "red typecheck:app exit=$?"
    (cd "$W" && npm run test:unit -w gogospend-app -- $UNIT_NEW > "$L/red-unit.log" 2>&1)
    stamp "red unit exit=$? $(counts "$L/red-unit.log") assertion=$(grep -c 'AssertionError' "$L/red-unit.log")"
    (cd "$A" && npx vitest run --config vitest.render.config.ts --reporter=verbose $RENDER_NEW > "$L/red-render.log" 2>&1)
    stamp "red render exit=$? $(vt "$L/red-render.log") assertion=$(grep -c '^AssertionError' "$L/red-render.log") load-errors=$(grep -cE 'Cannot find module|Failed to resolve' "$L/red-render.log")"
    ;;
  green)
    place real $TESTS $DATA $CODE $SHARED
    stamp "green: placed every real file"
    (cd "$W" && npm run typecheck:app > "$L/green-typecheck.log" 2>&1); stamp "green typecheck:app exit=$?"
    (cd "$W" && npm run test:unit -w gogospend-app -- $UNIT_NEW src/wallet/copy/draftText.test.ts > "$L/green-unit.log" 2>&1)
    stamp "green unit (walletLooks, categoryIcons, draftText) exit=$? $(counts "$L/green-unit.log")"
    (cd "$A" && npx vitest run --config vitest.render.config.ts --reporter=verbose $RENDER_NEW > "$L/green-render.log" 2>&1)
    stamp "green render exit=$? $(vt "$L/green-render.log")"
    (cd "$A" && npx vitest run --config vitest.render.config.ts $NEIGHBOURS > "$L/green-neighbours.log" 2>&1)
    stamp "green neighbours exit=$? $(vt "$L/green-neighbours.log")"
    (cd "$A" && npx vitest run --config vitest.render.config.ts src/dev/catalogue/CatalogueScreen.render.test.tsx > "$L/green-catalogue.log" 2>&1)
    stamp "green CatalogueScreen (whole file, plan Step 4) exit=$? $(vt "$L/green-catalogue.log")"
    (cd "$A" && npx vitest run --config vitest.render.config.ts --reporter=verbose src/dev/catalogue/screenReader.render.test.tsx -t "$SECTIONS" > "$L/green-screen-reader.log" 2>&1)
    stamp "green screenReader (the three new sections) exit=$? $(vt "$L/green-screen-reader.log")"
    ;;
  gate)
    stamp "gate: start"
    (cd "$W" && npm run typecheck:app > "$L/gate-1-typecheck-app.log" 2>&1); stamp "gate typecheck:app exit=$?"
    (cd "$W" && npm run test:unit > "$L/gate-2-test-unit.log" 2>&1); stamp "gate test:unit exit=$? $(counts "$L/gate-2-test-unit.log")"
    (cd "$W" && npm run test:app > "$L/gate-3-test-app.log" 2>&1); stamp "gate test:app exit=$? $(counts "$L/gate-3-test-app.log")"
    (cd "$A" && npx vitest run --config vitest.render.config.ts $RENDER_NEW $NEIGHBOURS > "$L/gate-4-focused.log" 2>&1); stamp "gate focused render exit=$? $(vt "$L/gate-4-focused.log")"
    (cd "$A" && npx vitest run --config vitest.render.config.ts src/dev/catalogue/CatalogueScreen.render.test.tsx src/dev/catalogue/screenReader.render.test.tsx -t "$SECTIONS" > "$L/gate-5-catalogue.log" 2>&1); stamp "gate catalogue (the three new sections) exit=$? $(vt "$L/gate-5-catalogue.log")"
    (cd "$K" && for f in $TESTS $DATA $CODE $SHARED; do if [ -f "orig/$f" ]; then /usr/bin/git diff --no-index --check "orig/$f" "real/$f"; else /usr/bin/git diff --no-index --check /dev/null "real/$f"; fi; done > "$L/gate-6-diff-check.log" 2>&1); stamp "gate diff --check: $(grep -c . "$L/gate-6-diff-check.log") lines of whitespace errors"
    ;;
  *) echo "usage: prove.sh base|red|green|gate"; exit 2 ;;
esac
