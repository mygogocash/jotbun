#!/bin/bash
# The planner's proof of P2-T13, one stage at a time, on a scratch copy of the
# integration head (W). Logs go to L. Stages, in order: base, red, green, then
# the mutants (python3 -I tools/mutants.py W logs/mutant-logs > logs/mutants.out),
# then gate and compat.
#   bash tools/prove.sh <stage>
# W was made with `git archive 712574d | tar -x -C work`, then
# `npm ci --ignore-scripts --no-audit --no-fund` inside it (1416 packages).
# compat lays P2-T11's final files (scratch/p2-t11-planner/real/) over W, as if
# P2-T11 had merged first, runs this task's focused files, and then puts W back
# (sha256 checked against the archive).
set -u
K=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t13-planner
W=$K/work
L=$K/logs
A=$W/apps/app
P11=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t11-planner/real
INTEGRATION=/Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1a-vault-core
HEAD_SHA=712574d
mkdir -p "$L"
stamp() { echo "[$(date +%T) load $(sysctl -n vm.loadavg | tr -d '{}' | awk '{print $1}')] $*" | tee -a "$L/summary.txt"; }
counts() { grep -E '^ℹ (tests|pass|fail) ' "$1" | tr '\n' ' '; }
vt() { grep -E '^ +(Test Files|Tests) ' "$1" | tr -s ' ' | tr '\n' ' '; }
render() { (cd "$A" && npx vitest run --config vitest.render.config.ts --reporter=verbose "$@"); }

TESTS="apps/app/src/wallet/tray/trayGesture.test.ts apps/app/src/wallet/tray/Tray.render.test.tsx apps/app/src/wallet/motion/useWalletMotion.render.test.tsx"
STUBS="apps/app/src/wallet/tray/trayGesture.ts apps/app/src/wallet/tray/Tray.tsx apps/app/src/wallet/tray/PrimaryButton.tsx apps/app/src/wallet/tray/TextLink.tsx apps/app/src/ui/lockCover.tsx"
CODE="$STUBS apps/app/src/dev/catalogue/wallet/traySections.tsx apps/app/src/dev/catalogue/wallet/index.ts apps/app/src/theme/motion.ts"
SHARED="apps/app/src/dev/catalogue/wallet/index.ts apps/app/src/theme/motion.ts apps/app/src/wallet/motion/useWalletMotion.render.test.tsx"
NODE_NEW="src/wallet/tray/trayGesture.test.ts"
TRAY_TEST="src/wallet/tray/Tray.render.test.tsx"
MOTION_TEST="src/wallet/motion/useWalletMotion.render.test.tsx"
NEIGHBOURS="src/wallet/testing/walletHarness.render.test.tsx src/wallet/WalletRoot.render.test.tsx src/wallet/motion/GrowBar.render.test.tsx src/ui/Sheet.render.test.tsx src/wallet/privacy/PrivateMode.render.test.tsx"
CATALOGUE="src/dev/catalogue/CatalogueScreen.render.test.tsx src/dev/catalogue/screenReader.render.test.tsx"

place() { # place <from-dir> <paths...>
  local from=$1; shift
  for rel in "$@"; do mkdir -p "$(dirname "$W/$rel")"; cp "$K/$from/$rel" "$W/$rel"; done
}

catalogue() { # catalogue <prefix>: the wallet sections in the every-section and screen-reader suites, and the registry rule
  render $CATALOGUE -t "bw-" > "$L/$1-catalogue.log" 2>&1; stamp "$1 catalogue bw- exit=$? $(vt "$L/$1-catalogue.log")"
  render src/dev/catalogue/CatalogueScreen.render.test.tsx -t "registry has a section" > "$L/$1-registry.log" 2>&1; stamp "$1 registry rule exit=$? $(vt "$L/$1-registry.log")"
}

