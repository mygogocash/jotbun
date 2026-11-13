// The spend layout's order (P2-T18; R58, R82, W34). app/spend/_layout.tsx's
// wallet branch nests the device diary, Bun's AI help, the wallet shell,
// History's keep and the screen, in that order. It comes after the sign-in
// redirect and the legacy build, and before the core branch. When the file
// holds 1C's terms gate, the gate sits between the diary and
// CompanionBoundary in this branch too; when it holds 1D-T8's consent
// question, the question takes the whole shell's place inside
// CompanionBoundary, on the layout's own condition. So a clean parallel merge
// cannot drop either from this branch. The app mounts one add tray host: the
// shell's (the catalogue's sections may mount their own).
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const layout = () => readFileSync(join(appRoot, 'app', 'spend', '_layout.tsx'), 'utf8');
const WALLET_BRANCH = "if (isRedesignEnabled('wallet'))";

/** The wallet branch: from its condition to the end of its one statement (its JSX holds no semicolon). */
function walletBranch(source: string): string {
  const start = source.indexOf(WALLET_BRANCH);
  assert.ok(start >= 0, 'the layout has a wallet branch');
  const end = source.indexOf(';', start);
  assert.ok(end > start, 'the wallet branch ends');
  return source.slice(start, end);
}

/** Every marker is in `text`, each first found after the one before. */
function inOrder(text: string, markers: readonly string[]): void {
  const at = markers.map((marker) => text.indexOf(marker));
  assert.deepEqual(markers.filter((_, index) => at[index] < 0), [], 'every marker is there');
  for (let index = 1; index < markers.length; index += 1) {
    assert.ok(at[index - 1] < at[index], `${markers[index - 1]} comes before ${markers[index]}`);
  }
}

test('the wallet branch nests the diary, the companion, the shell, History\'s keep and the slot in that order', () => {
  const source = layout();
  const branch = walletBranch(source);
  inOrder(branch, ['<DeviceDiaryProvider>', '<CompanionBoundary>', '<WalletShell>', '<HistoryKeepProvider>', '<Slot />']);
  inOrder(branch, ['<Slot />', '</HistoryKeepProvider>', '</WalletShell>', '</CompanionBoundary>', '</DeviceDiaryProvider>']);
  if (source.includes('<TermsGate')) inOrder(branch, ['<DeviceDiaryProvider>', '<TermsGate', '<CompanionBoundary>']);
  if (source.includes('<AnalyticsConsentScreen')) inOrder(branch, ['<CompanionBoundary>', '<AnalyticsConsentScreen', '<WalletShell>']);
});

test('the wallet branch comes after the sign-in redirect and the legacy build, and before the core branch', () => {
  const source = layout();
  inOrder(source, ['<Redirect href="/login" />', 'if (isLegacySpendEnabled())', WALLET_BRANCH, "isRedesignEnabled('core')"]);
});

test("the consent question takes the shell's place inside CompanionBoundary", () => {
  const branch = walletBranch(layout());
  const question = branch.indexOf('<AnalyticsConsentScreen');
  assert.ok(question > branch.indexOf('<CompanionBoundary>'), 'after CompanionBoundary opens');
  assert.ok(question < branch.indexOf('</CompanionBoundary>'), 'before CompanionBoundary closes');
  assert.ok(question < branch.indexOf('<WalletShell>') || question > branch.indexOf('</WalletShell>'), 'never inside the shell');
  // On the layout's own condition, which the core branch reads too (one condition, 1D-T8's `ask`).
  assert.ok(branch.includes('{ask ? <AnalyticsConsentScreen /> : <WalletShell>'), 'ask chooses between the question and the shell');
});

test("the shell nests the shared resources, the looks, the card frames, the toast's host and the add tray's host around its root, in that order", () => {
  const shell = readFileSync(join(appRoot, 'src', 'wallet', 'home', 'WalletShell.tsx'), 'utf8');
  inOrder(shell, [
    '<SpendV1Provider resources={getSharedV1Resources()}>',
    '<WalletLooksProvider>',
    '<CardFramesProvider>',
    '<SavedToastHost>',
    '<ShellTray>',
    '</SavedToastHost>',
    '</CardFramesProvider>',
    '</WalletLooksProvider>',
    '</SpendV1Provider>',
    'const toast = useSavedToast();',
    '<AddTrayHost onSaved={onSaved} blocked={blocked}>',
    '<ShellFrame blocked={blocked}>',
    '</AddTrayHost>',
    '<View testID="wallet-shell"',
  ]);
});

/** Every source file under apps/app's app/ and src/, but tests, test helpers and the development catalogue. */
function appSources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'node_modules' ? [] : appSources(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

test('the app mounts one add tray host for its life: the wallet shell\'s', () => {
  const mounts = [...appSources(join(appRoot, 'app')), ...appSources(join(appRoot, 'src'))]
    .map((path) => relative(appRoot, path).split(sep).join('/'))
    .filter((path) => !path.startsWith('src/dev/catalogue/') && !path.includes('/testing/'))
    .flatMap((path) => readFileSync(join(appRoot, path), 'utf8').match(/<AddTrayHost\b/g)?.map(() => path) ?? []);
  assert.deepEqual(mounts, ['src/wallet/home/WalletShell.tsx']);
});
