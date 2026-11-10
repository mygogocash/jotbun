#!/bin/bash
# Runs the brief's Steps 0.2 to 7 as written, with WT a throwaway git copy of
# 8194e7f and S its scratch folder, both under R (deleted afterwards by the
# caller). Step 0.1 needs the real remote: the copy's base commit stands in for
# it, under a local branch named origin/claude/p1a-vault-core so Step 7.5's range
# resolves. The receipt is a stand-in; the commit uses a throwaway identity.
#   bash tools/rehearse.sh <R>
set -u
PL=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/wallet-looks-unstored-planner
R=$1
WT=$R/wt
S=$R/S
LOG=$PL/logs/rehearsal.txt
G=/usr/bin/git
: > "$LOG"
say() { echo "== $*" >> "$LOG"; }
out() { cat "$@" >> "$LOG"; }

say "setup: git archive 8194e7f, npm ci, a base commit"
mkdir -p "$WT"
$G -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1a-vault-core archive 8194e7f2a2add7ea2ee9dbc93e9b1023e3a169b0 | tar -x -C "$WT"
(cd "$WT" && npm ci --ignore-scripts --no-audit --no-fund > /dev/null 2>&1); echo "npm ci exit=$?" >> "$LOG"
$G -C "$WT" init -q
$G -C "$WT" add -A
$G -C "$WT" -c user.name=rehearsal -c user.email=rehearsal@example.invalid commit -q -m base
$G -C "$WT" branch origin/claude/p1a-vault-core

say "0.2"
mkdir -p "$S"
(cd "$WT" && shasum -a 256 -c "$PL/SHA256SUMS.base" > "$S/base-check.txt" 2>&1; echo "exit=$?") >> "$LOG"; out "$S/base-check.txt"
say "0.4"
(cd "$WT/apps/app" && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/looks/WalletLooks.render.test.tsx > "$S/base-render.log" 2>&1; echo "exit=$?") >> "$LOG"
grep -E "^ +Tests " "$S/base-render.log" >> "$LOG"

say "1.1"
cp "$PL/real/apps/app/src/wallet/looks/WalletLooks.render.test.tsx" "$WT/apps/app/src/wallet/looks/WalletLooks.render.test.tsx"
say "1.2"
$G -C "$WT" status --short --untracked-files=all >> "$LOG"
say "1.3"
(cd "$WT" && shasum -a 256 -c "$PL/SHA256SUMS.red"; echo "exit=$?") >> "$LOG" 2>&1
say "1.4"
(cd "$WT" && npm run typecheck:app > "$S/red-typecheck.log" 2>&1; echo "exit=$?") >> "$LOG"

say "2.1"
(cd "$WT/apps/app" && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/looks/WalletLooks.render.test.tsx > "$S/red-render.log" 2>&1; echo "exit=$?") >> "$LOG"
grep -E "^ +Tests " "$S/red-render.log" >> "$LOG"
say "2.2"
grep "×" "$S/red-render.log" >> "$LOG"
say "2.3"
grep -c '^AssertionError' "$S/red-render.log" >> "$LOG"
grep '^AssertionError' "$S/red-render.log" | cut -c1-80 >> "$LOG"
grep -cE 'Cannot find module|Failed to resolve|TypeError|ReferenceError' "$S/red-render.log" >> "$LOG"

say "3.1"
cp "$PL/real/apps/app/src/wallet/looks/WalletLooksProvider.tsx" "$WT/apps/app/src/wallet/looks/WalletLooksProvider.tsx"
(cd "$WT" && shasum -a 256 -c "$PL/SHA256SUMS.real"; echo "exit=$?") >> "$LOG" 2>&1
say "3.2"
(cd "$WT" && npm run typecheck:app > "$S/green-typecheck.log" 2>&1; echo "exit=$?") >> "$LOG"
say "3.3"
(cd "$WT/apps/app" && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/looks/WalletLooks.render.test.tsx > "$S/green-render.log" 2>&1; echo "exit=$?") >> "$LOG"
grep -E "^ +Tests " "$S/green-render.log" >> "$LOG"
say "3.4"
(cd "$WT/apps/app" && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/card/WalletCard.render.test.tsx src/wallet/testing/walletHarness.render.test.tsx src/wallet/privacy/PrivateMode.render.test.tsx src/wallet/money/WalletAmount.render.test.tsx src/wallet/motion/GrowBar.render.test.tsx > "$S/green-neighbours.log" 2>&1; echo "exit=$?") >> "$LOG"
grep -E "^ +(Test Files|Tests) " "$S/green-neighbours.log" >> "$LOG"

