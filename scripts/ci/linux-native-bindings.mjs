// Fills the Linux native bindings that package-lock.json is missing (P6b
// finding). The lockfile records only the darwin-arm64 binding for the API
// workspace's nested native packages (@swc/core, unrs-resolver - Jest 30's
// resolver - and sharp), so `npm ci` on Linux installs them without a
// binding: the swc build, every Jest run and the legacy sharp-based spend
// tests then fail. Until the lockfile is regenerated with every platform's
// optional bindings (a separate, authorized dependency change), the Docker
// build and CI run this after `npm ci`:
//
//   node scripts/ci/linux-native-bindings.mjs swc            # Docker build stage (compiler only)
//   node scripts/ci/linux-native-bindings.mjs swc unrs sharp # CI (Jest and the legacy tests)
//   node scripts/ci/linux-native-bindings.mjs --check        # pins agree with the lockfile (any OS)
//
// Each binding is the exact version the lockfile's parent package names,
// fetched with `npm pack` and refused unless its sha512 equals the integrity
// pinned below. Nothing is installed on macOS, and nothing is saved to the
// lockfile or any manifest. No install script runs.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../../', import.meta.url)));

/** group → parent package location in the lockfile, and its Linux glibc bindings. */
export const BINDINGS = {
  swc: {
    parent: 'apps/api/node_modules/@swc/core',
    packages: [
      { name: '@swc/core-linux-x64-gnu', version: '1.16.18', cpu: 'x64', integrity: 'sha512-Ml6kbe0BoVJkSgmYPAEUudGcu84jaQeqDN8xeMumbwNpT0vlmm7241Ddp9XKCjQABvjomnXF0OiNOAfjBhNDNw==' },
      { name: '@swc/core-linux-arm64-gnu', version: '1.16.18', cpu: 'arm64', integrity: 'sha512-ep/mQyhblQYZ6tkfq0IJspcVSFl5jdywks3kejanrbB31uuujRD/QWOoGNp2L3lLRdAdQvgl/M3pA7g3hSuQug==' },
    ],
  },
  unrs: {
    parent: 'apps/api/node_modules/unrs-resolver',
    packages: [
      { name: '@unrs/resolver-binding-linux-x64-gnu', version: '1.12.2', cpu: 'x64', integrity: 'sha512-mPsUhunKKDih5O96Y6enDQyHc1SqBPlY1E/SfMWDM3EdJ95Z9CArPeCVwCCqbP45ljvivdEk8Fxn+SIb1rDAJQ==' },
      { name: '@unrs/resolver-binding-linux-arm64-gnu', version: '1.12.2', cpu: 'arm64', integrity: 'sha512-zJc0H99FEPoFfSrNpa91HYfxzfAJCr502oxNK1cfdC9hlaFI43RT+JFCann9JUgZmLzzntChHyn13Sgn9ljHNg==' },
    ],
  },
  sharp: {
    parent: 'apps/api/node_modules/sharp',
    packages: [
      { name: '@img/sharp-linux-x64', version: '0.35.5', cpu: 'x64', integrity: 'sha512-SxFtLTeJInhAA9Q836kux2vZNeOBQEx658qvbboZScr0wIARym3IcGmW7KpVD5sbVg0Ojy+udFQdayYIZyoNog==' },
      { name: '@img/sharp-linux-arm64', version: '0.35.5', cpu: 'arm64', integrity: 'sha512-LYVx5JTsOM2CBzmxreh+nl64/3H6Xb09iSLknqH47z2T2DFFxDeFLP5y4dJwe6H7uGQlHPyEEtIqyo3DYsRwdQ==' },
      { name: '@img/sharp-libvips-linux-x64', version: '1.3.4', cpu: 'x64', integrity: 'sha512-GJ//SSXbnwSDes02umB3nDJLFcQzw8a18V8fyhqr6tV515tOEMdImjjxj1AoafMRz56F3PHgftnj1QEKSU1zkw==' },
      { name: '@img/sharp-libvips-linux-arm64', version: '1.3.4', cpu: 'arm64', integrity: 'sha512-Y3dgX/6lE2QhQb+Gxy0WZxfg9MEm/JBjamZpS2IklP7xIQoKN4hzAm7KcMVGtaVDt3neE9OKBC7vAfonA/Lr1A==' },
    ],
  },
};

