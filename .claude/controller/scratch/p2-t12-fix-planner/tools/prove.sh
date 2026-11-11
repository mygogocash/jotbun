#!/bin/bash
# The planner's proof of the P2-T12 fix round (the review's M1, m3, m4, n2, n3
# and n4), one stage at a time, on a scratch copy of the PR's commit 90b5079 (W).
# Logs go to L. Stages, in order: base, before-pins, red, red-pins, green, then
# the mutants (python3 -I tools/mutants.py W logs/mutant-logs > logs/mutants.out),
# then gate and compat-tray.
#   bash tools/prove.sh <stage>
# W was made with `git archive 90b5079 | tar -x -C work`, then
# `npm ci --ignore-scripts --no-audit --no-fund` inside it (1416 packages). Since
# 90b5079's base (dbfde7d) the integration head has changed only controller
# files. orig/ holds 90b5079's files; real/ the round's five changed files.
set -u
K=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t12-fix-planner
W=$K/work
L=$K/logs
A=$W/apps/app
mkdir -p "$L"
stamp() { echo "[$(date +%T) load $(sysctl -n vm.loadavg | tr -d '{}' | awk '{print $1}')] $*" | tee -a "$L/summary.txt"; }
counts() { grep -E '^ℹ (tests|pass|fail) ' "$1" | tr '\n' ' '; }
vt() { grep -E '^ +(Test Files|Tests) ' "$1" | tr -s ' ' | tr '\n' ' '; }
render() { (cd "$A" && npx vitest run --config vitest.render.config.ts --reporter=verbose "$@"); }

CARD=apps/app/src/wallet/card
CODE="$CARD/WalletCard.tsx $CARD/cardFrames.tsx"
TESTS="$CARD/CardStack.render.test.tsx $CARD/cardStackNative.test.ts"
NEW_TEST=$CARD/cardNativeProps.test.ts
NODE_FILES="src/wallet/card/cardNativeProps.test.ts src/wallet/card/cardStackNative.test.ts"
FOCUSED="src/wallet/card/CardStack.render.test.tsx src/wallet/card/WalletCard.render.test.tsx"
NEIGHBOURS="src/wallet/testing/walletHarness.render.test.tsx src/wallet/tray/Tray.render.test.tsx src/wallet/looks/WalletLooks.render.test.tsx"
CATALOGUE="src/dev/catalogue/CatalogueScreen.render.test.tsx src/dev/catalogue/screenReader.render.test.tsx"
REVIEW_SURVIVORS="L1 L10 MF7 L3 L4 MF9 MF6 MF4"
WITHOUT_RED='^(?!.*(?:VoiceOver double tap|a view that comes back)).*$'

place() { # place <from-dir> <paths...>
  local from=$1; shift
  for rel in "$@"; do mkdir -p "$(dirname "$W/$rel")"; cp "$K/$from/$rel" "$W/$rel"; done
}
as_90b5079() { place orig $CODE $TESTS; rm -f "$W/$NEW_TEST"; }

