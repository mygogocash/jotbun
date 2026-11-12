# The P2-T16 fix round's files (R117), at their repo paths.
A=apps/app/src/wallet/add
# The two code files the round changes: the host, and the add tray's draft lines (one line).
CODE="$A/AddTrayHost.tsx $A/copy.ts"
# The render suite it extends; RED is this suite over 81f66c0e's code, with no stub.
TESTS="$A/AddTray.render.test.tsx"
# The first round's receipt, corrected, and the round's own receipt (new).
RECEIPTS="docs/implementation/receipts/P2-T16.md docs/implementation/receipts/P2-T16-fix.md"
# Every file 81f66c0e has that the round changes (orig/).
ORIG="$CODE $TESTS docs/implementation/receipts/P2-T16.md"
