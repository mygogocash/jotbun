#!/bin/bash
# Rehearses the fix brief's Steps 1.3 to 7, typed as written, in a throwaway git
# copy of the merge's tree (WT below: `git archive d1111f8` with 784667b's four
# files laid over it, committed once), with its own scratch folder (S below),
# then deletes both. Steps 1.1 and 1.2 need the real branch and remote. Step 6's
# two receipt edits are made by a script (exact text, each found once), and
# Step 7.5 checks against the copy's first commit, since the copy has no
# origin. Every command and its output go to logs/rehearsal.txt.
set -u
PL=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/tray-hardening-fix-planner
INTEGRATION=/Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1a-vault-core
WT=$PL/rehearsal-tree
S=$PL/rehearsal-scratch
OUT=$PL/logs/rehearsal.txt
APP=$WT/apps/app
NODE_FILE=src/wallet/tray/trayGesture.test.ts
RENDER_FILE=src/wallet/tray/Tray.render.test.tsx
VT="npx vitest run --config vitest.render.config.ts --reporter=verbose"
CATALOGUE="npx vitest run --config vitest.render.config.ts src/dev/catalogue/CatalogueScreen.render.test.tsx src/dev/catalogue/screenReader.render.test.tsx -t bw-"
RECEIPT=docs/implementation/receipts/tray-hardening.md
: > "$OUT"
say() { printf '%s\n' "$*" | tee -a "$OUT"; }
run() { say "\$ $*"; (eval "$@") >> "$OUT" 2>&1; say "-> exit=$?"; }

rm -rf "$WT" "$S"
mkdir -p "$WT"
/usr/bin/git -C "$INTEGRATION" archive d1111f8 | tar -x -C "$WT"
for f in apps/app/src/wallet/tray/Tray.tsx apps/app/src/wallet/tray/Tray.render.test.tsx apps/app/src/wallet/tray/trayGesture.test.ts "$RECEIPT"; do
  /usr/bin/git -C "$INTEGRATION" show "784667b:$f" > "$WT/$f"
done
/usr/bin/git -C "$WT" init -q
/usr/bin/git -C "$WT" add -A
/usr/bin/git -C "$WT" -c user.name=rehearsal -c user.email=rehearsal@example.invalid commit -q -m "784667b merged with d1111f8 (the merge's tree)"
say "== the copy: $(/usr/bin/git -C "$WT" log --oneline -1)"

say "== Step 1 (from 1.3)"
run "mkdir -p $S"
run "cd $WT && shasum -a 256 -c $PL/SHA256SUMS.base"
run "cd $WT && npm ci --ignore-scripts --no-audit --no-fund > $S/npm-ci.log 2>&1"
run "cd $APP && npm run test:unit -- $NODE_FILE > $S/base-unit.log 2>&1"
run "grep -E '^ℹ (tests|pass|fail) ' $S/base-unit.log"
run "cd $APP && $VT $RENDER_FILE > $S/base-render.log 2>&1"
run "grep -E '^ +Tests ' $S/base-render.log"

say "== Step 2"
run "cp $PL/real/apps/app/src/wallet/tray/Tray.render.test.tsx $WT/apps/app/src/wallet/tray/Tray.render.test.tsx"
run "/usr/bin/git -C $WT status --short --untracked-files=all"
run "cd $WT && shasum -a 256 -c $PL/SHA256SUMS.red"
run "cd $WT && npm run typecheck:app > $S/red-typecheck.log 2>&1"
run "cd $APP && $VT $RENDER_FILE > $S/red-render.log 2>&1"
run "grep -E '^ +Tests ' $S/red-render.log"
run "grep '×' $S/red-render.log"
run "grep '^AssertionError' $S/red-render.log"
run "grep -cE 'Cannot find module|Failed to resolve|SyntaxError|TypeError|ReferenceError' $S/red-render.log"

