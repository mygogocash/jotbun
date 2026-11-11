// Every React Native Modal in the app, and the Face ID lock's cover (P2-T33,
// R63; the fix round's sweep). A Modal draws above the app's root on both
// platforms, so the lock's own cover lies under every Modal that is open: each
// one a person can open with the lock on draws the cover itself
// (useLockCover() and LockCoverArt), as Sheet, Tray and the receipt photo do.
// The legacy /spend screen's four are left: only that screen draws them, and
// only a development build with EXPO_PUBLIC_LEGACY_SPEND=1 shows that screen
// (featureFlags.ts). Read from the sources, so a new Modal fails here until it
// draws the cover or is ruled out.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const app = fileURLToPath(new URL('../../', import.meta.url));

/** Every source file under a folder, tests left out. */
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

const files = [...sources(join(app, 'src')), ...sources(join(app, 'app'))].map((path) => relative(app, path).split(sep).join('/'));
const read = (path: string) => readFileSync(join(app, path), 'utf8');

const COVERED = ['src/screens/redesign/import/ReceiptParts.tsx', 'src/ui/Sheet.tsx', 'src/wallet/tray/Tray.tsx'];
const LEGACY = ['src/components/SpendDatePicker.tsx', 'src/components/SpendMediaPermissionPrimer.tsx', 'src/components/SpendNewCategorySheet.tsx', 'src/screens/CustomerSpendScreen.tsx'];

test("every Modal a person can open with the lock on draws the lock's cover; the legacy screen's four are the only others", () => {
  const withModal = files.filter((path) => /<Modal\b/.test(read(path))).sort();
  assert.deepEqual(withModal, [...COVERED, ...LEGACY].sort());
  for (const path of COVERED) {
    const code = read(path);
    assert.match(code, /const \{ hidden \} = useLockCover\(\);/, path);
    assert.match(code, /\{hidden \? \(?\s*<LockCoverArt \/>/, path);
  }
});

test('the legacy Modals are drawn only by the legacy /spend screen, which only the development switch shows', () => {
  const importers = (name: string) => files.filter((path) => new RegExp(`^import\\s[^;]*\\b${name}\\b[^;]*\\sfrom\\s`, 'm').test(read(path)));
  for (const name of ['SpendDatePicker', 'SpendMediaPermissionPrimer', 'SpendNewCategorySheet']) {
    assert.deepEqual(importers(name), ['src/screens/CustomerSpendScreen.tsx'], name);
  }
  assert.deepEqual(importers('CustomerSpendScreen'), ['app/spend/index.tsx']);
  assert.match(read('app/spend/index.tsx'), /if \(isLegacySpendEnabled\(\)\) return <CustomerSpendScreen \/>;/);
  assert.match(read('src/config/featureFlags.ts'), /return process\.env\.EXPO_PUBLIC_LEGACY_SPEND === '1';/);
});
