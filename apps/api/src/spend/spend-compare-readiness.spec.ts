import path from 'node:path';

import {
  checkCompareKitsCatalog,
  checkSpendGoldenSum,
  checkSpendWalletIsolation,
} from '../../scripts/audit-spend-compare-readiness';

describe('audit-spend-compare-readiness', () => {
  const apiSpendDir = path.resolve(__dirname);
  const fixturesDir = path.join(apiSpendDir, 'fixtures');
  const kitsCatalogPath = path.resolve(
    __dirname,
    '../../../../apps/app/src/screens/compare/kitCatalog.ts',
  );

  it('verifies two-ledger wallet isolation in spend', () => {
    const result = checkSpendWalletIsolation(apiSpendDir);
    expect(result.passed).toBe(true);
    expect(result.category).toBe('spend');
    expect(result.receipt).toMatch(/Zero \/withdraw references/);
  });

  it('verifies golden-sum fail-closed parsing for MeowJot and Spendee', () => {
    const result = checkSpendGoldenSum(fixturesDir);
    expect(result.passed).toBe(true);
    expect(result.category).toBe('spend');
    expect(result.receipt).toMatch(/Golden sum exact match/);
  });

  it('skips retired GoGoCompare kit catalog check', () => {
    const result = checkCompareKitsCatalog(kitsCatalogPath);
    expect(result.passed).toBe(true);
    expect(result.category).toBe('compare');
    expect(result.receipt).toMatch(/kit catalog check skipped|retired/i);
  });
});