say "== Step 3"
run "cp $PL/real/apps/app/src/wallet/tray/Tray.tsx $WT/apps/app/src/wallet/tray/Tray.tsx"
run "cd $WT && shasum -a 256 -c $PL/SHA256SUMS.real"
run "cd $WT && npm run typecheck:app > $S/green-typecheck.log 2>&1"
run "cd $APP && npm run test:unit -- $NODE_FILE > $S/green-unit.log 2>&1"
run "grep -E '^ℹ (tests|pass|fail) ' $S/green-unit.log"
run "cd $APP && $VT $RENDER_FILE > $S/green-render.log 2>&1"
run "grep -E '^ +Tests ' $S/green-render.log"
run "grep -c '^stderr |' $S/green-render.log"
run "cd $APP && $CATALOGUE > $S/green-catalogue.log 2>&1"
run "grep -E '^ +(Test Files|Tests) ' $S/green-catalogue.log"

say "== Step 4"
run "python3 -I $PL/tools/mutants.py $WT --check | grep -c ' APPLIES: '"
run "MUTANT_LOGS=$S/mutant-logs python3 -I $PL/tools/mutants.py $WT > $S/mutants.out 2> $S/mutants.err"
run "grep -c ' KILLED: ' $S/mutants.out"
run "grep -c 'restored=True' $S/mutants.out"
run "diff $S/mutants.out $PL/logs/mutants.out"
run "/usr/bin/git -C $WT status --short --untracked-files=all"
run "cd $WT && shasum -a 256 -c $PL/SHA256SUMS.real"

say "== Step 5"
run "cd $WT && npm run typecheck:app > $S/gate-typecheck.log 2>&1"
run "cd $APP && npm run test:unit -- $NODE_FILE > $S/gate-unit.log 2>&1"
run "grep -E '^ℹ (tests|pass|fail) ' $S/gate-unit.log"
run "cd $APP && $VT $RENDER_FILE > $S/gate-render.log 2>&1"
run "grep -E '^ +Tests ' $S/gate-render.log"
run "cd $APP && $CATALOGUE > $S/gate-catalogue.log 2>&1"
run "grep -E '^ +Tests ' $S/gate-catalogue.log"
run "cd $WT && npm run test:app > $S/test-app.log 2>&1"
run "grep -E '^ℹ fail ' $S/test-app.log"
run "cd $WT && npm run test:unit > $S/test-unit.log 2>&1"
run "grep -E '^ℹ fail ' $S/test-unit.log"
run "/usr/bin/git -C $WT diff --check"

say "== Step 6 (the two receipt edits, by script)"
python3 -I - "$WT/$RECEIPT" "$PL/tools/receipt-section.md" >> "$OUT" 2>&1 <<'EOF'
import sys
path, section_path = sys.argv[1], sys.argv[2]
text = open(path, encoding='utf-8').read()
old = "    - On iOS, `onClosed` comes from the Modal's `onDismiss` only while the Modal is hidden (`showing`, refreshed with `closed`), so a dismissal that ends after the tray was shown again says nothing, even during a second exit (m2). `shown` is not held until `onDismiss` (planner ruling P4).\n"
new = "    - On iOS, `onClosed` comes from the Modal's `onDismiss` only while the Modal is hidden (the render's `shown`, since the fix round below), so a dismissal that ends after the tray was shown again says nothing, even during a second exit or in the very commit that reopens it (m2). `shown` is not held until `onDismiss` (planner ruling P4).\n"
print(f'the m2 line found {text.count(old)} time(s)')
text = text.replace(old, new)
section = open(section_path, encoding='utf-8').read()
text = text.rstrip('\n') + '\n\n' + section
open(path, 'w', encoding='utf-8').write(text)
print('section appended')
EOF
say "-> exit=$?"

say "== Step 7"
run "/usr/bin/git -C $WT add apps/app/src/wallet/tray/Tray.tsx apps/app/src/wallet/tray/Tray.render.test.tsx $RECEIPT"
run "/usr/bin/git -C $WT status --short"
run "/usr/bin/git -C $WT diff --cached --check"
run "cp $PL/tools/commit-message.txt $S/commit-message.txt"
run "/usr/bin/git -C $WT -c user.name=rehearsal -c user.email=rehearsal@example.invalid commit -q -F $S/commit-message.txt"
run "/usr/bin/git -C $WT diff --check HEAD~1...HEAD"
run "/usr/bin/git -C $WT show --stat --format=%s HEAD"

rm -rf "$WT" "$S"
say "== the copy and its scratch folder are deleted"
