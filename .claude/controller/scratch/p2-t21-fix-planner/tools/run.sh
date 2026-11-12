#!/bin/bash
# The planner's runs on the proof copy, one stage at a time, each log in logs/<stage>-<name>.log:
#   run.sh base    2411001e as it is: typecheck, the draft check, the round's two suites and the focused sets, the catalogue
#   run.sh red     after stage.sh red: typecheck, the round's two suites (verbose)
#   run.sh green   after stage.sh green: typechecks, the draft check, the round's two suites (verbose), the focused sets,
#                  the catalogue and the registry rule
#   run.sh gate    after stage.sh green: R100's fast gate (typechecks, test:app, test:unit, the focused sets, export:web, diff check)
set -u
PL=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t21-fix-planner
W=$PL/work
L=$PL/logs
. "$PL/tools/focused.sh"
STAGE=$1
run() { local name=$1; shift; ( "$@" ) > "$L/$STAGE-$name.log" 2>&1; echo "$STAGE-$name exit $?"; }
root() { cd "$W" || exit 2; }
app() { cd "$W/apps/app" || exit 2; }
case "$STAGE" in
  base)
    root; run typecheck npm run typecheck:app
    app; run draft npm run test:unit -- src/wallet/copy/draftText.test.ts
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
    run typecheck-routes npm run typecheck:routes -w gogospend-app
    app; run draft npm run test:unit -- src/wallet/copy/draftText.test.ts
    run render $VITEST --reporter=verbose $ROUND
    run kit8 $VITEST $KIT8
    run routes4 $VITEST $ROUTES4
    run rest $VITEST $REST
    run catalogue $VITEST src/dev/catalogue/CatalogueScreen.render.test.tsx src/dev/catalogue/screenReader.render.test.tsx -t "bw-"
    run registry $VITEST src/dev/catalogue/CatalogueScreen.render.test.tsx -t "registry has a section"
    ;;
  gate)
    root; run 1-typecheck npm run typecheck:app
    run 2-typecheck-routes npm run typecheck:routes -w gogospend-app
    run 3-test-app npm run test:app
    run 4-test-unit npm run test:unit
    app; run 5-draft npm run test:unit -- src/wallet/copy/draftText.test.ts
    run 6-round $VITEST $ROUND
    run 7-kit8 $VITEST $KIT8
    run 8-routes4 $VITEST $ROUTES4
    run 9-rest $VITEST $REST
    root; run 10-export-web npm run export:web -w gogospend-app -- --max-workers 2
    run 11-diff-check bash "$PL/tools/diffcheck.sh"
    ;;
  *) echo "usage: run.sh base|red|green|gate" >&2; exit 2 ;;
esac
