#!/bin/bash
# Rehearses the brief's Steps 2 to 8, typed as written, in a throwaway git copy of fc78376's tree
# (rehearsal/wt: `git archive fc78376` committed once as a stand-in, node_modules symlinked from the task
# worktree), with rehearsal/S as the fixer's scratch folder. Step 1 needs the real branch and remote, so only
# its first check runs (the stand-in's HEAD is not fc78376 by name). Step 8's last check reads the stand-in's
# commit instead of origin/claude/p1a-vault-core. Writes logs/rehearsal.txt; deletes rehearsal/ at the end.
set -u
K=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/tray-hardening-fix2-planner
TASK_WT=/Users/kunanonjarat/Developer/jotbun/.claude/worktrees/tray-hardening
WT=$K/rehearsal/wt
S=$K/rehearsal/S
PL=$K
OUT=$K/logs/rehearsal.txt
# Every git call below stays inside the throwaway copy: never the main checkout above the kit.
export GIT_CEILING_DIRECTORIES=$K/rehearsal
held=0; missed=0
say() { echo "$*" >> "$OUT"; }
expect() { # expect <label> <wanted> <got>
  if [ "$2" = "$3" ]; then held=$((held + 1)); say "  OK   $1: $3"; else missed=$((missed + 1)); say "  MISS $1: wanted [$2], got [$3]"; fi
}
: > "$OUT"
rm -rf "$K/rehearsal"; mkdir -p "$WT"
/usr/bin/git -C "$TASK_WT" archive fc78376 | tar -x -C "$WT"
/usr/bin/git -C "$WT" init -q
[ "$(/usr/bin/git -C "$WT" rev-parse --show-toplevel)" = "$WT" ] || { echo "the rehearsal is not its own repository; stopping"; exit 2; }
ln -s "$TASK_WT/node_modules" "$WT/node_modules"
mkdir -p "$WT/apps/app/node_modules" && ln -s "$TASK_WT/apps/app/node_modules/@better-auth" "$WT/apps/app/node_modules/@better-auth"
echo '/node_modules' >> "$WT/.git/info/exclude"
/usr/bin/git -C "$WT" config user.name rehearsal
/usr/bin/git -C "$WT" config user.email rehearsal@localhost
/usr/bin/git -C "$WT" add -A
/usr/bin/git -C "$WT" commit -q -m "fc78376's tree (a stand-in)"
say "rehearsal of briefs/tray-hardening-fix2.md, $(date '+%F %T'), WT=$WT, S=$S"

say "Step 1.1 (the rest of Step 1 needs the real branch and remote)"
expect "status --short" "" "$(/usr/bin/git -C "$WT" status --short)"
mkdir -p "$S"

say "Step 2"
(cd "$WT" && shasum -a 256 -c "$PL/SHA256SUMS.base" > "$S/base-check.txt" 2>&1); expect "2.1 exit" 0 $?
expect "2.1 OK lines" 3 "$(grep -c ': OK$' "$S/base-check.txt")"
(cd "$WT/apps/app" && npm run test:unit -- src/wallet/tray/trayGesture.test.ts > "$S/base-unit.log" 2>&1); expect "2.2 exit" 0 $?
expect "2.2 counts" "ℹ tests 4|ℹ pass 4|ℹ fail 0" "$(grep -E '^ℹ (tests|pass|fail) ' "$S/base-unit.log" | paste -sd'|' -)"
(cd "$WT/apps/app" && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/tray/Tray.render.test.tsx > "$S/base-render.log" 2>&1); expect "2.3 exit" 0 $?
expect "2.3 Tests" "      Tests  26 passed (26)" "$(grep -E '^ +Tests ' "$S/base-render.log")"