case "${1:-}" in
  base)
    stamp "base: start at $HEAD_SHA"
    (cd "$W" && npm run typecheck:app > "$L/base-typecheck.log" 2>&1); stamp "base typecheck:app exit=$?"
    render $MOTION_TEST > "$L/base-motion.log" 2>&1; stamp "base useWalletMotion exit=$? $(vt "$L/base-motion.log")"
    render $NEIGHBOURS > "$L/base-neighbours.log" 2>&1; stamp "base neighbours exit=$? $(vt "$L/base-neighbours.log")"
    catalogue base
    ;;
  red)
    place real $TESTS
    place stubs $STUBS
    stamp "red: placed the three tests (two new, the builders' case extended) and the five typed stubs; index.ts and motion.ts as at the head"
    (cd "$W" && npm run typecheck:app > "$L/red-typecheck.log" 2>&1); stamp "red typecheck:app exit=$?"
    (cd "$A" && npm run test:unit -- $NODE_NEW > "$L/red-unit.log" 2>&1); stamp "red trayGesture.test.ts exit=$? $(counts "$L/red-unit.log")"
    render $TRAY_TEST > "$L/red-render.log" 2>&1
    stamp "red Tray.render exit=$? $(vt "$L/red-render.log") assertion=$(grep -c '^AssertionError' "$L/red-render.log") load-errors=$(grep -cE 'Cannot find module|Failed to resolve|SyntaxError|is not a function' "$L/red-render.log")"
    render $MOTION_TEST > "$L/red-motion.log" 2>&1; stamp "red useWalletMotion (pins P2-T9's code; passes by design) exit=$? $(vt "$L/red-motion.log")"
    ;;
  green)
    place real $CODE
    stamp "green: placed the tray, the two buttons, the cover, the gesture rule, the tray sections, index.ts and motion.ts"
    (cd "$W" && npm run typecheck:app > "$L/green-typecheck.log" 2>&1); stamp "green typecheck:app exit=$?"
    (cd "$A" && npm run test:unit -- $NODE_NEW > "$L/green-unit.log" 2>&1); stamp "green trayGesture.test.ts exit=$? $(counts "$L/green-unit.log")"
    render $TRAY_TEST $MOTION_TEST > "$L/green-render.log" 2>&1; stamp "green render exit=$? $(vt "$L/green-render.log") stderr-blocks=$(grep -c '^stderr |' "$L/green-render.log")"
    render $NEIGHBOURS > "$L/green-neighbours.log" 2>&1; stamp "green neighbours exit=$? $(vt "$L/green-neighbours.log")"
    catalogue green
    ;;
  gate)
    stamp "gate: start"
    (cd "$W" && npm run typecheck:app > "$L/gate-1-typecheck-app.log" 2>&1); stamp "gate typecheck:app exit=$?"
    (cd "$W" && npm run test:app > "$L/gate-2-test-app.log" 2>&1); stamp "gate test:app exit=$? $(counts "$L/gate-2-test-app.log")"
    (cd "$W" && npm run test:unit > "$L/gate-3-test-unit.log" 2>&1); stamp "gate test:unit exit=$? $(counts "$L/gate-3-test-unit.log")"
    (cd "$A" && npm run test:unit -- $NODE_NEW > "$L/gate-4-focused-unit.log" 2>&1); stamp "gate focused Node exit=$? $(counts "$L/gate-4-focused-unit.log")"
    render $TRAY_TEST $MOTION_TEST $NEIGHBOURS > "$L/gate-5-focused-render.log" 2>&1; stamp "gate focused render exit=$? $(vt "$L/gate-5-focused-render.log")"
    # The scratch copy is not a repository, so each file is checked as git diff --check does: against the head's copy, or against nothing when new.
    : > "$L/gate-6-diff-check.log"
    for rel in $CODE $TESTS; do
      if [ -f "$K/orig/$rel" ]; then /usr/bin/git diff --no-index --check "$K/orig/$rel" "$W/$rel" >> "$L/gate-6-diff-check.log" 2>&1
      else /usr/bin/git diff --no-index --check /dev/null "$W/$rel" >> "$L/gate-6-diff-check.log" 2>&1; fi
    done
    stamp "gate whitespace check: $(wc -l < "$L/gate-6-diff-check.log" | tr -d ' ') lines of complaint"
    ;;
  compat)
    # As if P2-T11 merged first: its final files over W, then this task's focused files.
    P11_FILES=$(cd "$P11" && find . -type f | sed 's|^\./||' | sort)
    stamp "compat: laying $(echo "$P11_FILES" | wc -l | tr -d ' ') P2-T11 files over W"
    for rel in $P11_FILES; do mkdir -p "$(dirname "$W/$rel")"; cp "$P11/$rel" "$W/$rel"; done
    (cd "$W" && npm run typecheck:app > "$L/compat-typecheck.log" 2>&1); stamp "compat typecheck:app exit=$?"
    render $TRAY_TEST $MOTION_TEST src/wallet/testing/walletHarness.render.test.tsx src/wallet/looks/WalletLooks.render.test.tsx > "$L/compat-render.log" 2>&1; stamp "compat render exit=$? $(vt "$L/compat-render.log")"
    catalogue compat
    # Put W back: P2-T11's new files go, its changed files come back from the head.
    for rel in $P11_FILES; do
      if /usr/bin/git -C "$INTEGRATION" cat-file -e "$HEAD_SHA:$rel" 2>/dev/null; then /usr/bin/git -C "$INTEGRATION" show "$HEAD_SHA:$rel" > "$W/$rel"
      else rm "$W/$rel"; fi
    done
    find "$A/src/wallet/looks" "$A/src/wallet/card" -type d -empty -delete 2>/dev/null
    bad=0
    for rel in $P11_FILES; do
      if /usr/bin/git -C "$INTEGRATION" cat-file -e "$HEAD_SHA:$rel" 2>/dev/null; then
        [ "$(/usr/bin/git -C "$INTEGRATION" show "$HEAD_SHA:$rel" | shasum -a 256 | cut -d' ' -f1)" = "$(shasum -a 256 "$W/$rel" | cut -d' ' -f1)" ] || bad=$((bad + 1))
      else [ -e "$W/$rel" ] && bad=$((bad + 1)); fi
    done
    stamp "compat: W put back, $bad files differ from the head"
    ;;
  *) echo "usage: prove.sh base|red|green|gate|compat"; exit 2 ;;
esac
