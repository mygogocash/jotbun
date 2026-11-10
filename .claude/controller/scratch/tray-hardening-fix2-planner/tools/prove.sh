#!/bin/bash
# The planner's proof of tray-hardening's second fix round, one stage at a time, on
# a scratch tree (W): `git archive fc78376` of the task worktree, with node_modules
# symlinked from the worktree (root node_modules, and apps/app/node_modules/@better-auth).
# The integration branch has changed only `.claude/` since 33edab1's base 6a727dc
# (`git diff --stat 6a727dc origin/claude/p1a-vault-core -- . ':!.claude'` prints
# nothing), so this is the tree the fixer's merge in Step 1 gives, for every file a
# test reads.
# Stages, in order: base, red, redm3, green, probes, model, mutants (twice), gate;
# tools/run-all.sh runs them all. Logs go to L.
#   bash tools/prove.sh <stage>
set -u
K=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/tray-hardening-fix2-planner
W=$K/work
L=$K/logs
A=$W/apps/app
mkdir -p "$L"
stamp() { echo "[$(date +%T) load $(sysctl -n vm.loadavg | tr -d '{}' | awk '{print $1}')] $*" | tee -a "$L/summary.txt"; }
counts() { grep -E '^ℹ (tests|pass|fail) ' "$1" | tr '\n' ' '; }
vt() { grep -E '^ +(Test Files|Tests) ' "$1" | tr -s ' ' | tr '\n' ' '; }
render() { (cd "$A" && npx vitest run --config vitest.render.config.ts --reporter=verbose "$@"); }

TRAY=apps/app/src/wallet/tray/Tray.tsx
TEST=apps/app/src/wallet/tray/Tray.render.test.tsx
RECEIPT=docs/implementation/receipts/tray-hardening.md
NODE_FILE=src/wallet/tray/trayGesture.test.ts
TRAY_TEST=src/wallet/tray/Tray.render.test.tsx
CATALOGUE="src/dev/catalogue/CatalogueScreen.render.test.tsx src/dev/catalogue/screenReader.render.test.tsx"
INDEX=apps/app/src/dev/catalogue/wallet/index.ts
PROBE_NAMES="reviewProbe behaviourProbe iosDismissProbe confirmProbe seamProbe modelProbe"
PROBES=""; for p in $PROBE_NAMES; do PROBES="$PROBES src/wallet/tray/$p.render.test.tsx"; done

place() { # place <from-dir> <paths...>
  local from=$1; shift
  for rel in "$@"; do cp "$K/$from/$rel" "$W/$rel"; done
}
failing() { grep -E '^ +×' "$1" | sed -E 's/^ +× [^>]+> //; s/ [0-9]+ms$//'; }
probes_in() { for p in $PROBE_NAMES; do cp "$K/probes/$p.render.test.tsx" "$A/src/wallet/tray/"; done; }
probes_out() { for p in $PROBE_NAMES; do rm -f "$A/src/wallet/tray/$p.render.test.tsx"; done; }

