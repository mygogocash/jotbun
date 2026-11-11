P2-T23 merge proofs (planner, 11 Nov 2026), on 3dc81b4d

1. Files. P2-T23 changes the 10 files in files-p2-t23.txt. #407 (P2-T14, head 18876253) changes the 12 in files-p2-t14.txt and #406 (P2-T33, head 5844e4c1) the 21 in files-p2-t33.txt, each from 96a52c2a (no app or package file changed from 96a52c2a to 3dc81b4d). overlap-p2-t23.txt is empty: P2-T23 shares no file with either PR. The two PRs share index.ts and draftText.test.ts with each other only; their merge is the controller's plan (scratch/p2-t33-planner/merge/index.t14-t12-t33.ts 6b9dda7e64edead1ff2f7e94c137d1fe56f5bce98d3c4eb777c3c49695966d92, draft.t14-t33.ts 80eba0345a816ed0b53c3af09c79f96a1c4308f3474e54f932687f118f100785), which P2-T23 does not touch. Their fix rounds (R106: wallet/add; R107: ReceiptParts.tsx and the other Modals, wallet/lock, ui/Sheet) name none of P2-T23's files either; nor do P2-T20's kit (wallet/wallets, app/spend/wallets.tsx, walletListSections.tsx, index.ts, PlanningRoutes.render.test.tsx) or P2-T25's (deleted/, RecentlyDeletedScreen.tsx, wallet/records/, app/spend/deleted.tsx).

2. Every order gives the same P2-T23 files: whether P2-T23 merges before, between or after #407 and #406, each of its files ends byte for byte as real/:
fbe55c2732f30919425c772c32244bafffa0f4d5db322a49679a3081ee3d6972  apps/app/src/screens/redesign/HomeScreen.tsx
93089c10dd75e999b53d322c56a83b0ffea7258251065e81a8858e8e146ca33a  apps/app/src/screens/redesign/entry/entryHelpers.ts
be8fa22a98c62bf68eec5eb26a4ce69e3f51f2402ba0cecdca7247b7b8d02aba  apps/app/src/screens/redesign/homeData.render.test.tsx
90ef7c27ffc00ec3b6f709f64440e4b2829496448e4120bc27a463f6046e508f  apps/app/src/screens/redesign/homeData.ts
83466f8f05d17b25504aeb7f524f38bfa995c1494a6c88668a9bbf204c5ad6c0  apps/app/src/spend/v1/redesign/availableBalances.ts
b6150809058ceddd59050e9f34918baebe55279bfda5e3abf0d7069ddaea18d1  apps/app/src/wallet/home/budgetCardWords.test.ts
74c770da775904ab9467622e2f86abc36d5401cdf0c5082fabe97d0e8e5584d3  apps/app/src/wallet/home/budgetCardWords.ts
1bcee592fb99185adbef8c36ad2d32d4b0d13817ff9c695b3c418357d2e2af2f  apps/app/src/wallet/home/copy.ts
22be9b9c7832aea2cec031116b7033cada362f33da560f0c465c11d3fc41b4be  apps/app/src/wallet/home/homeWallets.test.ts
5b4a529e3a456bf3f0f42459f78755ef25a45c84001bc46446bf55a7eefc11a0  apps/app/src/wallet/home/homeWallets.ts

3. HomeScreen.tsx and entryHelpers.ts on a head that already has #407 and #406 are byte for byte orig/ (#407 and #406 leave them alone). apply-3way.log: git apply --3way of each diffs/ file there applies cleanly and gives the real/ bytes above.

4. The merged tree (work/merged: 3dc81b4d, then #407's and #406's PR-head files, the planned index.ts and draftText.test.ts, then P2-T23's 10 files): merged-typecheck.log (typecheck:app exit 0), merged-unit.log (homeWallets, budgetCardWords and the draft check: 18 of 18; the draft check keeps every key unique across home., add. and lock.), merged-render.log (homeData.render.test.tsx and the four neighbours: 158 of 158), merged-catalogue.log (the Home and Quick add sections in both suites: 46 passed).
