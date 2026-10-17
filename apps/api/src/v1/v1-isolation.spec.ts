// The v1 process must not load the legacy Mongo/Firebase/spend stack or its
// cron jobs. Walks the static import graph from the v1 entry point.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const SRC = resolve(__dirname, '..');
const ENTRY = join(SRC, 'v1', 'main.ts');
const FORBIDDEN_PACKAGES = [/^mongoose$/, /^@nestjs\/mongoose$/, /^firebase-admin(\/|$)/, /^@nestjs\/schedule$/];
const FORBIDDEN_SOURCE = [/^spend\//, /^legal-documents\//, /^product-access\//, /^analytics\//, /^user\//, /^offer\//, /^auth\/firebase/, /^app\.module\.ts$/, /^main\.ts$/];
const IMPORT = /(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)/g;

function resolveLocal(fromFile: string, specifier: string): string | null {
  const base = specifier.startsWith('src/') ? join(SRC, specifier.slice(4)) : resolve(dirname(fromFile), specifier);
  for (const candidate of [`${base}.ts`, join(base, 'index.ts'), base]) {
    if (existsSync(candidate) && candidate.endsWith('.ts')) return candidate;
  }
  return null;
}

function importGraph(entry: string): { files: string[]; packages: string[] } {
  const files = new Set<string>();
  const packages = new Set<string>();
  const pending = [entry];
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
      } else {
        packages.add(specifier);
      }
    }
  }
  return { files: [...files].map((file) => relative(SRC, file)), packages: [...packages] };
}

it('the v1 entry point never reaches legacy modules or packages', () => {
  const graph = importGraph(ENTRY);
  expect(graph.files).toContain('database/database.module.ts');
  expect(graph.files.filter((file) => FORBIDDEN_SOURCE.some((pattern) => pattern.test(file)))).toEqual([]);
  expect(graph.packages.filter((name) => FORBIDDEN_PACKAGES.some((pattern) => pattern.test(name)))).toEqual([]);
});

it('the walker does detect the legacy graph', () => {
  const legacy = importGraph(join(SRC, 'main.ts'));
  expect(legacy.packages).toContain('@nestjs/mongoose');
});
