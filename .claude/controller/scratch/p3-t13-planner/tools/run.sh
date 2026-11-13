#!/bin/bash
# The planner's runs on the proof copy (tree/), one stage at a time, each log in logs/<stage>-<name>.log:
#   run.sh base    the base as it is (stage.sh base): typecheck, the Node files, the round's two render files, kit8,
#                  routes4, rest and the catalogue's wallet sections (which open the host's three sections)
#   run.sh red     after stage.sh red: typecheck, the Node files, the round's render files (verbose)
#   run.sh green   after stage.sh green: typecheck, the Node files and their neighbours, the round's render files
#                  (verbose), kit8, routes4, rest and the catalogue's wallet sections
#   run.sh gate    after stage.sh green: R100's fast gate (typecheck, test:app, test:unit, the focused sets, diff check)
set -u
PL=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p3-t13-planner
W=$PL/tree
L=$PL/logs
. "$PL/tools/files.sh"
STAGE=$1
run() { local name=$1; shift; ( "$@" ) > "$L/$STAGE-$name.log" 2>&1; echo "$STAGE-$name exit $?"; }
root() { cd "$W" || exit 2; }
app() { cd "$W/apps/app" || exit 2; }
case "$STAGE" in
  base)
    root; run typecheck npm run typecheck:app
    app; run unit npm run test:unit -- src/spend/v1/redesign/quickAddModel.test.ts src/spend/v1/ai/draftReview.test.ts $NEAR
    run round $VITEST --reporter=verbose $ROUND
    run kit8 $VITEST $KIT8
    run routes4 $VITEST $ROUTES4
    run rest $VITEST $REST
    run catalogue $VITEST src/dev/catalogue/CatalogueScreen.render.test.tsx src/dev/catalogue/screenReader.render.test.tsx -t "bw-"
    ;;
  red)
    root; run typecheck npm run typecheck:app
    app; run unit npm run test:unit -- $UNIT
    run render $VITEST --reporter=verbose $ROUND
    ;;
  green)
    root; run typecheck npm run typecheck:app
    app; run unit npm run test:unit -- $UNIT $NEAR
    run render $VITEST --reporter=verbose $ROUND
    run kit8 $VITEST $KIT8
    run routes4 $VITEST $ROUTES4
    run rest $VITEST $REST
    run catalogue $VITEST src/dev/catalogue/CatalogueScreen.render.test.tsx src/dev/catalogue/screenReader.render.test.tsx -t "bw-"
    ;;
  gate)
    root; run 1-typecheck npm run typecheck:app
    run 2-test-app npm run test:app
    run 3-test-unit npm run test:unit
    app; run 4-unit npm run test:unit -- $UNIT $NEAR
    run 5-round $VITEST $ROUND
    run 6-kit8 $VITEST $KIT8
    run 7-routes4 $VITEST $ROUTES4
    run 8-rest $VITEST $REST
    run 9-catalogue $VITEST src/dev/catalogue/CatalogueScreen.render.test.tsx src/dev/catalogue/screenReader.render.test.tsx -t "bw-"
    root; run 10-diff-check bash "$PL/tools/diffcheck.sh"
    ;;
  *) echo "usage: run.sh base|red|green|gate" >&2; exit 2 ;;
esac
