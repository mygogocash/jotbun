#!/bin/zsh
# Dry run of briefs/P3-T14.md: the brief's commands, in order, on a clone at 0bfdc014 (WT) with a scratch S.
# Step 0.1 (fetch and merge) is skipped: the clone is already at the head. Prints each step's outputs.
WT=/private/tmp/claude-501/-Users-kunanonjarat-Developer-jotbun/4ca5976a-2a32-498a-8b74-b8cdf4005758/scratchpad/sim-wt
S=/private/tmp/claude-501/-Users-kunanonjarat-Developer-jotbun/4ca5976a-2a32-498a-8b74-b8cdf4005758/scratchpad/sim-s
PL=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p3-t14-planner
rm -rf $S; mkdir -p $S
print "== 0.2"; /usr/bin/git -C $WT log --oneline -1 --grep "Merge pull request #418"
print "== 0.3"; /usr/bin/git -C $WT rev-parse --short HEAD
print "== 0.4"; (cd $PL && shasum -a 256 -c SHA256SUMS > $S/kit-sums.log 2>&1; rc=$?; echo "rc=$rc"; grep -c ': OK$' $S/kit-sums.log)
print "== 0.5"; (cd $WT && shasum -a 256 -c $PL/base-check.sha256)
print "== 0.6"; (cd $WT && for f in $(cat $PL/base-absent.txt); do test -e "$f" && echo "EXISTS $f"; done; echo checked)
print "== 0.8"; (cd $WT && npm run typecheck:app > $S/typecheck-0.log 2>&1; echo "rc=$?")
print "== 1"; $PL/place.sh red $WT
print "== 2"; (cd $WT && npm run typecheck:app > $S/red-typecheck.log 2>&1; echo "rc=$?")
print "== 3.1"; (cd $WT/apps/app && node scripts/test-unit.mjs src/config/featureFlags.test.ts src/wallet/bunai/drafts.test.ts > $S/red-unit.log 2>&1; echo "rc=$?"; grep -E "^ℹ (tests|pass|fail) " $S/red-unit.log; grep -c "AssertionError \[ERR_ASSERTION\]" $S/red-unit.log)
print "== 3.2"; (cd $WT/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/bunai/AiConsent.render.test.tsx src/wallet/bunai/WalletAiSettings.render.test.tsx src/screens/redesign/account/SettingsScreen.render.test.tsx src/screens/redesign/account/AccountRoutes.render.test.tsx > $S/red-render.log 2>&1; echo "rc=$?"; grep -E "Tests  " $S/red-render.log; grep -c "^AssertionError" $S/red-render.log; grep -cE "^(TypeError|ReferenceError|SyntaxError|Error|TestingLibraryElementError):|Cannot find module|Failed to resolve|Unhandled" $S/red-render.log)
print "== 4"; $PL/place.sh green $WT | tail -1
print "== 5.1"; (cd $WT && npm run typecheck:app > $S/green-typecheck.log 2>&1; echo "rc=$?")
print "== 5.2"; (cd $WT/apps/app && node scripts/test-unit.mjs src/config/featureFlags.test.ts src/wallet/bunai/drafts.test.ts > $S/green-unit.log 2>&1; echo "rc=$?"; grep -E "^ℹ (tests|pass|fail) " $S/green-unit.log)
print "== 5.3"; (cd $WT/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/bunai/AiConsent.render.test.tsx src/wallet/bunai/WalletAiSettings.render.test.tsx src/screens/redesign/account/SettingsScreen.render.test.tsx src/screens/redesign/account/AccountRoutes.render.test.tsx > $S/green-render.log 2>&1; echo "rc=$?"; grep -E "Tests  " $S/green-render.log; grep -c "^stderr" $S/green-render.log)
print "== 5.4"; (cd $WT/apps/app && npx vitest run --config vitest.render.config.ts src/screens/redesign/account/CompanionSettings.render.test.tsx src/screens/redesign/ai/TellBunSheet.render.test.tsx > $S/green-unchanged.log 2>&1; echo "rc=$?"; grep -E "Tests  " $S/green-unchanged.log)
print "== 6"; (cd $PL && python3 -I mutants.py --tree $WT --out $S/mutants > $S/mutants.out 2>&1; echo "rc=$?"; tail -1 $S/mutants.out; grep -c "killed (assertion)" $S/mutants.out)
/usr/bin/git -C $WT status --short
print "== 7"; $PL/place.sh receipt $WT
print "== 8"; (cd $PL && for f in $(grep -v '^#' files.txt | awk '{print $3}'); do cmp -s "real/$f" "$WT/$f" || echo "DIFFERS $f"; done; echo compared)
print "== 9.1"; (cd $WT && npm run typecheck:app > $S/gate-typecheck.log 2>&1; echo "typecheck:app rc=$?"); (cd $WT && npm run typecheck:routes -w gogospend-app > $S/gate-typecheck-routes.log 2>&1; echo "typecheck:routes rc=$?")
print "== 9.2"; (cd $WT/apps/app && npx vitest run --config vitest.render.config.ts src/dev/catalogue/CatalogueScreen.render.test.tsx src/dev/catalogue/screenReader.render.test.tsx -t "section (bw-ai|settings-|ask-bun|quick-add-tell-bun|home-bun-note|insights-cashback)|registry has a section|lists every section" > $S/gate-catalogue.log 2>&1; echo "rc=$?"; grep -E "Test Files|Tests  " $S/gate-catalogue.log)
print "== 9.3"; (cd $WT/apps/app && npx vitest run --config vitest.render.config.ts src/screens/redesign/SpendRoutes.render.test.tsx src/screens/redesign/account/AccountRoutes.render.test.tsx src/screens/redesign/insights/InsightsRoutes.render.test.tsx src/screens/redesign/planning/PlanningRoutes.render.test.tsx > $S/gate-routes.log 2>&1; echo "rc=$?"; grep -E "Test Files|Tests  " $S/gate-routes.log)
print "== 9.4"; (cd $WT/apps/app && npx vitest run --config vitest.render.config.ts src/wallet/card/CardStack.render.test.tsx src/wallet/looks/WalletLooks.render.test.tsx src/wallet/privacy/PrivateMode.render.test.tsx src/wallet/testing/walletHarness.render.test.tsx src/wallet/tray/Tray.render.test.tsx src/wallet/lock/Lock.render.test.tsx src/wallet/add/AmountStep.render.test.tsx src/wallet/wallets/WalletsList.render.test.tsx > $S/gate-kit.log 2>&1; echo "rc=$?"; grep -E "Test Files|Tests  " $S/gate-kit.log)
print "== 9.5"; (cd $WT && npm run test:app > $S/gate-test-app.log 2>&1; echo "test:app rc=$?"); (cd $WT && npm run test:unit > $S/gate-test-unit.log 2>&1; echo "test:unit rc=$?")
print "== 9.6"; (cd $WT && npm run export:web -w gogospend-app -- --max-workers 2 > $S/gate-export-web.log 2>&1; echo "export:web rc=$?"; grep -E "Web Bundled|Exported:" $S/gate-export-web.log)
print "== 9.7"; /usr/bin/git -C $WT diff --check; echo "diff-check rc=$?"
print "== 10.1"; /usr/bin/git -C $WT add apps/app/src/config/featureFlags.ts apps/app/src/config/featureFlags.test.ts apps/app/src/wallet/bunai apps/app/app/settings/ai.tsx apps/app/src/dev/catalogue/wallet/bunaiSections.tsx apps/app/src/dev/catalogue/wallet/bunaiScreens.tsx apps/app/src/dev/catalogue/wallet/index.ts apps/app/src/screens/redesign/account/SettingsScreen.tsx apps/app/src/screens/redesign/account/SettingsScreen.render.test.tsx apps/app/src/screens/redesign/account/CompanionSettings.tsx apps/app/src/screens/redesign/ai/AiConsentSheet.tsx apps/app/src/screens/redesign/account/AccountRoutes.render.test.tsx docs/implementation/receipts/P3-T14.md
print "== 10.2"; /usr/bin/git -C $WT diff --cached --name-only; /usr/bin/git -C $WT diff --cached --check; echo "cached-check rc=$?"
print "== 10.3"; /usr/bin/git -C $WT -c user.name=dryrun -c user.email=dryrun@example.invalid commit -q -m "Add Bun's AI consent and settings in the Bun Wallet look, naming what prompts carry" -m "dry run" -m "Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>"; echo "commit rc=$?"
print "== 10.4"; /usr/bin/git -C $WT status --short; echo "status done"
