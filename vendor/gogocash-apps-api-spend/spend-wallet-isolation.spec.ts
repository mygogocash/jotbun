import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    if (!full.endsWith('.ts') || full.endsWith('.spec.ts')) return [];
    return [full];
  });
}

describe('spend wallet isolation', () => {
  it('never imports withdraw models or /withdraw routes', () => {
    const files = sourceFiles(__dirname);
    expect(files.length).toBeGreaterThan(3);
    const hits: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      if (
        src.includes('src/withdraw') ||
        src.includes("from 'src/withdraw") ||
        src.includes('WithdrawSchema') ||
        src.includes('/withdraw/check')
      ) {
        hits.push(path.relative(__dirname, file));
      }
    }
    expect(hits).toEqual([]);
  });
});
