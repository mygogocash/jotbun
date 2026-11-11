#!/bin/bash
# The planner's proof of the tray-hardening fix round, one stage at a time, on
# a scratch tree (W) that is what the fixer's worktree holds after Step 1's
# merge: `git archive d1111f8` (today's origin/claude/p1a-vault-core, with
# #391's WalletLooksProvider) with 784667b's four files laid over it. The two
# sides share no file since 784667b's parent ecc00b7, so this is the merge's
# tree. Then `npm ci --ignore-scripts --no-audit --no-fund` (1416 packages).
# Stages, in order: base, red, green, probes, mutants (twice), gate;
# tools/run-all.sh runs them all. Logs go to L.
#   bash tools/prove.sh <stage>
set -u
K=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/tray-hardening-fix-planner
W=$K/work
L=$K/logs
A=$W/apps/app
INTEGRATION=/Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1a-vault-core
BASE_SHA=d1111f8
mkdir -p "$L"
stamp() { echo "[$(date +%T) load $(sysctl -n vm.loadavg | tr -d '{}' | awk '{print $1}')] $*" | tee -a "$L/summary.txt"; }
counts() { grep -E '^ℹ (tests|pass|fail) ' "$1" | tr '\n' ' '; }
vt() { grep -E '^ +(Test Files|Tests) ' "$1" | tr -s ' ' | tr '\n' ' '; }
render() { (cd "$A" && npx vitest run --config vitest.render.config.ts --reporter=verbose "$@"); }

TRAY=apps/app/src/wallet/tray/Tray.tsx
TEST=apps/app/src/wallet/tray/Tray.render.test.tsx
NODE_FILE=src/wallet/tray/trayGesture.test.ts
TRAY_TEST=src/wallet/tray/Tray.render.test.tsx
CATALOGUE="src/dev/catalogue/CatalogueScreen.render.test.tsx src/dev/catalogue/screenReader.render.test.tsx"
INDEX=apps/app/src/dev/catalogue/wallet/index.ts
PROBES="src/wallet/tray/reviewProbe.render.test.tsx src/wallet/tray/behaviourProbe.render.test.tsx src/wallet/tray/iosDismissProbe.render.test.tsx"

place() { # place <from-dir> <paths...>
  local from=$1; shift
  for rel in "$@"; do cp "$K/$from/$rel" "$W/$rel"; done
}
failing() { grep -E '^ +×' "$1" | sed -E 's/^ +× [^>]+> //; s/ [0-9]+ms$//'; }

