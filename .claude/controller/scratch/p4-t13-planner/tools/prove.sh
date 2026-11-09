#!/bin/bash
# P4-T13 planner proof: RED on typed stubs, then GREEN, in the scratch tree work/ (the head's code
# plus `npm ci`). Usage: bash prove.sh <planner folder> <log dir>. Each stage's log and exit code
# go to <log dir>; summary.txt lists them. The tree ends in the GREEN state.
set -u
PL="$1"; LOGS="$2"
W="$PL/work"; APP="$W/apps/app"; SLIPS="$APP/src/slips"
TESTS="src/slips/photoLibrary.test.ts src/slips/imageShrink.test.ts src/slips/slipBatches.test.ts"
CODE="photoLibrary.ts imageShrink.ts slipBatches.ts testing/fakePhotos.ts"
mkdir -p "$LOGS/red" "$LOGS/green"
SUMMARY="$LOGS/summary.txt"
note() { echo "$(date '+%H:%M:%S') $*" >> "$SUMMARY"; }

# A clean start: none of the seven paths exists at the head.
for f in $CODE photoLibrary.test.ts imageShrink.test.ts slipBatches.test.ts; do rm -f "$SLIPS/$f"; done
mkdir -p "$SLIPS/testing"

# RED: the final tests over the typed stubs.
for t in photoLibrary.test.ts imageShrink.test.ts slipBatches.test.ts; do cp "$PL/real/apps/app/src/slips/$t" "$SLIPS/$t"; done
for f in $CODE; do cp "$PL/stubs/apps/app/src/slips/$f" "$SLIPS/$f"; done
(cd "$W" && npm run typecheck:app > "$LOGS/red/typecheck-app.log" 2>&1); note "red typecheck:app exit=$?"
(cd "$APP" && node scripts/test-unit.mjs $TESTS > "$LOGS/red/red-unit.log" 2>&1); note "red focused exit=$? $(grep -E '^ℹ (tests|pass|fail) ' "$LOGS/red/red-unit.log" | tr '\n' ' ')"
note "red assertion failures=$(grep -c "code: 'ERR_ASSERTION'" "$LOGS/red/red-unit.log") missing modules=$(grep -c -e ERR_MODULE_NOT_FOUND -e 'Cannot find module' "$LOGS/red/red-unit.log") other errors=$(grep -c -e TypeError -e RangeError -e ReferenceError -e SyntaxError "$LOGS/red/red-unit.log")"

# GREEN: the final code over the stubs.
for f in $CODE; do cp "$PL/real/apps/app/src/slips/$f" "$SLIPS/$f"; done
(cd "$W" && npm run typecheck:app > "$LOGS/green/typecheck-app.log" 2>&1); note "green typecheck:app exit=$?"
(cd "$APP" && node scripts/test-unit.mjs $TESTS > "$LOGS/green/green-unit.log" 2>&1); note "green focused exit=$? $(grep -E '^ℹ (tests|pass|fail) ' "$LOGS/green/green-unit.log" | tr '\n' ' ')"
for t in $TESTS; do
  name=$(basename "$t" .test.ts)
  (cd "$APP" && node scripts/test-unit.mjs "$t" > "$LOGS/green/green-$name.log" 2>&1); note "green $name exit=$? $(grep -E '^ℹ (tests|pass|fail) ' "$LOGS/green/green-$name.log" | tr '\n' ' ')"
done

# The tree holds exactly the kit's final files.
for f in $CODE photoLibrary.test.ts imageShrink.test.ts slipBatches.test.ts; do
  cmp -s "$PL/real/apps/app/src/slips/$f" "$SLIPS/$f" && note "same as real: $f" || note "DIFFERS from real: $f"
done
