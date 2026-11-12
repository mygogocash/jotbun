#!/usr/bin/env node
// P3-T5 probe: what Metro keeps of a file in a release build and in a development build.
// Usage: node release-fold.cjs <tree root> <path under apps/app> [module to look for]
//
// For iOS and web it runs the file the way Expo's Metro does with this app's
// defaults (no babel.config.js, no metro.config.js): babel-preset-expo with
// Metro's caller; then, in a release build only, Metro's constant folding
// (as @expo/metro-config's transform worker does before it collects
// dependencies); then Expo's dependency collector. It prints each build's
// dependencies and the code the folding left. Exit 0 when the module is a
// dependency of both development builds and of neither release build.
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

const [root, rel, wanted = '@mobile/dev/draftTally'] = process.argv.slice(2);
const app = path.join(root, 'apps/app');
const load = createRequire(path.join(app, 'package.json'));
const babel = load('@babel/core');
const generate = load('@babel/generator').default;
const { constantFoldingPlugin } = load('metro-transform-plugins');
const collectDependencies = load('@expo/metro-config/build/transform-worker/collect-dependencies').default;

const filename = path.join(app, rel);
const code = fs.readFileSync(filename, 'utf8');
let ok = true;
for (const isDev of [false, true]) {
  for (const platform of ['ios', 'web']) {
    const caller = { name: 'metro', bundler: 'metro', platform, isDev, isServer: false, isNodeModule: false, isHMREnabled: isDev, engine: platform === 'ios' ? 'hermes' : undefined };
    let ast = babel.transformSync(code, {
      filename, cwd: app, ast: true, code: false, babelrc: false, configFile: false, sourceType: 'unambiguous',
      presets: [[load.resolve('babel-preset-expo'), {}]], caller,
    }).ast;
    if (!isDev) {
      ast = babel.transformFromAstSync(ast, '', { filename, ast: true, code: false, babelrc: false, configFile: false, plugins: [constantFoldingPlugin], cloneInputAst: false }).ast;
    }
    const folded = generate(ast).code;
    const { dependencies } = collectDependencies(ast, {
      asyncRequireModulePath: 'expo/internal/async-require-module', dynamicRequires: 'reject', inlineableCalls: [],
      keepRequireNames: isDev, allowOptionalDependencies: false, dependencyMapName: null, unstable_allowRequireContext: false,
      unstable_isESMImportAtSource: null, collectOnly: false,
    });
    const names = dependencies.map((dependency) => dependency.name);
    const has = names.includes(wanted);
    const build = `${isDev ? 'development' : 'release'} ${platform}`;
    console.log(`${build}: dependencies ${JSON.stringify(names)}; ${wanted} ${has ? 'KEPT' : 'dropped'}`);
    const line = folded.split('\n').find((text) => /\btally = /.test(text)) ?? '(no tally line)';
    console.log(`  ${line.trim().slice(0, 200)}`);
    if (has === isDev) continue;
    ok = false;
  }
}
console.log(ok ? 'OK: the tally is a dependency of the development builds only' : 'FAIL: a release build keeps the tally, or a development build lost it');
process.exit(ok ? 0 : 1);
