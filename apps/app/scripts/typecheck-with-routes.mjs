// Typechecks the app the way a developer machine sees it: with Expo Router's
// typed routes generated.
//
//   npm run typecheck:routes -w gogospend-app
//
// `expo start` writes `.expo/types/router.d.ts` (gitignored), which narrows
// every `router.push`/`Link` href to the routes under `app/`. A clean checkout
// has no such file, so `npm run typecheck:app` checks hrefs only as strings.
// This script generates the same declarations with Expo's own generator (no
// dev server, no port) into a temporary folder inside the gitignored `.expo/`
// (so `node_modules` and `@types` resolve as they do for the app), runs `tsc`
// with them added to the app's tsconfig, and removes the folder again. It
// never reads or replaces `.expo/types/router.d.ts`, so a stale copy there
// cannot hide a broken link.
//
// The generator is internal to `@expo/cli` (`@expo/router-server`'s
// typed-routes `getTypedRoutesDeclarationFile`); if a future Expo moves it,
// this script fails loudly rather than passing without the routes.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = fileURLToPath(new URL('../', import.meta.url));
const routesRoot = join(appRoot, 'app');
const require = createRequire(join(appRoot, 'package.json'));

// Expo Router reads its app root from the environment when it runs outside Metro.
process.env.EXPO_ROUTER_APP_ROOT = routesRoot;

const cliRoot = dirname(require.resolve('@expo/cli/package.json', { paths: [dirname(require.resolve('expo/package.json'))] }));
const generatorPath = require.resolve('@expo/router-server/build/typed-routes/generate', { paths: [cliRoot] });
const { getTypedRoutesDeclarationFile } = require(generatorPath);
const { requireContext } = require('expo-router/internal/testing');
const { EXPO_ROUTER_CTX_IGNORE } = require('expo-router/_ctx-shared');

const declarations = getTypedRoutesDeclarationFile(requireContext(routesRoot, true, EXPO_ROUTER_CTX_IGNORE), {});
if (typeof declarations !== 'string' || !declarations.includes('/spend/record/[id]')) {
  console.error('typecheck-with-routes: Expo did not generate the typed routes (no /spend/record/[id]).');
  process.exit(1);
}

mkdirSync(join(appRoot, '.expo'), { recursive: true });
const scratch = mkdtempSync(join(appRoot, '.expo', 'typecheck-routes-'));
try {
  writeFileSync(join(scratch, 'router.d.ts'), declarations);
  writeFileSync(join(scratch, 'expo-env.d.ts'), '/// <reference types="expo/types" />\n');
  writeFileSync(join(scratch, 'tsconfig.json'), JSON.stringify({
    extends: join(appRoot, 'tsconfig.json'),
    include: [join(appRoot, 'src'), join(appRoot, 'app'), join(scratch, 'router.d.ts'), join(scratch, 'expo-env.d.ts')],
  }, null, 2));
  const tsc = require.resolve('typescript/bin/tsc');
  const result = spawnSync(process.execPath, [tsc, '--noEmit', '-p', join(scratch, 'tsconfig.json')], { cwd: appRoot, stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
