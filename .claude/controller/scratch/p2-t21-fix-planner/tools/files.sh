# The P2-T21 fix round's files (R115), at their repo paths.
A=apps/app/src/wallet/wallets
# The two code files the round changes.
CODE="$A/NewWalletFlow.tsx $A/WalletEditScreen.tsx"
# The two render suites it extends; RED is these over 2411001e's code, with no stub.
TESTS="$A/NewWallet.render.test.tsx $A/WalletEdit.render.test.tsx"
# The first round's receipt, corrected, and the round's own receipt (new).
RECEIPTS="docs/implementation/receipts/P2-T21.md docs/implementation/receipts/P2-T21-fix.md"
# Every file 2411001e has that the round changes (orig/).
ORIG="$CODE $TESTS docs/implementation/receipts/P2-T21.md"
