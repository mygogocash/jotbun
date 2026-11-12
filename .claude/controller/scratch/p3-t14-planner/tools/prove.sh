#!/bin/zsh
# Planner only: the kit's whole proof in its scratch tree, as the brief runs it, with every log in proof/.
# The tree must be a fresh archive of the head with its own npm ci. Prints a summary line per stage.
kit=${0:A:h:h}
T=$kit/tree
P=$kit/proof
A=$T/apps/app
RENDER4=(src/wallet/bunai/AiConsent.render.test.tsx src/wallet/bunai/WalletAiSettings.render.test.tsx src/screens/redesign/account/SettingsScreen.render.test.tsx src/screens/redesign/account/AccountRoutes.render.test.tsx)
UNIT2=(src/config/featureFlags.test.ts src/wallet/bunai/drafts.test.ts)
print "== base"
(cd $T && shasum -a 256 -c $kit/base-check.sha256 > $P/base-check.out 2>&1; grep -c ': OK$' $P/base-check.out)
(cd $T && for f in $(cat $kit/base-absent.txt); do test -e "$f" && echo "EXISTS $f"; done; echo checked)
(cd $T && npm run typecheck:app > $P/base-typecheck.log 2>&1; echo "typecheck rc=$?")
print "== red"
$kit/place.sh red $T > $P/red-place.out 2>&1; tail -1 $P/red-place.out
(cd $T && npm run typecheck:app > $P/red-typecheck.log 2>&1; echo "typecheck rc=$?")
(cd $A && node scripts/test-unit.mjs $UNIT2 > $P/red-unit.log 2>&1; echo "unit rc=$?"; grep -E "^ℹ (tests|pass|fail) " $P/red-unit.log; grep -c "AssertionError \[ERR_ASSERTION\]" $P/red-unit.log)
(cd $A && npx vitest run --config vitest.render.config.ts --reporter=verbose $RENDER4 > $P/red-render.log 2>&1; echo "render rc=$?"; grep -E "Tests  " $P/red-render.log; grep -c "^AssertionError" $P/red-render.log; grep -cE "^(TypeError|ReferenceError|SyntaxError|Error|TestingLibraryElementError):|Cannot find module|Failed to resolve|Unhandled" $P/red-render.log)
print "== green"
$kit/place.sh green $T > $P/green-place.out 2>&1; tail -1 $P/green-place.out
(cd $T && npm run typecheck:app > $P/green-typecheck.log 2>&1; echo "typecheck rc=$?")
(cd $A && node scripts/test-unit.mjs $UNIT2 > $P/green-unit.log 2>&1; echo "unit rc=$?"; grep -E "^ℹ (tests|pass|fail) " $P/green-unit.log)
(cd $A && npx vitest run --config vitest.render.config.ts --reporter=verbose $RENDER4 > $P/green-render.log 2>&1; echo "render rc=$?"; grep -E "Tests  " $P/green-render.log; grep -c "^stderr" $P/green-render.log)
(cd $A && npx vitest run --config vitest.render.config.ts src/screens/redesign/account/CompanionSettings.render.test.tsx src/screens/redesign/ai/TellBunSheet.render.test.tsx > $P/green-unchanged.log 2>&1; echo "unchanged rc=$?"; grep -E "Tests  " $P/green-unchanged.log)
print "== mutants"
date '+start %H:%M:%S' > $P/mutants.time
(cd $kit && python3 -I mutants.py --tree $T --out $P/mutants > $P/mutants.out 2>&1; echo "rc=$?" >> $P/mutants.out)
date '+end %H:%M:%S' >> $P/mutants.time
tail -2 $P/mutants.out; grep -c "killed (assertion)" $P/mutants.out
print "== gate"
(cd $T && npm run typecheck:app > $P/gate-typecheck.log 2>&1; echo "typecheck:app rc=$?")
(cd $T && npm run typecheck:routes -w gogospend-app > $P/gate-typecheck-routes.log 2>&1; echo "typecheck:routes rc=$?")
(cd $A && npx vitest run --config vitest.render.config.ts src/dev/catalogue/CatalogueScreen.render.test.tsx src/dev/catalogue/screenReader.render.test.tsx -t "section (bw-ai|settings-|ask-bun|quick-add-tell-bun|home-bun-note|insights-cashback)|registry has a section|lists every section" > $P/gate-catalogue.log 2>&1; echo "catalogue rc=$?"; grep -E "Test Files|Tests  " $P/gate-catalogue.log)
(cd $A && npx vitest run --config vitest.render.config.ts src/screens/redesign/SpendRoutes.render.test.tsx src/screens/redesign/account/AccountRoutes.render.test.tsx src/screens/redesign/insights/InsightsRoutes.render.test.tsx src/screens/redesign/planning/PlanningRoutes.render.test.tsx > $P/gate-routes.log 2>&1; echo "routes rc=$?"; grep -E "Test Files|Tests  " $P/gate-routes.log)
(cd $A && npx vitest run --config vitest.render.config.ts src/wallet/card/CardStack.render.test.tsx src/wallet/looks/WalletLooks.render.test.tsx src/wallet/privacy/PrivateMode.render.test.tsx src/wallet/testing/walletHarness.render.test.tsx src/wallet/tray/Tray.render.test.tsx src/wallet/lock/Lock.render.test.tsx src/wallet/add/AmountStep.render.test.tsx src/wallet/wallets/WalletsList.render.test.tsx > $P/gate-kit.log 2>&1; echo "kit rc=$?"; grep -E "Test Files|Tests  " $P/gate-kit.log)
(cd $T && npm run test:app > $P/gate-test-app.log 2>&1; echo "test:app rc=$?")
(cd $T && npm run test:unit > $P/gate-test-unit.log 2>&1; echo "test:unit rc=$?")
rm -rf $A/dist
(cd $T && npm run export:web -w gogospend-app -- --max-workers 2 > $P/gate-export-web.log 2>&1; echo "export:web rc=$?"; grep -E "Web Bundled|Exported:" $P/gate-export-web.log)
rm -rf $A/dist
print "== receipt"
$kit/place.sh receipt $T > $P/receipt-place.out 2>&1; cat $P/receipt-place.out
(cd $kit && for f in $(grep -v '^#' files.txt | awk '{print $3}'); do cmp -s "real/$f" "tree/$f" || echo "DIFFERS $f"; done; echo compared) > $P/compare.out; cat $P/compare.out
$kit/make-diffs.sh > $P/make-diffs.out 2>&1; $kit/applycheck.sh > $P/applycheck.out 2>&1; tail -1 $P/applycheck.out
print "== done"
