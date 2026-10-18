// Runs pure (non-render) app tests with Node's test runner.
//   npm run test:unit -w gogospend-app                 → every src/**/*.test.ts
//   npm run test:unit -w gogospend-app -- <paths...>    → only those files
// Paths are relative to apps/app and must be src/**/*.test.ts files. Finding
// no test file is a failure, never an empty green run.
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readdirSync, realpathSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = fileURLToPath(new URL('../', import.meta.url));
const srcRoot = join(appRoot, 'src');
const PURE_TEST = /\.test\.ts$/;

// Symlinks are never followed, so a link inside src/ cannot pull in files
// from elsewhere.
function discover(dir) {
  const found = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const entry = lstatSync(path);
    if (entry.isDirectory()) found.push(...discover(path));
    else if (entry.isFile() && PURE_TEST.test(name)) found.push(path);
  }
  return found;
}

function explicit(paths) {
  const realSrc = realpathSync(srcRoot);
  return paths.map((path) => {
    const absolute = resolve(appRoot, path);
    const real = existsSync(absolute) ? realpathSync(absolute) : '';
    const insideSrc = real.startsWith(realSrc + sep) && lstatSync(real).isFile();
    if (!insideSrc || !PURE_TEST.test(real)) {
      throw new Error(`Not a pure app test under src/: ${path}`);
    }
    return real;
  });
}

try {
  const args = process.argv.slice(2);
  const files = (args.length > 0 ? explicit(args) : discover(srcRoot)).sort();
  if (files.length === 0) throw new Error('No pure app tests found under src/.');
  const result = spawnSync(process.execPath, ['--test', ...files], {
    cwd: appRoot,
    stdio: 'inherit',
  });
  process.exitCode = result.status ?? 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : 'test-unit failed.');
  process.exitCode = 1;
}