case "${1:-}" in
  base)
    place orig $TRAY $TEST
    stamp "base: 784667b's tray files on $BASE_SHA (#391 merged)"
    (cd "$W" && npm run typecheck:app > "$L/base-typecheck.log" 2>&1); stamp "base typecheck:app exit=$?"
    (cd "$A" && npm run test:unit -- $NODE_FILE > "$L/base-unit.log" 2>&1); stamp "base trayGesture.test.ts exit=$? $(counts "$L/base-unit.log")"
    render $TRAY_TEST > "$L/base-render.log" 2>&1; stamp "base Tray.render exit=$? $(vt "$L/base-render.log")"
    render $CATALOGUE -t "bw-" > "$L/base-catalogue.log" 2>&1; stamp "base catalogue bw- exit=$? $(vt "$L/base-catalogue.log")"
    cp "$K"/probes/*.render.test.tsx "$A/src/wallet/tray/"
    render $PROBES > "$L/base-probes.log" 2>&1
    stamp "base probes (the review's 19, the first planner's 15) exit=$? $(vt "$L/base-probes.log") failing: $(failing "$L/base-probes.log" | sed -E 's/:.*//' | tr '\n' ' ')"
    rm "$A"/src/wallet/tray/reviewProbe.render.test.tsx "$A"/src/wallet/tray/behaviourProbe.render.test.tsx "$A"/src/wallet/tray/iosDismissProbe.render.test.tsx
    ;;
  red)
    place real $TEST
    place orig $TRAY
    stamp "red: the final test file (real/) over 784667b's Tray.tsx (orig/)"
    (cd "$W" && npm run typecheck:app > "$L/red-typecheck.log" 2>&1); stamp "red typecheck:app exit=$?"
    render $TRAY_TEST > "$L/red-render.log" 2>&1
    stamp "red Tray.render exit=$? $(vt "$L/red-render.log") assertion=$(grep -c '^AssertionError' "$L/red-render.log") load-errors=$(grep -cE 'Cannot find module|Failed to resolve|SyntaxError|TypeError|ReferenceError' "$L/red-render.log")"
    ;;
  green)
    place real $TRAY $TEST
    stamp "green: Tray.tsx and its test file (real/)"
    (cd "$W" && npm run typecheck:app > "$L/green-typecheck.log" 2>&1); stamp "green typecheck:app exit=$?"
    (cd "$A" && npm run test:unit -- $NODE_FILE > "$L/green-unit.log" 2>&1); stamp "green trayGesture.test.ts exit=$? $(counts "$L/green-unit.log")"
    render $TRAY_TEST > "$L/green-render.log" 2>&1; stamp "green Tray.render exit=$? $(vt "$L/green-render.log") stderr-blocks=$(grep -c '^stderr |' "$L/green-render.log")"
    render $CATALOGUE -t "bw-" > "$L/green-catalogue.log" 2>&1; stamp "green catalogue bw- exit=$? $(vt "$L/green-catalogue.log")"
    ;;
  probes)
    place real $TRAY $TEST
    cp "$K"/probes/*.render.test.tsx "$A/src/wallet/tray/"
    render $PROBES > "$L/green-probes.log" 2>&1
    stamp "green probes (the review's 19, the first planner's 15) exit=$? $(vt "$L/green-probes.log") failing: $(failing "$L/green-probes.log" | sed -E 's/:.*//' | tr '\n' ' ')"
    rm "$A"/src/wallet/tray/reviewProbe.render.test.tsx "$A"/src/wallet/tray/behaviourProbe.render.test.tsx "$A"/src/wallet/tray/iosDismissProbe.render.test.tsx
    ;;
  mutants)
    place real $TRAY $TEST
    python3 -I "$K/tools/mutants.py" "$W" --check > "$L/mutants-check.out" 2>&1; stamp "mutants --check exit=$? $(grep -c ' APPLIES: ' "$L/mutants-check.out") APPLIES"
    rm -rf "$L/mutant-logs" "$L/repeat"
    MUTANT_LOGS="$L/mutant-logs" python3 -I "$K/tools/mutants.py" "$W" > "$L/mutants.out" 2> "$L/mutants.err"; stamp "mutants exit=$? $(tail -1 "$L/mutants.out")"
    mkdir -p "$L/repeat"
    MUTANT_LOGS="$L/repeat/mutant-logs" python3 -I "$K/tools/mutants.py" "$W" > "$L/repeat/mutants.out" 2> "$L/repeat/mutants.err"; stamp "mutants, a second run exit=$? $(tail -1 "$L/repeat/mutants.out")"
    diff "$L/mutants.out" "$L/repeat/mutants.out" > "$L/repeat/diff.txt"; stamp "mutants: the two runs' lines $([ $? -eq 0 ] && echo are identical || echo DIFFER)"
    python3 -I "$K/tools/killers.py" "$L/mutant-logs" > "$L/killers.txt"
    bad=0
    for rel in $TRAY $TEST; do cmp -s "$K/real/$rel" "$W/$rel" || bad=$((bad + 1)); done
    [ "$(shasum -a 256 "$W/$INDEX" | cut -d' ' -f1)" = "$(/usr/bin/git -C "$INTEGRATION" show "$BASE_SHA:$INDEX" | shasum -a 256 | cut -d' ' -f1)" ] || bad=$((bad + 1))
    stamp "mutants: after both runs, $bad of the three files differ from real/ or the base"
    ;;
  gate)
    stamp "gate: start"
    (cd "$W" && npm run typecheck:app > "$L/gate-1-typecheck-app.log" 2>&1); stamp "gate typecheck:app exit=$?"
    (cd "$A" && npm run test:unit -- $NODE_FILE > "$L/gate-2-focused-unit.log" 2>&1); stamp "gate focused Node exit=$? $(counts "$L/gate-2-focused-unit.log")"
    render $TRAY_TEST > "$L/gate-3-focused-render.log" 2>&1; stamp "gate focused render exit=$? $(vt "$L/gate-3-focused-render.log")"
    render $CATALOGUE -t "bw-" > "$L/gate-3b-catalogue.log" 2>&1; stamp "gate catalogue bw- exit=$? $(vt "$L/gate-3b-catalogue.log")"
    (cd "$W" && npm run test:app > "$L/gate-4-test-app.log" 2>&1); stamp "gate test:app exit=$? $(counts "$L/gate-4-test-app.log")"
    (cd "$W" && npm run test:unit > "$L/gate-5-test-unit.log" 2>&1); stamp "gate test:unit exit=$? $(counts "$L/gate-5-test-unit.log")"
    # The scratch tree is not a repository, so each file is checked as git diff --check does: against 784667b's copy.
    : > "$L/gate-6-diff-check.log"
    for rel in $TRAY $TEST; do GIT_CEILING_DIRECTORIES=$K /usr/bin/git diff --no-index --check "$K/orig/$rel" "$W/$rel" >> "$L/gate-6-diff-check.log" 2>&1; done
    stamp "gate whitespace check: $(wc -l < "$L/gate-6-diff-check.log" | tr -d ' ') lines of complaint"
    ;;
  *) echo "usage: prove.sh base|red|green|probes|mutants|gate"; exit 2 ;;
esac
