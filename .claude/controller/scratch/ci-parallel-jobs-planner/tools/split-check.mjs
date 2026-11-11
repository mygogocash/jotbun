// ci-parallel-jobs split check: reads the render steps from <tree>'s workflow and asks vitest
// (`vitest list`, which collects tests without running them) whether they run every render
// test exactly once:
//   - files: the step with only --exclude arguments plus the split files = every render file,
//     with no file in both;
//   - tests: the name patterns' lists of the split files' tests are disjoint, and together
//     they are the unfiltered list.
// The counts it prints move with the head; only the two properties are checked.
//
//   node <PL>/tools/split-check.mjs <tree> <logdir> [workflow]
//
// <tree> needs node_modules (a worktree after npm ci). [workflow] defaults to <tree>'s own
// .github/workflows/backend.yml. Logs go to <logdir>/split-*.log.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [tree, logdir, workflowPath = join(tree, '.github/workflows/backend.yml')] = process.argv.slice(2);
if (!tree || !logdir) {
  console.error('usage: node split-check.mjs <tree> <logdir> [workflow]');
  process.exit(2);
}
mkdirSync(logdir, { recursive: true });
const app = join(tree, 'apps/app');
const vitest = join(tree, 'node_modules/.bin/vitest');

const steps = [...readFileSync(workflowPath, 'utf8').matchAll(/^ +- run: npm run test:render -w gogospend-app -- (.*)$/gm)].map((match) => match[1]);
const rest = steps.filter((args) => /^--exclude \S+(?: --exclude \S+)*$/.test(args)).map((args) => [...args.matchAll(/--exclude (\S+)/g)].map((match) => match[1]));
const parts = steps.map((args) => /^((?:\S+\.tsx )+)-t '([^']+)'$/.exec(args)).filter(Boolean).map((match) => ({ files: match[1].trim().split(' '), pattern: match[2] }));
if (rest.length !== 1 || parts.length < 2 || rest.length + parts.length !== steps.length) {
  console.log(`MISMATCH: expected one --exclude step and two or more -t steps, found ${steps.length} render steps`);
  process.exit(1);
}
const split = rest[0];

/** Runs `vitest list --config vitest.render.config.ts <args>` in apps/app; returns its `src/...` lines, sorted. */
function list(name, args) {
  const result = spawnSync(vitest, ['list', '--config', 'vitest.render.config.ts', ...args], { cwd: app, encoding: 'utf8' });
  const out = `${result.stdout}${result.stderr}`;
  writeFileSync(join(logdir, `split-${name}.log`), `$ vitest list --config vitest.render.config.ts ${args.join(' ')}\nexit ${result.status}\n${out}`);
  if (result.status !== 0) throw new Error(`vitest list ${name} exited ${result.status}; see split-${name}.log`);
  return out.split('\n').filter((line) => line.startsWith('src/')).sort();
}

let good = true;
const check = (ok, text) => {
  console.log(`${ok ? 'ok      ' : 'MISMATCH'} ${text}`);
  good = good && ok;
};

const allFiles = list('files-all', ['--filesOnly']);
const restFiles = list('files-rest', ['--filesOnly', ...split.flatMap((file) => ['--exclude', file])]);
const splitFiles = list('files-split', ['--filesOnly', ...split]);
check(new Set(allFiles).size === allFiles.length, `render files: ${allFiles.length}, none listed twice`);
check(restFiles.every((file) => !splitFiles.includes(file)), `the --exclude step runs ${restFiles.length} files, none of the ${splitFiles.length} split files`);
check(JSON.stringify([...restFiles, ...splitFiles].sort()) === JSON.stringify(allFiles), 'those files and the split files are every render file');
check(JSON.stringify(splitFiles) === JSON.stringify([...split].sort()), `the split files are exactly ${split.join(' ')}`);

const allNames = list('names-all', split);
const seen = new Map();
parts.forEach((part, index) => {
  const names = list(`names-part-${index + 1}`, [...part.files, '-t', part.pattern]);
  console.log(`         part ${index + 1}: ${names.length} tests (${part.pattern})`);
  for (const name of names) seen.set(name, (seen.get(name) ?? 0) + 1);
});
const twice = [...seen].filter(([, count]) => count > 1).map(([name]) => name);
const nowhere = allNames.filter((name) => !seen.has(name));
const extra = [...seen.keys()].filter((name) => !allNames.includes(name));
check(twice.length === 0, `no test is in two parts${twice.length ? `: ${twice.slice(0, 3).join(' | ')}` : ''}`);
check(nowhere.length === 0 && extra.length === 0, `the parts together are all ${allNames.length} tests of the split files${nowhere.length ? `; missing: ${nowhere.slice(0, 3).join(' | ')}` : ''}`);
console.log(good ? 'SPLIT OK' : 'SPLIT MISMATCH');
process.exit(good ? 0 : 1);