/** Problems where a pin disagrees with the lockfile (a dependency bump must update the pins). */
export function checkPins(lock = JSON.parse(readFileSync(join(ROOT, 'package-lock.json'), 'utf8'))) {
  const problems = [];
  for (const [group, { parent, packages }] of Object.entries(BINDINGS)) {
    const entry = lock.packages[parent];
    if (!entry) {
      problems.push(`${group}: ${parent} is not in the lockfile`);
      continue;
    }
    // sharp's libvips is an optional dependency of sharp itself.
    const declared = { ...(entry.optionalDependencies ?? {}) };
    for (const pkg of packages) {
      if (declared[pkg.name] !== pkg.version) problems.push(`${group}: ${pkg.name} pinned ${pkg.version}, lockfile parent wants ${declared[pkg.name] ?? 'nothing'}`);
      if (!/^sha512-[A-Za-z0-9+/]{86}==$/.test(pkg.integrity)) problems.push(`${group}: ${pkg.name} has no sha512 pin`);
    }
  }
  return problems;
}

function isGlibc() {
  const header = process.report?.getReport?.().header ?? {};
  return Boolean(header.glibcVersionRuntime);
}

function install(pkg, parent) {
  // Installed in the parent's node_modules directory, where Node resolves it from the parent package.
  const modules = parent.slice(0, parent.lastIndexOf('node_modules/') + 'node_modules'.length);
  const target = join(ROOT, modules, pkg.name);
  const manifest = join(target, 'package.json');
  if (existsSync(manifest) && JSON.parse(readFileSync(manifest, 'utf8')).version === pkg.version) return 'present';
  const work = mkdtempSync(join(tmpdir(), 'gogospend-binding-'));
  try {
    const packed = JSON.parse(execFileSync('npm', ['pack', `${pkg.name}@${pkg.version}`, '--pack-destination', work, '--json', '--ignore-scripts'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }));
    const file = join(work, packed[0].filename);
    const digest = `sha512-${createHash('sha512').update(readFileSync(file)).digest('base64')}`;
    if (digest !== pkg.integrity) throw new Error(`${pkg.name}@${pkg.version}: integrity mismatch; refusing it`);
    rmSync(target, { recursive: true, force: true });
    mkdirSync(target, { recursive: true });
    execFileSync('tar', ['-xzf', file, '-C', target, '--strip-components=1', '--no-same-owner'], { stdio: 'inherit' });
    return 'installed';
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

export function main(argv = process.argv.slice(2)) {
  if (argv.includes('--check')) {
    const problems = checkPins();
    process.stdout.write(problems.length === 0 ? 'linux native binding pins match the lockfile\n' : `${problems.join('\n')}\n`);
    return problems.length === 0 ? 0 : 1;
  }
  const groups = argv.length > 0 ? argv : Object.keys(BINDINGS);
  const unknown = groups.filter((group) => !BINDINGS[group]);
  if (unknown.length > 0) {
    process.stderr.write(`unknown binding group(s): ${unknown.join(', ')}\n`);
    return 2;
  }
  if (process.platform !== 'linux') {
    process.stdout.write(`not Linux (${process.platform}): nothing to install\n`);
    return 0;
  }
  if (!isGlibc() || !['x64', 'arm64'].includes(process.arch)) {
    process.stderr.write(`unsupported platform linux-${process.arch} (glibc x64/arm64 only)\n`);
    return 1;
  }
  const problems = checkPins();
  if (problems.length > 0) {
    process.stderr.write(`${problems.join('\n')}\n`);
    return 1;
  }
  for (const group of groups) {
    const { parent, packages } = BINDINGS[group];
    if (!existsSync(join(ROOT, parent, 'package.json'))) {
      process.stdout.write(`${group}: ${parent} not installed here; skipped\n`);
      continue;
    }
    for (const pkg of packages.filter((candidate) => candidate.cpu === process.arch)) {
      process.stdout.write(`${group}: ${pkg.name}@${pkg.version} ${install(pkg, parent)}\n`);
    }
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main();