case "${1:-}" in
  base)
    place orig $TRAY $TEST $RECEIPT
    stamp "base: fc78376's files"
    (cd "$W" && npm run typecheck:app > "$L/base-typecheck.log" 2>&1); stamp "base typecheck:app exit=$?"
    (cd "$A" && npm run test:unit -- $NODE_FILE > "$L/base-unit.log" 2>&1); stamp "base trayGesture.test.ts exit=$? $(counts "$L/base-unit.log")"
    render $TRAY_TEST > "$L/base-render.log" 2>&1; stamp "base Tray.render exit=$? $(vt "$L/base-render.log")"
    render $CATALOGUE -t "bw-" > "$L/base-catalogue.log" 2>&1; stamp "base catalogue bw- exit=$? $(vt "$L/base-catalogue.log")"
    probes_in
    render $PROBES > "$L/base-probes.log" 2>&1
    stamp "base probes (the first review's 19, the first planner's 15, the confirming review's 8, its seam copy and its model at length 6) exit=$? $(vt "$L/base-probes.log") failing: $(failing "$L/base-probes.log" | sed -E 's/:.*//' | tr '\n' ' ')"
    probes_out
    ;;
  red)
    place real $TEST
    place orig $TRAY
    stamp "red: the final test file (real/) over fc78376's Tray.tsx (orig/)"
    (cd "$W" && npm run typecheck:app > "$L/red-typecheck.log" 2>&1); stamp "red typecheck:app exit=$?"
    render $TRAY_TEST > "$L/red-render.log" 2>&1
    stamp "red Tray.render exit=$? $(vt "$L/red-render.log") assertion=$(grep -c '^AssertionError' "$L/red-render.log") load-errors=$(grep -cE 'Cannot find module|Failed to resolve|SyntaxError|TypeError|ReferenceError' "$L/red-render.log") failing: $(failing "$L/red-render.log" | tr '\n' '|')"
    ;;
  redm3)
    place real $TEST
    place red-m3 $TRAY
    stamp "red-m3: the final test file (real/) over fc78376's Tray.tsx with the review's M3 (red-m3/)"
    (cd "$W" && npm run typecheck:app > "$L/redm3-typecheck.log" 2>&1); stamp "red-m3 typecheck:app exit=$?"
    render $TRAY_TEST > "$L/redm3-render.log" 2>&1
    stamp "red-m3 Tray.render exit=$? $(vt "$L/redm3-render.log") assertion=$(grep -c '^AssertionError' "$L/redm3-render.log") load-errors=$(grep -cE 'Cannot find module|Failed to resolve|SyntaxError|TypeError|ReferenceError' "$L/redm3-render.log") failing: $(failing "$L/redm3-render.log" | tr '\n' '|')"
    place orig $TRAY
    ;;
  green)
    place real $TRAY $TEST $RECEIPT
    stamp "green: the final files (real/)"
    (cd "$W" && npm run typecheck:app > "$L/green-typecheck.log" 2>&1); stamp "green typecheck:app exit=$?"
    (cd "$A" && npm run test:unit -- $NODE_FILE > "$L/green-unit.log" 2>&1); stamp "green trayGesture.test.ts exit=$? $(counts "$L/green-unit.log")"
    render $TRAY_TEST > "$L/green-render.log" 2>&1; stamp "green Tray.render exit=$? $(vt "$L/green-render.log") stderr-blocks=$(grep -c '^stderr |' "$L/green-render.log")"
    render $CATALOGUE -t "bw-" > "$L/green-catalogue.log" 2>&1; stamp "green catalogue bw- exit=$? $(vt "$L/green-catalogue.log")"
    ;;
  probes)
    place real $TRAY $TEST
    probes_in
    render $PROBES > "$L/green-probes.log" 2>&1
    stamp "green probes exit=$? $(vt "$L/green-probes.log") failing: $(failing "$L/green-probes.log" | sed -E 's/:.*//' | tr '\n' ' ')"
    probes_out
    ;;
  model)
    # The confirming review's model: every valid sequence of 8 steps against its reference, on fc78376 and on the fix.
    cp "$K/probes/modelProbe.render.test.tsx" "$A/src/wallet/tray/"
    for side in orig real; do
      place $side $TRAY
      for n in 7 8; do
        (cd "$A" && MODEL_LENGTH=$n npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/tray/modelProbe.render.test.tsx > "$L/model$n-$side.log" 2>&1)
        stamp "model length $n on $side's Tray.tsx exit=$? $(grep -E '^MODEL: ' "$L/model$n-$side.log" | head -1)"
      done
    done
    rm -f "$A/src/wallet/tray/modelProbe.render.test.tsx"
    place real $TRAY
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
    [ "$(shasum -a 256 "$W/$INDEX" | cut -d' ' -f1)" = "$(/usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/tray-hardening show "fc78376:$INDEX" | shasum -a 256 | cut -d' ' -f1)" ] || bad=$((bad + 1))
    stamp "mutants: after both runs, $bad of the three files differ from real/ or fc78376"
    ;;
  gate)
    place real $TRAY $TEST $RECEIPT
    stamp "gate: start"
    (cd "$W" && npm run typecheck:app > "$L/gate-1-typecheck-app.log" 2>&1); stamp "gate typecheck:app exit=$?"
    (cd "$A" && npm run test:unit -- $NODE_FILE > "$L/gate-2-focused-unit.log" 2>&1); stamp "gate focused Node exit=$? $(counts "$L/gate-2-focused-unit.log")"
    render $TRAY_TEST > "$L/gate-3-focused-render.log" 2>&1; stamp "gate focused render exit=$? $(vt "$L/gate-3-focused-render.log")"
    render $CATALOGUE -t "bw-" > "$L/gate-3b-catalogue.log" 2>&1; stamp "gate catalogue bw- exit=$? $(vt "$L/gate-3b-catalogue.log")"
    (cd "$W" && npm run test:app > "$L/gate-4-test-app.log" 2>&1); stamp "gate test:app exit=$? $(counts "$L/gate-4-test-app.log")"
    (cd "$W" && npm run test:unit > "$L/gate-5-test-unit.log" 2>&1); stamp "gate test:unit exit=$? $(counts "$L/gate-5-test-unit.log")"
    # The scratch tree is not a repository, so each file is checked as git diff --check does: against fc78376's copy.
    : > "$L/gate-6-diff-check.log"
    for rel in $TRAY $TEST $RECEIPT; do GIT_CEILING_DIRECTORIES=$K /usr/bin/git diff --no-index --check "$K/orig/$rel" "$W/$rel" >> "$L/gate-6-diff-check.log" 2>&1; done
    stamp "gate whitespace check: $(wc -l < "$L/gate-6-diff-check.log" | tr -d ' ') lines of complaint"
    ;;
  *) echo "usage: prove.sh base|red|redm3|green|probes|model|mutants|gate"; exit 2 ;;
esac
