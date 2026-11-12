#!/bin/bash
# The planner's runs on the proof copy, one stage at a time, each log in logs/<stage>-<name>.log:
#   run.sh base    81f66c0e as it is: typecheck, the Node files, the round's suite and the focused sets, the catalogue
#   run.sh red     after stage.sh red: typecheck, the round's suite (verbose)
#   run.sh green   after stage.sh green: typecheck, the Node files, the round's suite (verbose), the focused sets, the
#                  catalogue's wallet sections and the registry rule
#   run.sh gate    after stage.sh green: R100's fast gate (typecheck, test:app, test:unit, the focused sets, diff check);
#                  gate1 and gate2 run its two halves (1 to 3, 4 to 9) with the same logs
set -u
PL=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix-planner
W=$PL/work
L=$PL/logs
. "$PL/tools/focused.sh"
STAGE=$1
LOG=${STAGE%[12]}
run() { local name=$1; shift; ( "$@" ) > "$L/$LOG-$name.log" 2>&1; echo "$LOG-$name exit $?"; }
root() { cd "$W" || exit 2; }
app() { cd "$W/apps/app" || exit 2; }
case "$STAGE" in
  base)
    root; run typecheck npm run typecheck:app
    app; run unit npm run test:unit -- $UNIT
    run round $VITEST --reporter=verbose $ROUND
    run kit8 $VITEST $KIT8
    run routes4 $VITEST $ROUTES4
    run rest $VITEST $REST
    run catalogue $VITEST src/dev/catalogue/CatalogueScreen.render.test.tsx src/dev/catalogue/screenReader.render.test.tsx -t "bw-"
    run registry $VITEST src/dev/catalogue/CatalogueScreen.render.test.tsx -t "registry has a section"
    ;;
  red)
    root; run typecheck npm run typecheck:app
    app; run render $VITEST --reporter=verbose $ROUND
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
  gate|gate1|gate2)
    if [ "$STAGE" != gate2 ]; then
      root; run 1-typecheck npm run typecheck:app
      run 2-test-app npm run test:app
      run 3-test-unit npm run test:unit
    fi
    [ "$STAGE" = gate1 ] && exit 0
    app; run 4-unit npm run test:unit -- $UNIT
    run 5-round $VITEST $ROUND
    run 6-kit8 $VITEST $KIT8
    run 7-routes4 $VITEST $ROUTES4
    run 8-rest $VITEST $REST
    root; run 9-diff-check bash "$PL/tools/diffcheck.sh"
    ;;
  *) echo "usage: run.sh base|red|green|gate|gate1|gate2" >&2; exit 2 ;;
esac