say "Step 3"
cp "$PL/real/apps/app/src/wallet/tray/Tray.render.test.tsx" "$WT/apps/app/src/wallet/tray/Tray.render.test.tsx"
expect "3.2 status" " M apps/app/src/wallet/tray/Tray.render.test.tsx" "$(/usr/bin/git -C "$WT" status --short --untracked-files=all)"
(cd "$WT" && shasum -a 256 -c "$PL/SHA256SUMS.red" > "$S/red-check.txt" 2>&1); expect "3.3 exit" 0 $?
(cd "$WT" && npm run typecheck:app > "$S/red-typecheck.log" 2>&1); expect "3.4 exit" 0 $?
(cd "$WT/apps/app" && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/tray/Tray.render.test.tsx > "$S/red-render.log" 2>&1); expect "3.5 exit" 1 $?
expect "3.5 Tests" "      Tests  1 failed | 27 passed (28)" "$(grep -E '^ +Tests ' "$S/red-render.log")"
expect "3.5 failing" " × src/wallet/tray/Tray.render.test.tsx > on iOS a dismissal that ends in the commit that hides the tray again says nothing; the next one says it closed" "$(grep '×' "$S/red-render.log" | sed -E 's/ [0-9]+ms$//')"
expect "3.5 assertion" 'AssertionError: the earlier end, in the commit that hides the Modal again: expected "vi.fn()" to not be called at all, but actually been called 1 times' "$(grep '^AssertionError' "$S/red-render.log")"
expect "3.5 load errors" 0 "$(grep -cE 'Cannot find module|Failed to resolve|SyntaxError|TypeError|ReferenceError' "$S/red-render.log")"
cp "$PL/red-m3/apps/app/src/wallet/tray/Tray.tsx" "$WT/apps/app/src/wallet/tray/Tray.tsx"
(cd "$WT" && shasum -a 256 -c "$PL/SHA256SUMS.redm3" > "$S/redm3-check.txt" 2>&1); expect "3.6 exit" 0 $?
(cd "$WT" && npm run typecheck:app > "$S/redm3-typecheck.log" 2>&1); expect "3.7 exit" 0 $?
(cd "$WT/apps/app" && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/tray/Tray.render.test.tsx > "$S/redm3-render.log" 2>&1); expect "3.8 exit" 1 $?
expect "3.8 Tests" "      Tests  2 failed | 26 passed (28)" "$(grep -E '^ +Tests ' "$S/redm3-render.log")"
expect "3.8 failing" " × src/wallet/tray/Tray.render.test.tsx > on iOS a dismissal that ends in the commit that hides the tray again says nothing; the next one says it closed| × src/wallet/tray/Tray.render.test.tsx > on iOS an onClosed given while the dismissal is under way is the one called" "$(grep '×' "$S/redm3-render.log" | sed -E 's/ [0-9]+ms$//' | paste -sd'|' -)"
expect "3.8 assertions" 'AssertionError: the earlier end, in the commit that hides the Modal again: expected "vi.fn()" to not be called at all, but actually been called 1 times|AssertionError: calls: the onClosed given first, the one given last: expected [ 1, +0 ] to deeply equal [ +0, 1 ]' "$(grep '^AssertionError' "$S/redm3-render.log" | paste -sd'|' -)"
expect "3.8 load errors" 0 "$(grep -cE 'Cannot find module|Failed to resolve|SyntaxError|TypeError|ReferenceError' "$S/redm3-render.log")"

say "Step 4"
cp "$PL/real/apps/app/src/wallet/tray/Tray.tsx" "$WT/apps/app/src/wallet/tray/Tray.tsx"
(cd "$WT" && shasum -a 256 -c "$PL/SHA256SUMS.green" > "$S/green-check.txt" 2>&1); expect "4.1 exit" 0 $?
(cd "$WT" && npm run typecheck:app > "$S/green-typecheck.log" 2>&1); expect "4.2 exit" 0 $?
(cd "$WT/apps/app" && npm run test:unit -- src/wallet/tray/trayGesture.test.ts > "$S/green-unit.log" 2>&1); expect "4.3 exit" 0 $?
expect "4.3 counts" "ℹ tests 4|ℹ pass 4|ℹ fail 0" "$(grep -E '^ℹ (tests|pass|fail) ' "$S/green-unit.log" | paste -sd'|' -)"
(cd "$WT/apps/app" && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/tray/Tray.render.test.tsx > "$S/green-render.log" 2>&1); expect "4.4 exit" 0 $?
expect "4.4 Tests" "      Tests  28 passed (28)" "$(grep -E '^ +Tests ' "$S/green-render.log")"
expect "4.4 stderr" 0 "$(grep -c '^stderr |' "$S/green-render.log")"
(cd "$WT/apps/app" && npx vitest run --config vitest.render.config.ts src/dev/catalogue/CatalogueScreen.render.test.tsx src/dev/catalogue/screenReader.render.test.tsx -t "bw-" > "$S/green-catalogue.log" 2>&1); expect "4.5 exit" 0 $?
expect "4.5 files" " Test Files  2 passed (2)" "$(grep -E '^ +Test Files ' "$S/green-catalogue.log")"
expect "4.5 Tests starts" "      Tests  18 passed" "$(grep -E '^ +Tests ' "$S/green-catalogue.log" | cut -c1-22)"

