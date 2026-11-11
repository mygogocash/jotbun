#!/bin/bash
# The planner's proof of P2-T14, one stage at a time, on a scratch copy (W).
#   bash tools/prove.sh <stage>
# Stages, in order: reset, base, red, green, then the mutants
# (python3 -I tools/mutants.py W logs/mutant-logs > logs/mutants.out), then compat and gate.
#
# W was made with `git archive 6db889a | tar -x -C work`, then
# `npm ci --ignore-scripts --no-audit --no-fund` inside it (1416 packages).
# The integration head is b5aa2a7; `git diff --stat 6db889a b5aa2a7 -- apps/app
# packages package.json package-lock.json` prints nothing (1B-T11's apps/edge,
# its receipt and controller files only), so W's app is b5aa2a7's.
# P2-T14 starts after tray-hardening merges (the controller's ruling): `base`
# lays tray-hardening's three proven files (base/, checked against
# scratch/tray-hardening-planner/SHA256SUMS) over W, as that merge will.
set -u
K=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t14-planner
W=$K/work
L=$K/logs
A=$W/apps/app
INTEGRATION=/Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1a-vault-core
HEAD_SHA=b5aa2a7
mkdir -p "$L"
stamp() { echo "[$(date +%T) load $(sysctl -n vm.loadavg | tr -d '{}' | awk '{print $1}')] $*" | tee -a "$L/summary.txt"; }
counts() { grep -E '^ℹ (tests|pass|fail) ' "$1" | tr '\n' ' '; }
vt() { grep -E '^ +(Test Files|Tests) ' "$1" | tr -s ' ' | tr '\n' ' '; }
render() { (cd "$A" && npx vitest run --config vitest.render.config.ts --reporter=verbose "$@"); }
sha() { shasum -a 256 "$1" | cut -d' ' -f1; }

