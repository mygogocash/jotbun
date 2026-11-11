#!/bin/sh
# The planner's own stages, in order, on the proof copy. Each step's log goes
# to logs/; a step that fails stops nothing (its exit code is in summary.txt).
PL=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t23-planner
T=$PL/work/tree
A=$T/apps/app
L=$PL/logs
S=$L/summary.txt
NB="src/screens/redesign/HomeScreen.render.test.tsx src/screens/redesign/QuickAddScreen.render.test.tsx src/screens/redesign/entry/entrySave.render.test.tsx src/screens/redesign/SpendLayout.render.test.tsx"
CAT="src/dev/catalogue/CatalogueScreen.render.test.tsx src/dev/catalogue/screenReader.render.test.tsx"
VR="npx vitest run --config vitest.render.config.ts"
step() { name=$1; shift; ( "$@" ) > "$L/$name.log" 2>&1; echo "$name exit $?" >> "$S"; }
: > "$S"
sh $PL/tools/stage.sh $T base
step base-typecheck sh -c "cd $T && npm run typecheck:app"
step base-draft sh -c "cd $A && npm run test:unit -- src/wallet/copy/draftText.test.ts"
step base-neighbours sh -c "cd $A && $VR --reporter=verbose $NB"
step base-catalogue sh -c "cd $A && $VR $CAT -t '^section (home|quick-add)'"
sh $PL/tools/stage.sh $T red
step red-typecheck sh -c "cd $T && npm run typecheck:app"
step red-unit sh -c "cd $A && npm run test:unit -- src/wallet/home/homeWallets.test.ts src/wallet/home/budgetCardWords.test.ts"
step red-draft sh -c "cd $A && npm run test:unit -- src/wallet/copy/draftText.test.ts"
step red-render sh -c "cd $A && $VR --reporter=verbose src/screens/redesign/homeData.render.test.tsx"
step red-neighbours sh -c "cd $A && $VR --reporter=verbose $NB"
sh $PL/tools/stage.sh $T green
step green-typecheck sh -c "cd $T && npm run typecheck:app"
step green-unit sh -c "cd $A && npm run test:unit -- src/wallet/home/homeWallets.test.ts src/wallet/home/budgetCardWords.test.ts src/wallet/copy/draftText.test.ts"
step green-render sh -c "cd $A && $VR --reporter=verbose src/screens/redesign/homeData.render.test.tsx"
step green-neighbours sh -c "cd $A && $VR --reporter=verbose $NB"
step green-catalogue sh -c "cd $A && $VR $CAT -t '^section (home|quick-add)'"
step mutants sh -c "cd $PL && python3 -I tools/mutants.py $T $L/mutant-logs"
cp "$L/mutants.log" "$L/mutants.out"
echo done >> "$S"