case "${1:-}" in
  base)
    as_90b5079
    stamp "base: W as 90b5079"
    (cd "$W" && npm run typecheck:app > "$L/base-typecheck.log" 2>&1); stamp "base typecheck:app exit=$?"
    (cd "$A" && npm run test:unit -- src/wallet/card/cardStackNative.test.ts > "$L/base-unit.log" 2>&1); stamp "base cardStackNative.test.ts exit=$? $(counts "$L/base-unit.log")"
    render $FOCUSED > "$L/base-focused.log" 2>&1; stamp "base CardStack + WalletCard exit=$? $(vt "$L/base-focused.log")"
    render $NEIGHBOURS > "$L/base-neighbours.log" 2>&1; stamp "base neighbours exit=$? $(vt "$L/base-neighbours.log")"
    render $CATALOGUE -t "bw-" > "$L/base-catalogue.log" 2>&1; stamp "base catalogue bw- exit=$? $(vt "$L/base-catalogue.log")"
    ;;
  before-pins)
    as_90b5079
    stamp "before-pins: the review's eight survivors on 90b5079 as it is (its own tests)"
    python3 -I "$K/tools/mutants.py" "$W" "$L/before-pins-logs" --expect=survived $REVIEW_SURVIVORS > "$L/before-pins.out" 2>&1; stamp "before-pins exit=$? $(tail -1 "$L/before-pins.out")"
    ;;
  red)
    as_90b5079
    place real $TESTS $NEW_TEST
    stamp "red: 90b5079's code with the round's three test files"
    (cd "$W" && npm run typecheck:app > "$L/red-typecheck.log" 2>&1); stamp "red typecheck:app exit=$?"
    (cd "$A" && npm run test:unit -- $NODE_FILES > "$L/red-unit.log" 2>&1); stamp "red Node exit=$? $(counts "$L/red-unit.log") assertion=$(grep -c 'AssertionError \[ERR_ASSERTION\]' "$L/red-unit.log")"
    render src/wallet/card/CardStack.render.test.tsx > "$L/red-render.log" 2>&1
    stamp "red CardStack.render exit=$? $(vt "$L/red-render.log") assertion=$(grep -c '^AssertionError' "$L/red-render.log") load-errors=$(grep -cE 'Cannot find module|Failed to resolve|SyntaxError|TestingLibraryElementError' "$L/red-render.log")"
    ;;
  red-pins)
    as_90b5079
    place real $TESTS $NEW_TEST
    stamp "red-pins: the review's eight survivors on 90b5079's code with the round's tests"
    # The two cases that are RED on 90b5079's code (M1's and n2's) are left out, so each kill is its own pin's.
    render src/wallet/card/CardStack.render.test.tsx -t "$WITHOUT_RED" > "$L/red-pins-base.log" 2>&1; stamp "red-pins base (no mutant) exit=$? $(vt "$L/red-pins-base.log")"
    RENDER_T="$WITHOUT_RED" python3 -I "$K/tools/mutants.py" "$W" "$L/red-pins-logs" $REVIEW_SURVIVORS > "$L/red-pins.out" 2>&1; stamp "red-pins exit=$? $(tail -1 "$L/red-pins.out")"
    ;;
  green)
    place real $CODE $TESTS $NEW_TEST
    stamp "green: the round's five files"
    (cd "$W" && npm run typecheck:app > "$L/green-typecheck.log" 2>&1); stamp "green typecheck:app exit=$?"
    (cd "$A" && npm run test:unit -- $NODE_FILES > "$L/green-unit.log" 2>&1); stamp "green Node exit=$? $(counts "$L/green-unit.log")"
    render $FOCUSED > "$L/green-focused.log" 2>&1; stamp "green CardStack + WalletCard exit=$? $(vt "$L/green-focused.log") stderr-blocks=$(grep -c '^stderr |' "$L/green-focused.log")"
    render $NEIGHBOURS > "$L/green-neighbours.log" 2>&1; stamp "green neighbours exit=$? $(vt "$L/green-neighbours.log")"
    render $CATALOGUE -t "bw-" > "$L/green-catalogue.log" 2>&1; stamp "green catalogue bw- exit=$? $(vt "$L/green-catalogue.log")"
    ;;
  gate)
    place real $CODE $TESTS $NEW_TEST
    stamp "gate: start"
    (cd "$W" && npm run typecheck:app > "$L/gate-1-typecheck-app.log" 2>&1); stamp "gate typecheck:app exit=$?"
    (cd "$W" && npm run test:unit > "$L/gate-2-test-unit.log" 2>&1); stamp "gate test:unit exit=$? $(counts "$L/gate-2-test-unit.log")"
    (cd "$W" && npm run test:app > "$L/gate-3-test-app.log" 2>&1); stamp "gate test:app exit=$? $(counts "$L/gate-3-test-app.log")"
    (cd "$A" && npm run test:unit -- $NODE_FILES > "$L/gate-4a-focused-unit.log" 2>&1); stamp "gate focused Node exit=$? $(counts "$L/gate-4a-focused-unit.log")"
    render $FOCUSED $NEIGHBOURS > "$L/gate-4-focused-render.log" 2>&1; stamp "gate focused render exit=$? $(vt "$L/gate-4-focused-render.log")"
    render $CATALOGUE -t "bw-" > "$L/gate-5-catalogue.log" 2>&1; stamp "gate catalogue bw- exit=$? $(vt "$L/gate-5-catalogue.log")"
    # The scratch copy is not a repository, so each file is checked as git diff --check does: against 90b5079's copy, or against nothing when new.
    : > "$L/gate-6-diff-check.log"
    for rel in $CODE $TESTS $NEW_TEST; do
      if [ -f "$K/orig/$rel" ]; then /usr/bin/git diff --no-index --check "$K/orig/$rel" "$W/$rel" >> "$L/gate-6-diff-check.log" 2>&1
      else /usr/bin/git diff --no-index --check /dev/null "$W/$rel" >> "$L/gate-6-diff-check.log" 2>&1; fi
    done
    stamp "gate whitespace check: $(wc -l < "$L/gate-6-diff-check.log" | tr -d ' ') lines of complaint"
    ;;
  compat-tray)
    # As if tray-hardening (PR #392, in flight) merged first: its three files, as the PR's branch holds them now, over W.
    INTEGRATION=/Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1a-vault-core
    PR_HEAD=$(/usr/bin/git -C "$INTEGRATION" rev-parse --short origin/fix/tray-hardening)
    TRAY=$L/compat-tray-pr-$PR_HEAD
    for rel in apps/app/src/wallet/tray/Tray.tsx apps/app/src/wallet/tray/Tray.render.test.tsx apps/app/src/wallet/tray/trayGesture.test.ts; do
      mkdir -p "$(dirname "$TRAY/$rel")"; /usr/bin/git -C "$INTEGRATION" show "origin/fix/tray-hardening:$rel" > "$TRAY/$rel"
    done
    FILES=$(cd "$TRAY" && find . -type f | sed 's|^\./||' | sort)
    stamp "compat-tray: laying $(echo "$FILES" | wc -l | tr -d ' ') tray-hardening files (PR #392 at $PR_HEAD) over W: $(echo $FILES)"
    for rel in $FILES; do cp "$W/$rel" "$L/compat-tray-saved-$(basename "$rel")"; cp "$TRAY/$rel" "$W/$rel"; done
    (cd "$W" && npm run typecheck:app > "$L/compat-tray-typecheck.log" 2>&1); stamp "compat-tray typecheck:app exit=$?"
    (cd "$A" && npm run test:unit -- src/wallet/tray/trayGesture.test.ts $NODE_FILES > "$L/compat-tray-unit.log" 2>&1); stamp "compat-tray Node exit=$? $(counts "$L/compat-tray-unit.log")"
    render src/wallet/card/CardStack.render.test.tsx src/wallet/tray/Tray.render.test.tsx > "$L/compat-tray-render.log" 2>&1; stamp "compat-tray render exit=$? $(vt "$L/compat-tray-render.log")"
    for rel in $FILES; do cp "$L/compat-tray-saved-$(basename "$rel")" "$W/$rel"; rm "$L/compat-tray-saved-$(basename "$rel")"; done
    bad=0
    for rel in $FILES; do
      [ "$(/usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1a-vault-core show "90b5079:$rel" | shasum -a 256 | cut -d' ' -f1)" = "$(shasum -a 256 "$W/$rel" | cut -d' ' -f1)" ] || bad=$((bad + 1))
    done
    stamp "compat-tray: W put back, $bad files differ from 90b5079"
    ;;
  *) echo "usage: prove.sh base|before-pins|red|red-pins|green|gate|compat-tray"; exit 2 ;;
esac
