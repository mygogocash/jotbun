#!/bin/bash
# The planner's proof of the P2-T14 fix round (ruling R106: the first review's
# M1, m1 to m5 and n1 to n4; the second review's m1 to m4 and n1 to n3), one
# stage at a time, on a scratch copy of PR #407's commit 18876253 (W). Logs go
# to L. Stages, in order: base, before-pins, red, green, then the mutants
# (python3 -I tools/mutants.py W logs/mutant-logs > logs/mutants.out), then
# gate. W was made with `git archive 18876253 | tar -x -C work`, with
# node_modules linked from the PR's worktree (its npm ci, 1416 packages). Since
# 18876253's base (96a52c2a) the integration head has changed nothing under
# apps/app, packages or the lockfiles. orig/ holds 18876253's files, real/ the
# round's nine, stubs/ the RED forms of three of them.
#   bash tools/prove.sh <stage>
set -u
K=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t14-fix-planner
W=$K/work
L=$K/logs
A=$W/apps/app
mkdir -p "$L"
stamp() { echo "[$(date +%T) load $(sysctl -n vm.loadavg | tr -d '{}' | awk '{print $1}')] $*" | tee -a "$L/summary.txt"; }
counts() { grep -E '^ℹ (tests|pass|fail) ' "$1" | tr '\n' ' '; }
vt() { grep -E '^ +(Test Files|Tests) ' "$1" | tr -s ' ' | tr '\n' ' '; }
render() { (cd "$A" && npx vitest run --config vitest.render.config.ts --reporter=verbose "$@"); }

ADD=apps/app/src/wallet/add
SECTIONS=apps/app/src/dev/catalogue/wallet/addSections.tsx
TESTS="$ADD/addFlow.test.ts $ADD/AmountStep.render.test.tsx"
NEW_TEST=$ADD/amountStepNative.test.ts
STUBBED="$ADD/addFlow.ts $ADD/AmountStep.tsx $ADD/TypeSwitchHeader.tsx"
PLAIN="$ADD/WalletKeypad.tsx $ADD/QuickChips.tsx $SECTIONS"
ORIG_FILES="$TESTS $STUBBED $PLAIN $ADD/copy.ts apps/app/src/dev/catalogue/wallet/index.ts"
NODE_FILES="src/wallet/add/addFlow.test.ts src/wallet/add/amountStepNative.test.ts"
FOCUSED=src/wallet/add/AmountStep.render.test.tsx
NEIGHBOURS="src/wallet/tray/Tray.render.test.tsx src/wallet/testing/walletHarness.render.test.tsx src/wallet/privacy/PrivateMode.render.test.tsx src/wallet/looks/WalletLooks.render.test.tsx"
CATALOGUE="src/dev/catalogue/CatalogueScreen.render.test.tsx src/dev/catalogue/screenReader.render.test.tsx"

place() { # place <from-dir> <paths...>
  local from=$1; shift
  for rel in "$@"; do mkdir -p "$(dirname "$W/$rel")"; cp "$K/$from/$rel" "$W/$rel"; done
}
as_18876253() { place orig $ORIG_FILES; rm -f "$W/$NEW_TEST"; }

