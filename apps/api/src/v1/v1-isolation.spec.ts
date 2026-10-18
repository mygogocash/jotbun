// The v1 process must not load the legacy Mongo/Firebase/spend stack or its
// cron jobs. Walks the static import graph from the v1 entry point - and,
// since P6b, from every release entry in release-graph.json (the API, the
// job, security and deletion workers and the migration CLI), with the same
// lists the image build enforces on the built JavaScript
// (scripts/release-graph.mjs).
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const SRC = resolve(__dirname, '..');
const ENTRY = join(SRC, 'v1', 'main.ts');
const FORBIDDEN_PACKAGES = [/^mongoose$/, /^@nestjs\/mongoose$/, /^firebase-admin(\/|$)/, /^@nestjs\/schedule$/];
const FORBIDDEN_SOURCE = [/^spend\//, /^legal-documents\//, /^product-access\//, /^analytics\//, /^user\//, /^offer\//, /^auth\/firebase/, /^app\.module\.ts$/, /^main\.ts$/];
const IMPORT = /(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)/g;
const TYPE_ONLY = /^(?:import|export)\s+type\s/;

type ReleaseGraph = { entries: string[]; directPackages: string[]; implicitPackages: string[]; forbiddenFiles: string[]; forbiddenPackages: string[] };
const RELEASE = JSON.parse(readFileSync(resolve(SRC, '..', 'release-graph.json'), 'utf8')) as ReleaseGraph;

function resolveLocal(fromFile: string, specifier: string): string | null {
  const base = specifier.startsWith('src/') ? join(SRC, specifier.slice(4)) : resolve(dirname(fromFile), specifier);
  for (const candidate of [`${base}.ts`, join(base, 'index.ts'), base]) {
    if (existsSync(candidate) && candidate.endsWith('.ts')) return candidate;
  }
  return null;
}

/** `runtimePackages`: packages imported by value (type-only imports are erased by the build). */
function importGraph(entries: string[]): { files: string[]; packages: string[]; runtimePackages: string[] } {
  const files = new Set<string>();
  const packages = new Set<string>();
  const runtimePackages = new Set<string>();
  const pending = [...entries];
  while (pending.length > 0) {
    const file = pending.pop() as string;
    if (files.has(file)) continue;
    files.add(file);
    for (const match of readFileSync(file, 'utf8').matchAll(IMPORT)) {
      const specifier = match[1] ?? match[2] ?? match[3];
      if (specifier.startsWith('.') || specifier.startsWith('src/')) {
        const local = resolveLocal(file, specifier);
        if (!local) throw new Error(`Unresolved import ${specifier} in ${relative(SRC, file)}`);
        pending.push(local);
      } else if (!specifier.startsWith('node:')) {
        const name = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0];
        packages.add(name);
        if (!TYPE_ONLY.test(match[0])) runtimePackages.add(name);
      }
    }
  }
  return { files: [...files].map((file) => relative(SRC, file)), packages: [...packages], runtimePackages: [...runtimePackages] };
}

it('the v1 entry point never reaches legacy modules or packages', () => {
  const graph = importGraph([ENTRY]);
  expect(graph.files).toContain('database/database.module.ts');
  expect(graph.files.filter((file) => FORBIDDEN_SOURCE.some((pattern) => pattern.test(file)))).toEqual([]);
  expect(graph.packages.filter((name) => FORBIDDEN_PACKAGES.some((pattern) => pattern.test(name)))).toEqual([]);
});

it('every release entry stays inside the reviewed release graph', () => {
  const entries = RELEASE.entries.map((entry) => join(SRC, `${entry}.ts`));
  for (const entry of entries) expect(existsSync(entry)).toBe(true);
  const graph = importGraph(entries);
  expect(graph.files).toEqual(expect.arrayContaining(['worker.ts', 'jobs/security-worker.ts', 'privacy/deletion-worker.ts', 'database/migrate-cli.ts', 'health/health.controller.ts', 'common/feature-gates.ts']));
  const forbiddenFiles = RELEASE.forbiddenFiles.map((pattern) => new RegExp(pattern));
  expect(graph.files.filter((file) => forbiddenFiles.some((pattern) => pattern.test(file)))).toEqual([]);
  expect(graph.files.filter((file) => FORBIDDEN_SOURCE.some((pattern) => pattern.test(file)))).toEqual([]);
  expect(graph.packages.filter((name) => RELEASE.forbiddenPackages.includes(name))).toEqual([]);
  // A new runtime package needs the dependency gate and a release-graph.json entry.
  expect(graph.runtimePackages.filter((name) => !RELEASE.directPackages.includes(name)).sort()).toEqual([]);
});

it('the walker does detect the legacy graph', () => {
  const legacy = importGraph([join(SRC, 'main.ts')]);
  expect(legacy.packages).toContain('@nestjs/mongoose');
  const forbiddenFiles = RELEASE.forbiddenFiles.map((pattern) => new RegExp(pattern));
  expect(legacy.files.some((file) => forbiddenFiles.some((pattern) => pattern.test(file)))).toBe(true);
});
