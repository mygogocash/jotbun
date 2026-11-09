#!/bin/bash
# Measure whole-suite totals at a worktree's head, so a dispatch note can give exact Expected lines
# (the head's measured total plus the brief's delta) instead of hand-adjusted guesses.
# Usage: bash baseline.sh <worktree> [app|edge|all] [--exports]
#   app:  test:app, test:unit and the full render suite; --exports adds export:web and the iOS export.
#   edge: test:edge, and test:edge:workers under the heavy lock.
# Installs node_modules first if missing (npm ci; edge work also npm run install:edge). Writes
# .claude/controller/scratch/baseline-<sha>/summary.txt and prints it. Leaves the worktree as it found it.
set -u
WT=${1:?worktree}; what=${2:-app}; ex=${3:-}
cd "$WT" || exit 1
sha=$(/usr/bin/git rev-parse --short HEAD)
B=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/baseline-$sha; mkdir -p "$B"
S=$B/summary.txt; echo "baseline at $sha ($what${ex:+ $ex}) from $(date +%T)" > "$S"
tot() { grep -hE "$2" "$1" | tr -s ' ' | tr '\n' ' '; }
[ -d node_modules ] || { npm ci --ignore-scripts --no-audit --no-fund > "$B/npm-ci.log" 2>&1; echo "npm ci exit=$?" >> "$S"; }
if [ "$what" = app ] || [ "$what" = all ]; then
  npm run test:app > "$B/test-app.log" 2>&1; echo "test:app exit=$? $(tot "$B/test-app.log" '^ℹ (tests|pass|fail) ')" >> "$S"
  npm run test:unit > "$B/test-unit.log" 2>&1; echo "test:unit exit=$? $(tot "$B/test-unit.log" '^ℹ (tests|pass|fail) ')" >> "$S"
  npm run test:render -w gogospend-app > "$B/render.log" 2>&1; echo "render exit=$? $(tot "$B/render.log" 'Test Files |Tests  ')" >> "$S"
  if [ "$ex" = --exports ]; then
    npm run export:web -w gogospend-app -- --max-workers 2 > "$B/export-web.log" 2>&1; echo "export:web exit=$? $(grep -oE '\([0-9]+ modules\)' "$B/export-web.log" | head -1)" >> "$S"
    (cd apps/app && CI=1 npx expo export --platform ios --max-workers 2 --output-dir "$B/ios-dist" > "$B/export-ios.log" 2>&1); echo "export:ios exit=$? $(grep -oE '\([0-9]+ modules\)' "$B/export-ios.log" | head -1)" >> "$S"
    rm -rf apps/app/dist "$B/ios-dist"
  fi
fi
if [ "$what" = edge ] || [ "$what" = all ]; then
  [ -d apps/edge/node_modules ] || { npm run install:edge > "$B/install-edge.log" 2>&1; echo "install:edge exit=$?" >> "$S"; }
  npm run test:edge > "$B/test-edge.log" 2>&1; echo "test:edge exit=$? $(tot "$B/test-edge.log" 'Test Files |Tests  ')" >> "$S"
  until mkdir /private/tmp/claude-501/jotbun-heavy.lock 2>/dev/null; do sleep 20; done
  npm run test:edge:workers > "$B/workers.log" 2>&1; rc=$?
  rmdir /private/tmp/claude-501/jotbun-heavy.lock
  echo "workers exit=$rc $(tot "$B/workers.log" 'Test Files |Tests  ')" >> "$S"
fi
echo "git status: [$(/usr/bin/git status --short | head -3 | tr '\n' ' ')] end $(date +%T)" >> "$S"
cat "$S"