TESTS="apps/app/src/wallet/add/addFlow.test.ts apps/app/src/wallet/add/AmountStep.render.test.tsx apps/app/src/wallet/copy/draftText.test.ts"
DATA="apps/app/src/wallet/add/copy.ts"
STUBS="apps/app/src/wallet/add/addFlow.ts apps/app/src/wallet/add/WalletKeypad.tsx apps/app/src/wallet/add/TypeSwitchHeader.tsx apps/app/src/wallet/add/QuickChips.tsx apps/app/src/wallet/add/AmountStep.tsx"
CODE="$STUBS apps/app/src/dev/catalogue/wallet/addSections.tsx apps/app/src/dev/catalogue/wallet/index.ts"
BASE="apps/app/src/wallet/tray/Tray.tsx apps/app/src/wallet/tray/Tray.render.test.tsx apps/app/src/wallet/tray/trayGesture.test.ts"
INDEX=apps/app/src/dev/catalogue/wallet/index.ts
DRAFT_TEST=apps/app/src/wallet/copy/draftText.test.ts
NODE_NEW="src/wallet/add/addFlow.test.ts"
# P2-T3's check of every draft table, which reads add/copy.ts once it is there (ruling P3h).
NODE_SHARED="src/wallet/copy/draftText.test.ts"
RENDER_NEW="src/wallet/add/AmountStep.render.test.tsx"
# The render files that read the wallet's catalogue list (index.ts), which this task extends.
NEIGHBOURS="src/wallet/tray/Tray.render.test.tsx src/wallet/testing/walletHarness.render.test.tsx src/wallet/privacy/PrivateMode.render.test.tsx src/wallet/looks/WalletLooks.render.test.tsx"
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
  reset)
    # W back to the head's app with tray-hardening laid over: no add/, no addSections.tsx, the head's index.ts.
    rm -rf "$A/src/wallet/add" "$A/src/dev/catalogue/wallet/addSections.tsx"
    cp "$K/orig/$INDEX" "$W/$INDEX"
    cp "$K/orig/$DRAFT_TEST" "$W/$DRAFT_TEST"
    place base $BASE
    bad=0
    for rel in $INDEX $DRAFT_TEST; do [ "$(sha "$W/$rel")" = "$(/usr/bin/git -C "$INTEGRATION" show "$HEAD_SHA:$rel" | shasum -a 256 | cut -d' ' -f1)" ] || bad=$((bad + 1)); done
    for rel in $BASE; do [ "$(sha "$W/$rel")" = "$(grep " real/$rel\$" "$K/../tray-hardening-planner/SHA256SUMS" | cut -d' ' -f1)" ] || bad=$((bad + 1)); done
    stamp "reset: W is $HEAD_SHA's app with tray-hardening's three files; $bad files differ from what they should be"
    ;;
  base)
    stamp "base: start ($HEAD_SHA with tray-hardening laid over)"
    (cd "$W" && npm run typecheck:app > "$L/base-typecheck.log" 2>&1); stamp "base typecheck:app exit=$?"
    (cd "$A" && npm run test:unit -- $NODE_SHARED > "$L/base-draft.log" 2>&1); stamp "base draftText.test.ts exit=$? $(counts "$L/base-draft.log")"
    render $NEIGHBOURS > "$L/base-neighbours.log" 2>&1; stamp "base neighbours exit=$? $(vt "$L/base-neighbours.log")"
    catalogue base
    ;;
  red)
    place real $TESTS $DATA
    place stubs $STUBS
    stamp "red: placed the two tests, the draft check's exemption, copy.ts (data) and the five typed stubs; index.ts as at the head, no addSections.tsx"
    (cd "$W" && npm run typecheck:app > "$L/red-typecheck.log" 2>&1); stamp "red typecheck:app exit=$?"
    (cd "$A" && npm run test:unit -- $NODE_NEW > "$L/red-unit.log" 2>&1); stamp "red addFlow.test.ts exit=$? $(counts "$L/red-unit.log") assertion=$(grep -c 'AssertionError \[ERR_ASSERTION\]' "$L/red-unit.log")"
    (cd "$A" && npm run test:unit -- $NODE_SHARED > "$L/red-draft.log" 2>&1); stamp "red draftText.test.ts (passes by design: the copy and its exemption go in together) exit=$? $(counts "$L/red-draft.log")"
    render $RENDER_NEW > "$L/red-render.log" 2>&1
    stamp "red AmountStep.render exit=$? $(vt "$L/red-render.log") assertion=$(grep -c '^AssertionError' "$L/red-render.log") load-errors=$(grep -cE 'Cannot find module|Failed to resolve|SyntaxError|is not a function|TestingLibraryElementError' "$L/red-render.log")"
    ;;
  green)
    place real $CODE
    stamp "green: placed the add flow, the keypad, the switch, the chips, the step and footer, addSections.tsx and index.ts"
    (cd "$W" && npm run typecheck:app > "$L/green-typecheck.log" 2>&1); stamp "green typecheck:app exit=$?"
    (cd "$A" && npm run test:unit -- $NODE_NEW > "$L/green-unit.log" 2>&1); stamp "green addFlow.test.ts exit=$? $(counts "$L/green-unit.log")"
    (cd "$A" && npm run test:unit -- $NODE_SHARED > "$L/green-draft.log" 2>&1); stamp "green draftText.test.ts exit=$? $(counts "$L/green-draft.log")"
    render $RENDER_NEW > "$L/green-render.log" 2>&1; stamp "green AmountStep.render exit=$? $(vt "$L/green-render.log") stderr-blocks=$(grep -c '^stderr |' "$L/green-render.log")"
    render $NEIGHBOURS > "$L/green-neighbours.log" 2>&1; stamp "green neighbours exit=$? $(vt "$L/green-neighbours.log")"
    catalogue green
    ;;
  compat)
    # 1. Why P2-T14 starts after tray-hardening: the head's own tray case reads the tray's four sections last.
    cp "$W/apps/app/src/wallet/tray/Tray.render.test.tsx" "$L/.tray-test.keep"
    /usr/bin/git -C "$INTEGRATION" show "$HEAD_SHA:apps/app/src/wallet/tray/Tray.render.test.tsx" > "$W/apps/app/src/wallet/tray/Tray.render.test.tsx"
    render src/wallet/tray/Tray.render.test.tsx -t "catalogue's tray sections" > "$L/compat-head-tray-case.log" 2>&1
    stamp "compat: the head's tray catalogue case with this task's spread exit=$? $(vt "$L/compat-head-tray-case.log") (fails by design: tray-hardening's P11 rewrites it)"
    cp "$L/.tray-test.keep" "$W/apps/app/src/wallet/tray/Tray.render.test.tsx" && rm "$L/.tray-test.keep"
    render src/wallet/tray/Tray.render.test.tsx -t "catalogue's tray sections" > "$L/compat-final-tray-case.log" 2>&1
    stamp "compat: tray-hardening's tray catalogue case with this task's spread exit=$? $(vt "$L/compat-final-tray-case.log") tray test sha256 $( [ "$(sha "$W/apps/app/src/wallet/tray/Tray.render.test.tsx")" = "$(sha "$K/base/apps/app/src/wallet/tray/Tray.render.test.tsx")" ] && echo equal || echo DIFFERS)"
    # 2. This task's own files against the head's tray (before tray-hardening): they rely only on header, footer and title.
    for rel in apps/app/src/wallet/tray/Tray.tsx; do /usr/bin/git -C "$INTEGRATION" show "$HEAD_SHA:$rel" > "$W/$rel"; done
    (cd "$W" && npm run typecheck:app > "$L/compat-head-tray-typecheck.log" 2>&1); stamp "compat: typecheck:app with the head's Tray.tsx exit=$?"
    render $RENDER_NEW > "$L/compat-head-tray-render.log" 2>&1; stamp "compat: AmountStep.render with the head's Tray.tsx exit=$? $(vt "$L/compat-head-tray-render.log")"
    place base apps/app/src/wallet/tray/Tray.tsx
    stamp "compat: Tray.tsx put back $( [ "$(sha "$W/apps/app/src/wallet/tray/Tray.tsx")" = "$(sha "$K/base/apps/app/src/wallet/tray/Tray.tsx")" ] && echo equal || echo DIFFERS)"
    # 3. Why draftText.test.ts changes: the head's check meets add.chip's Thai line, which is only placeholders (the plan's).
    cp "$K/orig/$DRAFT_TEST" "$W/$DRAFT_TEST"
    (cd "$A" && npm run test:unit -- $NODE_SHARED > "$L/compat-head-draft.log" 2>&1); stamp "compat: the head's draftText.test.ts with add/copy.ts exit=$? $(counts "$L/compat-head-draft.log") (fails by design: add.chip)"
    place real $DRAFT_TEST
    stamp "compat: draftText.test.ts put back $( [ "$(sha "$W/$DRAFT_TEST")" = "$(sha "$K/real/$DRAFT_TEST")" ] && echo equal || echo DIFFERS)"
    # 4. index.ts beside a P2-T12 spread after the kit's (its own anchor), merged in both orders.
    T=$L/merge && mkdir -p "$T"
    cp "$K/orig/$INDEX" "$T/base.ts"; cp "$K/real/$INDEX" "$T/p2-t14.ts"
    python3 -I -c "