say "4 check"
python3 -I "$PL/tools/mutants.py" "$WT" --check > "$S/mutants-check.out" 2>&1; echo "exit=$?" >> "$LOG"
grep -c " APPLIES: " "$S/mutants-check.out" >> "$LOG"
say "4 run"
MUTANT_LOGS="$S/mutant-logs" python3 -I "$PL/tools/mutants.py" "$WT" > "$S/mutants.out" 2> "$S/mutants.err"; echo "exit=$?" >> "$LOG"
grep -c " KILLED: " "$S/mutants.out" >> "$LOG"
grep -c "restored=True" "$S/mutants.out" >> "$LOG"
diff "$S/mutants.out" "$PL/logs/mutants.out" >> "$LOG"; echo "diff exit=$?" >> "$LOG"
$G -C "$WT" status --short --untracked-files=all >> "$LOG"
(cd "$WT" && shasum -a 256 -c "$PL/SHA256SUMS.real"; echo "exit=$?") >> "$LOG" 2>&1

say "5.2"
(cd "$WT/apps/app" && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/looks/WalletLooks.render.test.tsx src/wallet/card/WalletCard.render.test.tsx src/wallet/testing/walletHarness.render.test.tsx src/wallet/privacy/PrivateMode.render.test.tsx src/wallet/money/WalletAmount.render.test.tsx src/wallet/motion/GrowBar.render.test.tsx > "$S/gate-render.log" 2>&1; echo "exit=$?") >> "$LOG"
grep -E "^ +(Test Files|Tests) " "$S/gate-render.log" >> "$LOG"
say "5.3"
(cd "$WT" && npm run test:app > "$S/test-app.log" 2>&1; echo "exit=$?") >> "$LOG"
grep -E "^ℹ fail " "$S/test-app.log" >> "$LOG"
say "5.4"
(cd "$WT" && npm run test:unit > "$S/test-unit.log" 2>&1; echo "exit=$?") >> "$LOG"
grep -E "^ℹ fail " "$S/test-unit.log" >> "$LOG"
say "5.5"
$G -C "$WT" diff --check >> "$LOG" 2>&1; echo "exit=$?" >> "$LOG"

say "6 (a stand-in receipt)"
mkdir -p "$WT/docs/implementation/receipts"
printf '# wallet-looks-unstored: rehearsal stand-in\n' > "$WT/docs/implementation/receipts/wallet-looks-unstored.md"
say "7.1"
$G -C "$WT" add apps/app/src/wallet/looks/WalletLooksProvider.tsx apps/app/src/wallet/looks/WalletLooks.render.test.tsx docs/implementation/receipts/wallet-looks-unstored.md
say "7.2"
$G -C "$WT" status --short >> "$LOG"
say "7.3"
$G -C "$WT" diff --cached --check >> "$LOG" 2>&1; echo "exit=$?" >> "$LOG"
say "7.4"
python3 -I "$PL/tools/commit_message.py" /Users/kunanonjarat/Developer/jotbun/.claude/controller/briefs/wallet-looks-unstored.md > "$S/commit-message.txt"; echo "message exit=$?" >> "$LOG"
$G -C "$WT" -c user.name=rehearsal -c user.email=rehearsal@example.invalid commit -q -F "$S/commit-message.txt"; echo "commit exit=$?" >> "$LOG"
$G -C "$WT" log -1 --format=%B >> "$LOG"
say "7.5"
$G -C "$WT" diff --check origin/claude/p1a-vault-core...HEAD >> "$LOG" 2>&1; echo "exit=$?" >> "$LOG"
$G -C "$WT" diff --stat origin/claude/p1a-vault-core...HEAD >> "$LOG"
say "done"
