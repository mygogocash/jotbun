#!/bin/bash
# The planner's proof of P2-T12, one stage at a time, on a scratch copy of the
# integration head (W). Logs go to L. Stages, in order: base, red, green, then
# the mutants (python3 -I tools/mutants.py W logs/mutant-logs > logs/mutants.out),
# then gate and compat-tray.
#   bash tools/prove.sh <stage>
# W was made with `git archive 76b329c | tar -x -C work` (the head once
# wallet-looks-unstored, PR #391, merged), then `npm ci --ignore-scripts
# --no-audit --no-fund` inside it (1416 packages). The first proof ran on
# 6db889a's tree (logs/superseded/head-6db889a/), where a compat stage laid
# #391's final files over W; #391 has merged since, so that stage is gone.
# compat-tray lays tray-hardening's final files (PR #392, in flight) over W, as
# if it merged first, runs this task's focused files, then puts W back.
set -u
K=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t12-planner
W=$K/work
L=$K/logs
A=$W/apps/app
mkdir -p "$L"
stamp() { echo "[$(date +%T) load $(sysctl -n vm.loadavg | tr -d '{}' | awk '{print $1}')] $*" | tee -a "$L/summary.txt"; }
counts() { grep -E '^ℹ (tests|pass|fail) ' "$1" | tr '\n' ' '; }
vt() { grep -E '^ +(Test Files|Tests) ' "$1" | tr -s ' ' | tr '\n' ' '; }
render() { (cd "$A" && npx vitest run --config vitest.render.config.ts --reporter=verbose "$@"); }

TEST="apps/app/src/wallet/card/CardStack.render.test.tsx apps/app/src/wallet/card/cardStackNative.test.ts"
NODE_NEW=src/wallet/card/cardStackNative.test.ts
STUBS="apps/app/src/wallet/card/cardFrames.tsx apps/app/src/wallet/card/CardStack.tsx"
NEW_SECTIONS=apps/app/src/dev/catalogue/wallet/stackSections.tsx
INDEX=apps/app/src/dev/catalogue/wallet/index.ts
CODE="$STUBS $NEW_SECTIONS $INDEX"
FOCUSED=src/wallet/card/CardStack.render.test.tsx
NEIGHBOURS="src/wallet/card/WalletCard.render.test.tsx src/wallet/testing/walletHarness.render.test.tsx src/wallet/tray/Tray.render.test.tsx src/wallet/looks/WalletLooks.render.test.tsx"
CATALOGUE="src/dev/catalogue/CatalogueScreen.render.test.tsx src/dev/catalogue/screenReader.render.test.tsx"

place() { # place <from-dir> <paths...>
  local from=$1; shift
  for rel in "$@"; do mkdir -p "$(dirname "$W/$rel")"; cp "$K/$from/$rel" "$W/$rel"; done
}

head_tree() { # W's task files as at the head: the new files gone, index.ts as it was
  for rel in $TEST; do rm -f "$W/$rel"; done
  rm -f "$W/apps/app/src/wallet/card/cardFrames.tsx" "$W/apps/app/src/wallet/card/CardStack.tsx" "$W/$NEW_SECTIONS"
  cp "$K/orig/$INDEX" "$W/$INDEX"
}

catalogue() { # catalogue <prefix>: the wallet sections in the every-section and screen-reader suites
  render $CATALOGUE -t "bw-" > "$L/$1-catalogue.log" 2>&1; stamp "$1 catalogue bw- exit=$? $(vt "$L/$1-catalogue.log")"
}

