#!/bin/bash
# The planner's runs on the proof copy (tree/), one stage at a time, each log in logs/<stage>-<name>.log:
#   run.sh base    the head as it is (stage.sh base): typecheck, the Node files, kit8, routes4, rest, the catalogue's
#                  wallet sections and the registry rule
#   run.sh red     after stage.sh red: typecheck, the Node file, the round's render suite (verbose)
#   run.sh green   after stage.sh green: typecheck, the Node files, the round's suite (verbose), kit8, routes4, rest,
#                  the catalogue's wallet sections and the registry rule
#   run.sh gate    after stage.sh green: R100's fast gate (typecheck, test:app, test:unit, the focused sets, diff check)
set -u
PL=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t17-planner
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
    app; run unit npm run test:unit -- src/wallet/copy/draftText.test.ts src/wallet/money/walletMoney.test.ts src/wallet/motion/walletMotion.test.ts src/spend/v1/redesign/shared.test.ts
    run kit8 $VITEST $KIT8
    run routes4 $VITEST $ROUTES4
    run rest $VITEST $REST
    run catalogue $VITEST src/dev/catalogue/CatalogueScreen.render.test.tsx src/dev/catalogue/screenReader.render.test.tsx -t "bw-"
    run registry $VITEST src/dev/catalogue/CatalogueScreen.render.test.tsx -t "registry has a section"
    ;;
  red)
    root; run typecheck npm run typecheck:app
    app; run unit npm run test:unit -- src/wallet/saved/savedMoment.test.ts
    run render $VITEST --reporter=verbose $ROUND
    ;;
  green)
    root; run typecheck npm run typecheck:app
    app; run unit npm run test:unit -- $UNIT
    run render $VITEST --reporter=verbose $ROUND
    run kit8 $VITEST $KIT8
    run routes4 $VITEST $ROUTES4
    run rest $VITEST $REST
    run catalogue $VITEST src/dev/catalogue/CatalogueScreen.render.test.tsx src/dev/catalogue/screenReader.render.test.tsx -t "bw-"
    run registry $VITEST src/dev/catalogue/CatalogueScreen.render.test.tsx -t "registry has a section"
    ;;
  gate)
    root; run 1-typecheck npm run typecheck:app
    run 2-test-app npm run test:app
    run 3-test-unit npm run test:unit
    app; run 4-unit npm run test:unit -- $UNIT
    run 5-round $VITEST $ROUND
    run 6-kit8 $VITEST $KIT8
    run 7-routes4 $VITEST $ROUTES4
    run 8-rest $VITEST $REST
    root; run 9-diff-check bash "$PL/tools/diffcheck.sh"
    ;;
  *) echo "usage: run.sh base|red|green|gate" >&2; exit 2 ;;
esac