case "${1:-}" in
  base)
    as_18876253
    stamp "base: W as 18876253"
    (cd "$W" && npm run typecheck:app > "$L/base-typecheck.log" 2>&1); stamp "base typecheck:app exit=$?"
    (cd "$A" && npm run test:unit -- src/wallet/add/addFlow.test.ts src/wallet/copy/draftText.test.ts > "$L/base-unit.log" 2>&1); stamp "base addFlow + draftText exit=$? $(counts "$L/base-unit.log")"
    render $FOCUSED > "$L/base-render.log" 2>&1; stamp "base AmountStep.render exit=$? $(vt "$L/base-render.log")"
    render $NEIGHBOURS > "$L/base-neighbours.log" 2>&1; stamp "base neighbours exit=$? $(vt "$L/base-neighbours.log")"
    render $CATALOGUE -t "bw-" > "$L/base-catalogue.log" 2>&1; stamp "base catalogue bw- exit=$? $(vt "$L/base-catalogue.log")"
    render src/dev/catalogue/CatalogueScreen.render.test.tsx -t "registry has a section" > "$L/base-registry.log" 2>&1; stamp "base registry rule exit=$? $(vt "$L/base-registry.log")"
    ;;
  before-pins)
    as_18876253
    stamp "before-pins: the reviews' survivors on 18876253 as it is (its own two focused files)"
    python3 -I "$K/tools/mutants.py" "$W" "$L/before-pins-logs" --before > "$L/before-pins.out" 2>&1; stamp "before-pins exit=$? $(tail -1 "$L/before-pins.out")"
    ;;
  red)
    as_18876253
    place real $TESTS $NEW_TEST $PLAIN
    place stubs $STUBBED
    stamp "red: the round's tests, its typed stubs of addFlow.ts, AmountStep.tsx and TypeSwitchHeader.tsx, and its WalletKeypad.tsx, QuickChips.tsx and addSections.tsx"
    (cd "$W" && npm run typecheck:app > "$L/red-typecheck.log" 2>&1); stamp "red typecheck:app exit=$?"
    (cd "$A" && npm run test:unit -- $NODE_FILES > "$L/red-unit.log" 2>&1); stamp "red Node exit=$? $(counts "$L/red-unit.log") assertion=$(grep -c 'AssertionError \[ERR_ASSERTION\]' "$L/red-unit.log")"
    render $FOCUSED > "$L/red-render.log" 2>&1
    stamp "red AmountStep.render exit=$? $(vt "$L/red-render.log") assertion=$(grep -c '^AssertionError' "$L/red-render.log") load-errors=$(grep -cE 'Cannot find module|Failed to resolve|SyntaxError|is not a function|TestingLibraryElementError' "$L/red-render.log")"
    ;;
  green)
    place real $TESTS $NEW_TEST $STUBBED $PLAIN
    stamp "green: the round's nine files"
    (cd "$W" && npm run typecheck:app > "$L/green-typecheck.log" 2>&1); stamp "green typecheck:app exit=$?"
    (cd "$A" && npm run test:unit -- $NODE_FILES src/wallet/copy/draftText.test.ts > "$L/green-unit.log" 2>&1); stamp "green Node exit=$? $(counts "$L/green-unit.log")"
    render $FOCUSED > "$L/green-render.log" 2>&1; stamp "green AmountStep.render exit=$? $(vt "$L/green-render.log") stderr-blocks=$(grep -c '^stderr |' "$L/green-render.log")"
    render $NEIGHBOURS > "$L/green-neighbours.log" 2>&1; stamp "green neighbours exit=$? $(vt "$L/green-neighbours.log")"
    render $CATALOGUE -t "bw-" > "$L/green-catalogue.log" 2>&1; stamp "green catalogue bw- exit=$? $(vt "$L/green-catalogue.log")"
    render src/dev/catalogue/CatalogueScreen.render.test.tsx -t "registry has a section" > "$L/green-registry.log" 2>&1; stamp "green registry rule exit=$? $(vt "$L/green-registry.log")"
    ;;
  gate)
    place real $TESTS $NEW_TEST $STUBBED $PLAIN
    stamp "gate: start"
    (cd "$W" && npm run typecheck:app > "$L/gate-1-typecheck-app.log" 2>&1); stamp "gate typecheck:app exit=$?"
    (cd "$W" && npm run test:app > "$L/gate-2-test-app.log" 2>&1); stamp "gate test:app exit=$? $(counts "$L/gate-2-test-app.log")"
    (cd "$W" && npm run test:unit > "$L/gate-3-test-unit.log" 2>&1); stamp "gate test:unit exit=$? $(counts "$L/gate-3-test-unit.log")"
    (cd "$A" && npm run test:unit -- $NODE_FILES src/wallet/copy/draftText.test.ts > "$L/gate-4a-focused-unit.log" 2>&1); stamp "gate focused Node exit=$? $(counts "$L/gate-4a-focused-unit.log")"
    render $FOCUSED $NEIGHBOURS > "$L/gate-4b-focused-render.log" 2>&1; stamp "gate focused render exit=$? $(vt "$L/gate-4b-focused-render.log")"
    render $CATALOGUE -t "bw-" > "$L/gate-5-catalogue.log" 2>&1; stamp "gate catalogue bw- exit=$? $(vt "$L/gate-5-catalogue.log")"
    # The scratch copy is not a repository, so each file is checked as git diff --check does: against 18876253's copy, or against nothing when new.
    : > "$L/gate-6-diff-check.log"
    for rel in $TESTS $STUBBED $PLAIN $NEW_TEST; do
      if [ -f "$K/orig/$rel" ]; then /usr/bin/git diff --no-index --check "$K/orig/$rel" "$W/$rel" >> "$L/gate-6-diff-check.log" 2>&1
      else /usr/bin/git diff --no-index --check /dev/null "$W/$rel" >> "$L/gate-6-diff-check.log" 2>&1; fi
    done
    stamp "gate whitespace check: $(wc -l < "$L/gate-6-diff-check.log" | tr -d ' ') lines of complaint"
    ;;
  *) echo "usage: prove.sh base|before-pins|red|green|gate"; exit 2 ;;
esac
