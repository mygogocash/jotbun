// P6b release graph for the v1 image.
//
//   node apps/api/scripts/release-graph.mjs check          # after `npm run build -w gogospend-api`
//   node apps/api/scripts/release-graph.mjs stage <dir>    # check, then copy the release tree to <dir>
//
// Walks every `require(...)` from the release entries in apps/api/dist
// (release-graph.json: the v1 API, the job, security and deletion workers and
// the migration CLI) and refuses the build when it reaches a legacy file
// (/spend, internal shared key, Salt Edge, cashback, autolog, Firebase, Mongo),
// a test file, a direct package outside the reviewed list, or - anywhere in
// the package closure - a forbidden package. `stage` copies only what is
// reached: those dist files, the migrations, the contracts source (consumed
// as TypeScript through Node's type stripping, the master contracts rule),
// and each package in the closure (dependencies, optional dependencies and
// required peers, resolved as Node does). Legacy source stays in the
// repository; it is simply not in the image.
import { builtinModules } from 'node:module';
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const API = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = resolve(API, '..', '..');
const BUILTINS = new Set(builtinModules.flatMap((name) => [name, `node:${name}`]));
const REQUIRE = /\brequire\(\s*(["'])([^"']+)\1\s*\)|\bimport\(\s*(["'])([^"']+)\3\s*\)/g;

export function loadConfig(api = API) {
  const config = JSON.parse(readFileSync(join(api, 'release-graph.json'), 'utf8'));
  return {
    ...config,
    forbiddenFiles: config.forbiddenFiles.map((pattern) => new RegExp(pattern)),
  };
}

function packageName(specifier) {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

function resolveLocal(fromFile, specifier) {
  const base = resolve(dirname(fromFile), specifier);
  for (const candidate of [base, `${base}.js`, join(base, 'index.js')]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** First-party files reached from the entries, and the packages they require directly. */
export function walkDist(dist, entries) {
  const files = new Set();
  const direct = new Map();
  const problems = [];
  const pending = [];
  for (const entry of entries) {
    const file = join(dist, `${entry}.js`);
    if (!existsSync(file)) problems.push(`missing entry dist/${entry}.js (build first)`);
    else pending.push(file);
  }
  while (pending.length > 0) {
    const file = pending.pop();
    if (files.has(file)) continue;
    files.add(file);
    for (const match of readFileSync(file, 'utf8').matchAll(REQUIRE)) {
      const specifier = match[2] ?? match[4];
      if (specifier.startsWith('.')) {
        const local = resolveLocal(file, specifier);
        if (local && local.startsWith(dist + sep)) pending.push(local);
        else problems.push(`unresolved ${specifier} in dist/${relative(dist, file)}`);
      } else if (!BUILTINS.has(specifier)) {
        const name = packageName(specifier);
        if (!direct.has(name)) direct.set(name, new Set());
        direct.get(name).add(relative(dist, file));
      }
    }
  }
  return { files: [...files].map((file) => relative(dist, file)).sort(), direct, problems };
}

/** Where Node would find `name` when required from `fromDir`: the nearest node_modules/<name>. */
function locatePackage(name, fromDir, root) {
  for (let dir = fromDir; ; dir = dirname(dir)) {
    const candidate = join(dir, 'node_modules', name);
    if (existsSync(join(candidate, 'package.json'))) return candidate;
    if (dir === root || dir === dirname(dir)) return null;
  }
}

/**
 * Package-level closure: each package's dependencies, installed optional
 * dependencies and non-optional peers, resolved from the package's own
 * location. Keyed by location relative to the repository root.
 */
export function packageClosure(roots, root = ROOT) {
  const packages = new Map();
  const problems = [];
  const pending = roots.map((entry) => ({ ...entry, optional: false }));
  while (pending.length > 0) {
    const { name, fromDir, optional, requiredBy } = pending.pop();
    const location = locatePackage(name, fromDir, root);
    if (!location) {
      if (!optional) problems.push(`package ${name} (required by ${requiredBy}) is not installed`);
      continue;
    }
    const key = relative(root, location);
    if (packages.has(key)) continue;
    const isLink = lstatSync(location).isSymbolicLink();
    const real = realpathSync(location);
    const manifest = JSON.parse(readFileSync(join(real, 'package.json'), 'utf8'));
    packages.set(key, { name, version: manifest.version ?? '0.0.0', location, real, link: isLink ? relative(dirname(location), real) : null });
    const peersMeta = manifest.peerDependenciesMeta ?? {};
    for (const dep of Object.keys(manifest.dependencies ?? {})) pending.push({ name: dep, fromDir: real, optional: false, requiredBy: name });
    for (const dep of Object.keys(manifest.optionalDependencies ?? {})) pending.push({ name: dep, fromDir: real, optional: true, requiredBy: name });
    for (const dep of Object.keys(manifest.peerDependencies ?? {})) {
      if (!peersMeta[dep]?.optional) pending.push({ name: dep, fromDir: real, optional: false, requiredBy: name });
    }
  }
  return { packages, problems };
}

/** The full check: files, direct packages and the closure. */
export function checkRelease({ api = API, root = ROOT, config = loadConfig(api) } = {}) {
  const dist = join(api, 'dist');
  const walked = walkDist(dist, config.entries);
  const problems = [...walked.problems];
  for (const file of walked.files) {
    if (config.forbiddenFiles.some((pattern) => pattern.test(file))) problems.push(`forbidden file reached: dist/${file}`);
  }
  for (const [name, from] of walked.direct) {
    if (!config.directPackages.includes(name)) problems.push(`direct package ${name} is not reviewed for the release (from dist/${[...from][0]})`);
  }
  const roots = [
    ...[...walked.direct.keys()].map((name) => ({ name, fromDir: join(dist, dirname([...walked.direct.get(name)][0])), requiredBy: 'dist' })),
    ...config.implicitPackages.map((name) => ({ name, fromDir: dist, requiredBy: 'runtime' })),
  ];
  const closure = packageClosure(roots, root);
  problems.push(...closure.problems);
  for (const pkg of closure.packages.values()) {
    if (config.forbiddenPackages.includes(pkg.name)) problems.push(`forbidden package in the release closure: ${pkg.name}`);
  }
  return { files: walked.files, direct: [...walked.direct.keys()].sort(), packages: closure.packages, problems };
}

function copyPackage(pkg, out, root) {
  const target = join(out, relative(root, pkg.location));
  mkdirSync(dirname(target), { recursive: true });
  if (pkg.link) {
    // A workspace package (@gogospend/contracts): keep the link; its files are staged separately.
    symlinkSync(pkg.link, target);
    return;
  }
  // Nested node_modules are packages of their own: staged only if in the closure.
  cpSync(pkg.location, target, { recursive: true, verbatimSymlinks: true, filter: (source) => !relative(pkg.location, source).split(sep).includes('node_modules') });
}

/** Copies the release tree (repository layout, rooted at /app in the image) into `out`. */
export function stageRelease(out, { api = API, root = ROOT } = {}) {
  const result = checkRelease({ api, root });
  if (result.problems.length > 0) return result;
  if (existsSync(out) && readdirSync(out).length > 0) throw new Error(`stage directory ${out} is not empty`);
  const config = loadConfig(api);
  const apiOut = join(out, relative(root, api));
  for (const file of result.files) {
    const target = join(apiOut, 'dist', file);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(join(api, 'dist', file), target);
  }
  for (const dir of config.dataDirectories) cpSync(join(api, dir), join(apiOut, dir), { recursive: true });
  cpSync(join(api, 'package.json'), join(apiOut, 'package.json'));
  mkdirSync(join(apiOut, 'scripts'), { recursive: true });
  cpSync(join(api, 'scripts', 'release-smoke.cjs'), join(apiOut, 'scripts', 'release-smoke.cjs'));
  for (const pkg of result.packages.values()) {
    if (pkg.link) {
      // Workspace source: package.json and src only (no tests, no tsconfig).
      const sourceOut = join(out, relative(root, pkg.real));
      mkdirSync(sourceOut, { recursive: true });
      cpSync(join(pkg.real, 'package.json'), join(sourceOut, 'package.json'));
      cpSync(join(pkg.real, 'src'), join(sourceOut, 'src'), { recursive: true });
    }
    copyPackage(pkg, out, root);
  }
  const manifest = {
    entries: config.entries.map((entry) => `apps/api/dist/${entry}.js`),
    files: result.files.length,
    direct_packages: result.direct,
    packages: [...result.packages.values()].map((pkg) => `${pkg.name}@${pkg.version}`).sort(),
  };
  writeFileSync(join(apiOut, 'release-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return result;
}

function report(result) {
  return {
    files: result.files.length,
    direct_packages: result.direct,
    closure_packages: result.packages.size,
    problems: result.problems,
  };
}

async function main() {
  const [mode, out] = process.argv.slice(2);
  if (mode === 'check') {
    const result = checkRelease();
    process.stdout.write(`${JSON.stringify(report(result), null, 2)}\n`);
    if (result.problems.length > 0) process.exitCode = 1;
    return;
  }
  if (mode === 'stage' && out) {
    const result = stageRelease(resolve(out));
    process.stdout.write(`${JSON.stringify(report(result), null, 2)}\n`);
    if (result.problems.length > 0) process.exitCode = 1;
    return;
  }
  process.stderr.write('usage: release-graph.mjs check | stage <dir>\n');
  process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
