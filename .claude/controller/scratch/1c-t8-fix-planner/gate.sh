#!/bin/zsh
# The fix planner's gate for the 1C-T8 fix round, on tree/ (5e8b70e plus this round's files).
T=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1c-t8-fix-planner/tree
L=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1c-t8-fix-planner/proof
mkdir -p $L
cd $T
echo "start $(date)" > $L/gate-status.txt
npm run typecheck:app > $L/gate-1-typecheck-app.log 2>&1; rc=$?; echo "typecheck:app rc=$rc" >> $L/gate-status.txt
npm run typecheck:routes -w gogospend-app > $L/gate-2-typecheck-routes.log 2>&1; rc=$?; echo "typecheck:routes rc=$rc" >> $L/gate-status.txt
npm run test:app > $L/gate-3-test-app.log 2>&1; rc=$?; echo "test:app rc=$rc" >> $L/gate-status.txt
npm run test:unit > $L/gate-4-test-unit.log 2>&1; rc=$?; echo "test:unit rc=$rc" >> $L/gate-status.txt
npm run test:render -w gogospend-app > $L/gate-6-render-full.log 2>&1; rc=$?; echo "test:render rc=$rc" >> $L/gate-status.txt
npm run export:web -w gogospend-app -- --max-workers 2 > $L/gate-7-export-web.log 2>&1; rc=$?; echo "export:web rc=$rc" >> $L/gate-status.txt
echo "end $(date)" >> $L/gate-status.txt