say "Step 5"
python3 -I "$PL/tools/mutants.py" "$WT" --check > "$S/mutants-check.out" 2>&1; expect "5 check exit" 0 $?
expect "5 check APPLIES" 45 "$(grep -c ' APPLIES: ' "$S/mutants-check.out")"
MUTANT_LOGS=$S/mutant-logs python3 -I "$PL/tools/mutants.py" "$WT" > "$S/mutants.out" 2> "$S/mutants.err"; expect "5 exit" 0 $?
expect "5 KILLED" 45 "$(grep -c ' KILLED: ' "$S/mutants.out")"
expect "5 restored" 45 "$(grep -c 'restored=True' "$S/mutants.out")"
expect "5 diff" "" "$(diff "$S/mutants.out" "$PL/logs/mutants.out")"
expect "5 status" " M apps/app/src/wallet/tray/Tray.render.test.tsx| M apps/app/src/wallet/tray/Tray.tsx" "$(/usr/bin/git -C "$WT" status --short --untracked-files=all | paste -sd'|' -)"
(cd "$WT" && shasum -a 256 -c "$PL/SHA256SUMS.green" > /dev/null 2>&1); expect "5 green sums" 0 $?

say "Step 6"
(cd "$WT" && npm run typecheck:app > "$S/gate-typecheck.log" 2>&1); expect "6.1 exit" 0 $?
(cd "$WT/apps/app" && npm run test:unit -- src/wallet/tray/trayGesture.test.ts > "$S/gate-unit.log" 2>&1); expect "6.2 Node exit" 0 $?
(cd "$WT/apps/app" && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/tray/Tray.render.test.tsx > "$S/gate-render.log" 2>&1); expect "6.2 render exit" 0 $?
expect "6.2 render Tests" "      Tests  28 passed (28)" "$(grep -E '^ +Tests ' "$S/gate-render.log")"
(cd "$WT/apps/app" && npx vitest run --config vitest.render.config.ts src/dev/catalogue/CatalogueScreen.render.test.tsx src/dev/catalogue/screenReader.render.test.tsx -t "bw-" > "$S/gate-catalogue.log" 2>&1); expect "6.2 catalogue exit" 0 $?
(cd "$WT" && npm run test:app > "$S/test-app.log" 2>&1); expect "6.3 exit" 0 $?
expect "6.3 fail" "ℹ fail 0" "$(grep -E '^ℹ fail ' "$S/test-app.log")"
(cd "$WT" && npm run test:unit > "$S/test-unit.log" 2>&1); expect "6.4 exit" 0 $?
expect "6.4 fail" "ℹ fail 0" "$(grep -E '^ℹ fail ' "$S/test-unit.log")"
expect "6.5 diff --check" "" "$(/usr/bin/git -C "$WT" diff --check 2>&1)"

say "Step 7"
cp "$PL/real/docs/implementation/receipts/tray-hardening.md" "$WT/docs/implementation/receipts/tray-hardening.md"
(cd "$WT" && shasum -a 256 -c "$PL/SHA256SUMS.real" > "$S/real-check.txt" 2>&1); expect "7.2 exit" 0 $?
expect "7.3 one Deviations line to edit" 1 "$(grep -c '^- \*\*Deviations:\*\* none\.$' "$WT/docs/implementation/receipts/tray-hardening.md")"

say "Step 8"
/usr/bin/git -C "$WT" add apps/app/src/wallet/tray/Tray.tsx apps/app/src/wallet/tray/Tray.render.test.tsx docs/implementation/receipts/tray-hardening.md
expect "8.2 status" "M  apps/app/src/wallet/tray/Tray.render.test.tsx|M  apps/app/src/wallet/tray/Tray.tsx|M  docs/implementation/receipts/tray-hardening.md" "$(/usr/bin/git -C "$WT" status --short | paste -sd'|' -)"
expect "8.3 diff --cached --check" "" "$(/usr/bin/git -C "$WT" diff --cached --check 2>&1)"
cp "$PL/tools/commit-message.txt" "$S/commit-message.txt"
/usr/bin/git -C "$WT" commit -q -F "$S/commit-message.txt"; expect "8.4 commit exit" 0 $?
expect "8.5 diff --check (stand-in base)" "" "$(/usr/bin/git -C "$WT" diff --check HEAD~1...HEAD 2>&1)"
expect "8.5 trailer" "Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>" "$(/usr/bin/git -C "$WT" log -1 --format=%B | grep '^Co-Authored-By:')"
expect "8.5 files" "apps/app/src/wallet/tray/Tray.render.test.tsx|apps/app/src/wallet/tray/Tray.tsx|docs/implementation/receipts/tray-hardening.md" "$(/usr/bin/git -C "$WT" show --name-only --format= HEAD | paste -sd'|' -)"

say "$held expectations held, $missed missed"
rm -rf "$K/rehearsal"
say "rehearsal/ deleted"
echo "$held held, $missed missed"
[ "$missed" = 0 ]