import sys
text = open(sys.argv[1]).read()
text = text.replace(\"import { WALLET_KIT_SECTIONS } from './kitSections';\n\", \"import { WALLET_KIT_SECTIONS } from './kitSections';\nimport { WALLET_STACK_SECTIONS } from './stackSections';\n\")
text = text.replace('  ...WALLET_KIT_SECTIONS,\n', '  ...WALLET_KIT_SECTIONS,\n  ...WALLET_STACK_SECTIONS,\n')
open(sys.argv[2], 'w').write(text)" "$T/base.ts" "$T/p2-t12.ts"
    cp "$T/p2-t12.ts" "$T/first-p2-t12.ts"; /usr/bin/git merge-file -p "$T/first-p2-t12.ts" "$T/base.ts" "$T/p2-t14.ts" > "$T/merged-1.ts" 2> "$T/merge-1.err"; one=$?
    cp "$T/p2-t14.ts" "$T/first-p2-t14.ts"; /usr/bin/git merge-file -p "$T/first-p2-t14.ts" "$T/base.ts" "$T/p2-t12.ts" > "$T/merged-2.ts" 2> "$T/merge-2.err"; two=$?
    stamp "compat: index.ts with a P2-T12 spread after the kit's: merge-file conflicts $one and $two (0 is clean); both orders give the same file: $(cmp -s "$T/merged-1.ts" "$T/merged-2.ts" && echo yes || echo no)"
    ;;
  gate)
    stamp "gate: start"
    (cd "$W" && npm run typecheck:app > "$L/gate-1-typecheck-app.log" 2>&1); stamp "gate typecheck:app exit=$?"
    (cd "$W" && npm run test:app > "$L/gate-2-test-app.log" 2>&1); stamp "gate test:app exit=$? $(counts "$L/gate-2-test-app.log")"
    (cd "$W" && npm run test:unit > "$L/gate-3-test-unit.log" 2>&1); stamp "gate test:unit exit=$? $(counts "$L/gate-3-test-unit.log")"
    (cd "$A" && npm run test:unit -- $NODE_NEW $NODE_SHARED > "$L/gate-4-focused-unit.log" 2>&1); stamp "gate focused Node exit=$? $(counts "$L/gate-4-focused-unit.log")"
    render $RENDER_NEW $NEIGHBOURS > "$L/gate-5-focused-render.log" 2>&1; stamp "gate focused render exit=$? $(vt "$L/gate-5-focused-render.log")"
    # The scratch copy is not a repository, so each file is checked as git diff --check does: against the head's copy, or against nothing when new.
    : > "$L/gate-6-diff-check.log"
    for rel in $CODE $TESTS $DATA; do
      if [ -f "$K/orig/$rel" ]; then /usr/bin/git diff --no-index --check "$K/orig/$rel" "$W/$rel" >> "$L/gate-6-diff-check.log" 2>&1
      else /usr/bin/git diff --no-index --check /dev/null "$W/$rel" >> "$L/gate-6-diff-check.log" 2>&1; fi
    done
    stamp "gate whitespace check: $(wc -l < "$L/gate-6-diff-check.log" | tr -d ' ') lines of complaint"
    ;;
  *) echo "usage: prove.sh reset|base|red|green|compat|gate"; exit 2 ;;
esac
