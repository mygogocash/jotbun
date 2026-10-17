import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import {
  isSpendParseFail,
  parseSpendFile,
} from '../src/spend/mappers/parse-spend-file';

export type AuditCheckResult = {
  name: string;
  category: 'spend' | 'compare' | 'infra' | 'live';
  passed: boolean;
  receipt: string;
};

export function checkSpendWalletIsolation(spendDir: string): AuditCheckResult {
  function scan(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) return scan(full);
      if (!full.endsWith('.ts') || full.endsWith('.spec.ts')) return [];
      return [full];
    });
  }

  const files = scan(spendDir);
  const violations: string[] = [];

  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    if (
      content.includes('src/withdraw') ||
      content.includes("from 'src/withdraw") ||
      content.includes('WithdrawSchema') ||
      content.includes('/withdraw/check')
    ) {
      violations.push(path.basename(file));
    }
  }

  return {
    name: 'Two-ledger wallet isolation',
    category: 'spend',
    passed: violations.length === 0,
    receipt:
      violations.length === 0
        ? `Zero /withdraw references across ${files.length} spend files`
        : `Violations found in: ${violations.join(', ')}`,
  };
}

export function checkSpendGoldenSum(fixturesDir: string): AuditCheckResult {
  const meowjotPath = path.join(fixturesDir, 'meowjot-export-sample.csv');
  const spendeePath = path.join(fixturesDir, 'spendee-th-sample.csv');

  const meowjotBuf = readFileSync(meowjotPath);
  const meowjotResult = parseSpendFile(meowjotBuf, 'Export_sample.csv');

  if (isSpendParseFail(meowjotResult)) {
    return {
      name: 'MeowJot golden-sum parse',
      category: 'spend',
      passed: false,
      receipt: `MeowJot parse failed: ${meowjotResult.error_code}`,
    };
  }

  const spendeeBuf = readFileSync(spendeePath);
  const spendeeResult = parseSpendFile(spendeeBuf, 'spendee-th-sample.csv');

  if (isSpendParseFail(spendeeResult)) {
    return {
      name: 'Spendee golden-sum parse',
      category: 'spend',
      passed: false,
      receipt: `Spendee parse failed: ${spendeeResult.error_code}`,
    };
  }

  const meowjotExpectedSum = 29000 + 23000 + 2000 + 100000 + 200000 + 35000;
  const spendeeExpectedSum = 12050 + 100000;

  const meowjotSumMatch =
    meowjotResult.file_sum_minor === meowjotExpectedSum &&
    meowjotResult.parsed_sum_minor === meowjotExpectedSum;

  const spendeeSumMatch =
    spendeeResult.file_sum_minor === spendeeExpectedSum &&
    spendeeResult.parsed_sum_minor === spendeeExpectedSum;

  const passed = meowjotSumMatch && spendeeSumMatch;

  return {
    name: 'Golden-sum fail-closed parsing',
    category: 'spend',
    passed,
    receipt: passed
      ? `MeowJot: 6 rows (${meowjotResult.parsed_sum_minor} satang); Spendee: 3 rows (${spendeeResult.parsed_sum_minor} satang, transfers excluded). Golden sum exact match.`
      : `Sum mismatch: MeowJot parsed=${meowjotResult.parsed_sum_minor}/expected=${meowjotExpectedSum}, Spendee parsed=${spendeeResult.parsed_sum_minor}/expected=${spendeeExpectedSum}`,
  };
}

export function checkCompareKitsCatalog(_kitsCatalogPath: string): AuditCheckResult {
  // Option A (2026-09): `/compare` paste+kit page retired. Shop-card compare stays.
  // Kit catalog file is gone; this check is intentionally a no-op pass.
  return {
    name: "Compare kit catalog",
    category: "compare",
    passed: true,
    receipt: "GoGoCompare page/kits retired — kit catalog check skipped",
  };
}