case "${1:-}" in
  base)
    head_tree
    stamp "base: W's app tree at the head, 76b329c"
    (cd "$W" && npm run typecheck:app > "$L/base-typecheck.log" 2>&1); stamp "base typecheck:app exit=$?"
    render $NEIGHBOURS > "$L/base-neighbours.log" 2>&1; stamp "base neighbours exit=$? $(vt "$L/base-neighbours.log")"
    catalogue base
    ;;
  red)
    head_tree
    place real $TEST
    place stubs $STUBS
    stamp "red: placed the test and the two typed stubs; index.ts as at the head, no stackSections.tsx"
    (cd "$W" && npm run typecheck:app > "$L/red-typecheck.log" 2>&1); stamp "red typecheck:app exit=$?"
    (cd "$A" && npm run test:unit -- $NODE_NEW > "$L/red-unit.log" 2>&1); stamp "red cardStackNative.test.ts exit=$? $(counts "$L/red-unit.log") assertion=$(grep -c 'AssertionError' "$L/red-unit.log")"
    render $FOCUSED > "$L/red-render.log" 2>&1
    stamp "red CardStack.render exit=$? $(vt "$L/red-render.log") assertion=$(grep -c '^AssertionError' "$L/red-render.log") load-errors=$(grep -cE 'Cannot find module|Failed to resolve|SyntaxError|is not a function|TestingLibraryElementError' "$L/red-render.log")"
    ;;
  green)
    place real $TEST $CODE
    stamp "green: placed the stack, the frames, the stack sections and index.ts"
    (cd "$W" && npm run typecheck:app > "$L/green-typecheck.log" 2>&1); stamp "green typecheck:app exit=$?"
    (cd "$A" && npm run test:unit -- $NODE_NEW > "$L/green-unit.log" 2>&1); stamp "green cardStackNative.test.ts exit=$? $(counts "$L/green-unit.log")"
    render $FOCUSED > "$L/green-render.log" 2>&1; stamp "green CardStack.render exit=$? $(vt "$L/green-render.log") stderr-blocks=$(grep -c '^stderr |' "$L/green-render.log")"
    render $NEIGHBOURS > "$L/green-neighbours.log" 2>&1; stamp "green neighbours exit=$? $(vt "$L/green-neighbours.log")"
    catalogue green
    ;;
  gate)
    place real $TEST $CODE
    stamp "gate: start"
    (cd "$W" && npm run typecheck:app > "$L/gate-1-typecheck-app.log" 2>&1); stamp "gate typecheck:app exit=$?"
    (cd "$W" && npm run test:unit > "$L/gate-2-test-unit.log" 2>&1); stamp "gate test:unit exit=$? $(counts "$L/gate-2-test-unit.log")"
    (cd "$W" && npm run test:app > "$L/gate-3-test-app.log" 2>&1); stamp "gate test:app exit=$? $(counts "$L/gate-3-test-app.log")"
    (cd "$A" && npm run test:unit -- $NODE_NEW > "$L/gate-4a-focused-unit.log" 2>&1); stamp "gate focused Node exit=$? $(counts "$L/gate-4a-focused-unit.log")"
    render $FOCUSED $NEIGHBOURS > "$L/gate-4-focused-render.log" 2>&1; stamp "gate focused render exit=$? $(vt "$L/gate-4-focused-render.log")"
    render $CATALOGUE -t "bw-stack" > "$L/gate-5-catalogue.log" 2>&1; stamp "gate catalogue bw-stack exit=$? $(vt "$L/gate-5-catalogue.log")"
    # The scratch copy is not a repository, so each file is checked as git diff --check does: against the head's copy, or against nothing when new.
    : > "$L/gate-6-diff-check.log"
    for rel in $CODE $TEST; do
      if [ -f "$K/orig/$rel" ]; then /usr/bin/git diff --no-index --check "$K/orig/$rel" "$W/$rel" >> "$L/gate-6-diff-check.log" 2>&1
      else /usr/bin/git diff --no-index --check /dev/null "$W/$rel" >> "$L/gate-6-diff-check.log" 2>&1; fi
    done
    stamp "gate whitespace check: $(wc -l < "$L/gate-6-diff-check.log" | tr -d ' ') lines of complaint"
    ;;
  compat-tray)
    # As if tray-hardening (in flight; its P11 rewrites the tray's catalogue case) merged first: its three final files over W.
    TRAY=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/tray-hardening-planner/real
    FILES=$(cd "$TRAY" && find . -type f | sed 's|^\./||' | sort)
    stamp "compat-tray: laying $(echo "$FILES" | wc -l | tr -d ' ') tray-hardening files over W: $(echo $FILES)"
    for rel in $FILES; do cp "$W/$rel" "$L/compat-tray-saved-$(basename "$rel")"; cp "$TRAY/$rel" "$W/$rel"; done
    (cd "$W" && npm run typecheck:app > "$L/compat-tray-typecheck.log" 2>&1); stamp "compat-tray typecheck:app exit=$?"
    (cd "$A" && npm run test:unit -- src/wallet/tray/trayGesture.test.ts $NODE_NEW > "$L/compat-tray-unit.log" 2>&1); stamp "compat-tray Node exit=$? $(counts "$L/compat-tray-unit.log")"
    render $FOCUSED src/wallet/tray/Tray.render.test.tsx > "$L/compat-tray-render.log" 2>&1; stamp "compat-tray render exit=$? $(vt "$L/compat-tray-render.log")"
    for rel in $FILES; do cp "$L/compat-tray-saved-$(basename "$rel")" "$W/$rel"; rm "$L/compat-tray-saved-$(basename "$rel")"; done
    bad=0
    for rel in $FILES; do
      [ "$(/usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1a-vault-core show "76b329c:$rel" | shasum -a 256 | cut -d' ' -f1)" = "$(shasum -a 256 "$W/$rel" | cut -d' ' -f1)" ] || bad=$((bad + 1))
    done
    stamp "compat-tray: W put back, $bad files differ from the head"
    ;;
  *) echo "usage: prove.sh base|red|green|gate|compat-tray"; exit 2 ;;
esac
