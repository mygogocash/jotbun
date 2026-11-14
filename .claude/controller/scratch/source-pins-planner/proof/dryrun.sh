#!/bin/zsh
# The planner's dry run of brief source-pins: the brief's own commands, Steps 0 to 6, on a second
# copy of the head b1ca3bfb (PL/dry, its node_modules linked from PL/tree), with PL, WT and S typed
# in full. Skipped, because the copy is no repository and its installs are linked: the git commands
# (Steps 0.1, 0.2, 1.3, 3's and 5's status, 6.5), the installs (0.5) and the kit check (0.3, which
# the final SHA256SUMS postdates; the planner checks it directly).
# Usage: proof/dryrun.sh > proof/dryrun.out 2>&1
PL=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/source-pins-planner
WT=$PL/dry
S=$PL/proof/dryrun-s
mkdir -p $S

print '== Step 0.4'
cd $WT && shasum -a 256 -c $PL/SHA256SUMS.base

print '== Step 1.1 and 1.2'
cp $PL/real/apps/edge/test/workers/transaction-source.test.ts $WT/apps/edge/test/workers/transaction-source.test.ts
cp $PL/real/apps/app/src/storage/diaryRepository.test.ts $WT/apps/app/src/storage/diaryRepository.test.ts
cd $WT && shasum -a 256 apps/edge/test/workers/transaction-source.test.ts apps/app/src/storage/diaryRepository.test.ts

print '== Step 1.4'
cd $PL && python3 -I mutants.py --check $WT > $S/check.out 2>&1; echo "rc=$?"; diff $PL/proof/check.out $S/check.out; echo compared

print '== Step 2'
cd $WT && npm run typecheck:edge > $S/typecheck-edge.log 2>&1; echo "typecheck:edge rc=$?"
cd $WT && npm run typecheck:app > $S/typecheck-app.log 2>&1; echo "typecheck:app rc=$?"

print '== Step 3'
cd $PL && python3 -I mutants.py --red $WT $S/red > $S/red.out 2>&1; echo "rc=$?"; diff $PL/proof/red.out $S/red.out; echo compared

print '== Step 4'
$PL/locked.sh $S/green-workers.log $WT/apps/edge npx vitest run --config vitest.workers.config.ts --reporter=verbose test/workers/transaction-source.test.ts; echo "rc=$?"; grep -E "Test Files|Tests " $S/green-workers.log
cd $WT/apps/app && npm run test:unit -- src/storage/diaryRepository.test.ts > $S/green-unit.log 2>&1; echo "rc=$?"; grep -E "^ℹ (tests|pass|fail) " $S/green-unit.log

print '== Step 5'
cd $PL && python3 -I mutants.py $WT $S/mutants > $S/mutants.out 2>&1; echo "rc=$?"; diff $PL/proof/mutants.out $S/mutants.out; echo compared

print '== Step 6.1'
cd $WT && npm run typecheck:edge > $S/gate-typecheck-edge.log 2>&1; echo "typecheck:edge rc=$?"
cd $WT && npm run typecheck:app > $S/gate-typecheck-app.log 2>&1; echo "typecheck:app rc=$?"

print '== Step 6.2'
$PL/locked.sh $S/gate-workers.log $WT/apps/edge npx vitest run --config vitest.workers.config.ts --reporter=verbose test/workers/transaction-source.test.ts; echo "rc=$?"; grep -E "Test Files|Tests " $S/gate-workers.log
cd $WT/apps/app && npm run test:unit -- src/storage/diaryRepository.test.ts > $S/gate-unit-focused.log 2>&1; echo "rc=$?"; grep -E "^ℹ (tests|pass|fail) " $S/gate-unit-focused.log

print '== Step 6.3'
cd $WT && npm run test:edge > $S/gate-test-edge.log 2>&1; echo "test:edge rc=$?"; grep -E "^ +Tests " $S/gate-test-edge.log

print '== Step 6.4'
cd $WT && npm run test:app > $S/gate-test-app.log 2>&1; echo "test:app rc=$?"; grep -E "^ℹ fail " $S/gate-test-app.log
cd $WT && npm run test:unit > $S/gate-test-unit.log 2>&1; echo "test:unit rc=$?"; grep -E "^ℹ fail " $S/gate-test-unit.log

print '== Every file of dry/ the brief touches, against real/ and the head'
cmp -s $PL/real/apps/edge/test/workers/transaction-source.test.ts $WT/apps/edge/test/workers/transaction-source.test.ts && print 'same as real/: transaction-source.test.ts'
cmp -s $PL/real/apps/app/src/storage/diaryRepository.test.ts $WT/apps/app/src/storage/diaryRepository.test.ts && print 'same as real/: diaryRepository.test.ts'
cd $WT && shasum -a 256 apps/app/src/storage/diaryRepository.ts apps/edge/src/vault/domain/transactions.ts apps/edge/src/vault/files/attachments.ts | sed 's/^/source after the run: /'
print '== done'
