// ci-parallel-jobs probes: the RED, a control and 19 workflow mutants for
// scripts/ci/backend-workflow.test.mjs. Each probe is a small tree under
// <scratch>/probes/<name>/ holding the files the test reads, copied from <tree>
// (a worktree, or any tree with the task's final files). Nothing is ever written
// into <tree>.
//
//   node <PL>/tools/probes.mjs <tree> <scratch> [red|control|mutants|all]
//
// red      the tree's test file and handover against the workflow before this task
//          (<PL>/orig).
// control  the tree's own files, unchanged.
// mutants  M1 to M19, each one exact edit of the tree's backend.yml, and A1, a correct
//          two-way split that only the exact layout case rejects.
//
// Each probe runs `node --test --test-reporter=tap` on its copy of the test file
// and compares the failing case names with the expected set. The exit code is 1
// if any probe differs.
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [tree, scratch, which = 'all'] = process.argv.slice(2);
if (!tree || !scratch) {
  console.error('usage: node probes.mjs <tree> <scratch> [red|control|mutants|all]');
  process.exit(2);
}
const PL = fileURLToPath(new URL('../', import.meta.url));
const CASES = 9;

const PARSER = 'the workflow parser sees steps, their settings and the jobs they run in';
const PARITY = 'every local gate command runs in CI with the same settings';
const SPLIT = 'the render suite runs every test exactly once across its jobs';
const LAYOUT = 'each job runs its own steps, in order';
const EDGE = 'the edge steps run in the edge job in order, the workers suite between the unit tests and the build';
const GUARD = 'no job or step can be switched off: no if: and no continue-on-error:';
const OPS = 'the ops suite in CI fails, not skips, when its database is unreachable';

const WORKFLOW = '.github/workflows/backend.yml';
const TEST = 'scripts/ci/backend-workflow.test.mjs';
const INPUTS = [
  TEST,
  WORKFLOW,
  'docs/implementation/handover.md',
  'apps/api/Dockerfile',
  '.nvmrc',
  'apps/app/src/dev/catalogue/CatalogueScreen.render.test.tsx',
  'apps/app/src/dev/catalogue/screenReader.render.test.tsx',
];

const RENDER = '      - run: npm run test:render -w gogospend-app';
const SECTIONS = 'src/dev/catalogue/CatalogueScreen.render.test.tsx src/dev/catalogue/screenReader.render.test.tsx';
const REST = `${RENDER} -- --exclude src/dev/catalogue/CatalogueScreen.render.test.tsx --exclude src/dev/catalogue/screenReader.render.test.tsx\n`;
const P1 = "-t '^section (?:[a-z0-9-]{3})+(?![a-z0-9-])'";
const P2 = "-t '^section (?:[a-z0-9-]{3})*[a-z0-9-](?![a-z0-9-])'";
const P3 = "-t '^(?!section (?:[a-z0-9-]{3})+(?![a-z0-9-]))(?!section (?:[a-z0-9-]{3})*[a-z0-9-](?![a-z0-9-]))'";
const step = (command) => `      - run: ${command}\n`;
const OPS_STEP = `${step('npm run test:ops')}        env:\n          GOGOSPEND_OPS_REQUIRE_DB: '1'\n`;

/** Replace `from` with `to` where it occurs, which must be exactly `count` times, or stop. */
function times(text, from, to, count, name) {
  const found = text.split(from).length - 1;
  if (found !== count) throw new Error(`${name}: the anchor is in backend.yml ${found} times, not ${count}`);
  return text.split(from).join(to);
}
const once = (text, from, to, name) => times(text, from, to, 1, name);

const MUTANTS = [
  { name: 'M1', what: 'part 2 dropped: ids of length 3n+1 run nowhere', edit: (t) => once(t, `${RENDER} -- ${SECTIONS} ${P2}\n`, '', 'M1'), fails: [PARITY, SPLIT, LAYOUT] },
  { name: 'M2', what: "part 2 runs part 1's pattern: 3n twice, 3n+1 nowhere", edit: (t) => once(t, P2, P1, 'M2'), fails: [PARITY, SPLIT, LAYOUT] },
  { name: 'M3', what: "part 2's pattern matches nothing: 3n+1 nowhere", edit: (t) => once(t, P2, `${P2.slice(0, -1)}x'`, 'M3'), fails: [PARITY, SPLIT, LAYOUT] },
  { name: 'M4', what: 'the last pattern stops negating part 2: 3n+1 twice', edit: (t) => once(t, P3, "-t '^(?!section (?:[a-z0-9-]{3})+(?![a-z0-9-]))'", 'M4'), fails: [PARITY, SPLIT, LAYOUT] },
  { name: 'M5', what: 'the parts leave out the screen reader suite: it runs nowhere', edit: (t) => times(t, ' src/dev/catalogue/screenReader.render.test.tsx -t', ' -t', 3, 'M5'), fails: [PARITY, SPLIT, LAYOUT] },
  { name: 'M6', what: 'the render job excludes the whole catalogue folder: two files run nowhere', edit: (t) => once(t, REST, `${RENDER} -- --exclude src/dev/catalogue/**\n`, 'M6'), fails: [PARITY, SPLIT, LAYOUT] },
  { name: 'M7', what: 'the render job excludes nothing: the per-section suites run twice', edit: (t) => once(t, REST, `${RENDER}\n`, 'M7'), fails: [SPLIT, LAYOUT] },
  { name: 'M8', what: 'the screen reader path miscased in all four steps (a case-insensitive disk still finds it)', edit: (t) => times(t, 'catalogue/screenReader.render', 'catalogue/screenreader.render', 4, 'M8'), fails: [PARITY, SPLIT, LAYOUT] },
  { name: 'M9', what: 'test:unit dropped', edit: (t) => once(t, step('npm run test:unit'), '', 'M9'), fails: [PARITY, LAYOUT] },
  { name: 'M10', what: 'the ops suite loses GOGOSPEND_OPS_REQUIRE_DB', edit: (t) => once(t, OPS_STEP, step('npm run test:ops'), 'M10'), fails: [PARITY, OPS] },
  { name: 'M11', what: 'the workers suite moved to the database job', edit: (t) => once(once(t, step('npm run test:edge:workers'), '', 'M11'), step('npm run test:db'), step('npm run test:db') + step('npm run test:edge:workers'), 'M11'), fails: [LAYOUT, EDGE] },
  { name: 'M12', what: 'the edge job no longer builds the API before its suites', edit: (t) => once(t, step('npm run build -w gogospend-api') + step('npm run install:edge'), step('npm run install:edge'), 'M12'), fails: [LAYOUT] },
  { name: 'M13', what: 'test:ops moved to the edge job', edit: (t) => once(once(t, OPS_STEP, '', 'M13'), step('npm run test:edge:db'), step('npm run test:edge:db') + OPS_STEP, 'M13'), fails: [LAYOUT] },
  { name: 'M14', what: 'if: false on a job', edit: (t) => once(t, '  sections-3:\n', '  sections-3:\n    if: false\n', 'M14'), fails: [GUARD] },
  { name: 'M15', what: 'if: on a step', edit: (t) => once(t, step('npm run test:db'), "      - if: github.event_name == 'push'\n        run: npm run test:db\n", 'M15'), fails: [GUARD] },
  { name: 'M16', what: 'continue-on-error: true on a step', edit: (t) => once(t, step('npm run test:edge:workers'), `${step('npm run test:edge:workers')}        continue-on-error: true\n`, 'M16'), fails: [GUARD] },
  { name: 'M17', what: 'the iOS export dropped', edit: (t) => once(t, step('npm run export:ios -w gogospend-app -- --max-workers 2'), '', 'M17'), fails: [PARITY, LAYOUT] },
  { name: 'M18', what: 'typecheck:routes dropped', edit: (t) => once(t, step('npm run typecheck:routes -w gogospend-app'), '', 'M18'), fails: [PARITY, LAYOUT] },
  { name: 'M19', what: 'the iOS export moved to the checks job', edit: (t) => once(once(t, step('npm run export:ios -w gogospend-app -- --max-workers 2'), '', 'M19'), step('npm run test:dev'), step('npm run test:dev') + step('npm run export:ios -w gogospend-app -- --max-workers 2'), 'M19'), fails: [LAYOUT] },
  // Not a mutant: a correct split of another shape passes the split case, and only the exact layout differs.
  {
    name: 'A1',
    what: 'not a mutant: a correct two-way split by id parity',
    edit: (t) => once(once(once(t, P1, "-t '^section (?:[a-z0-9-]{2})+(?![a-z0-9-])'", 'A1'), P2, "-t '^(?!section (?:[a-z0-9-]{2})+(?![a-z0-9-]))'", 'A1'), `${RENDER} -- ${SECTIONS} ${P3}\n`, '', 'A1'),
    fails: [LAYOUT],
  },
];

/** Builds <scratch>/probes/<name> from the tree, with `overrides` (relative path -> text). */
function probe(name, overrides) {
  const root = join(scratch, 'probes', name);
  rmSync(root, { recursive: true, force: true });
  for (const path of INPUTS) {
    const target = join(root, path);
    mkdirSync(dirname(target), { recursive: true });
    if (path in overrides) writeFileSync(target, overrides[path]);
    else copyFileSync(join(tree, path), target);
  }
  return root;
}

function run(name, root, expected, what) {
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', join(root, TEST)], { encoding: 'utf8' });
  const out = `${result.stdout}${result.stderr}`;
  writeFileSync(join(scratch, `probe-${name}.log`), out);
  const count = (key) => Number(new RegExp(`^# ${key} (\\d+)$`, 'm').exec(out)?.[1] ?? NaN);
  const failed = [...out.matchAll(/^not ok \d+ - (.*)$/gm)].map((match) => match[1]).sort();
  const ok = JSON.stringify(failed) === JSON.stringify([...expected].sort()) && count('tests') === CASES;
  const verdict = expected.length === 0 ? (ok ? 'passes' : 'MISMATCH') : ok ? 'fails as expected' : 'MISMATCH';
  console.log(`${name.padEnd(8)} tests ${count('tests')} pass ${count('pass')} fail ${count('fail')}  ${verdict}  (${what})`);
  for (const test of failed) console.log(`         not ok: ${test}`);
  return ok;
}

let good = true;
if (which === 'red' || which === 'all') {
  const root = probe('red', { [WORKFLOW]: readFileSync(join(PL, 'orig', WORKFLOW), 'utf8') });
  good = run('red', root, [PARSER, PARITY, SPLIT, LAYOUT, EDGE], 'the new test and handover against the workflow before this task') && good;
}
if (which === 'control' || which === 'all') {
  good = run('control', probe('control', {}), [], "the tree's own files") && good;
}
if (which === 'mutants' || which === 'all') {
  const workflow = readFileSync(join(tree, WORKFLOW), 'utf8');
  for (const mutant of MUTANTS) {
    good = run(mutant.name, probe(mutant.name, { [WORKFLOW]: mutant.edit(workflow) }), mutant.fails, mutant.what) && good;
  }
}
process.exit(good ? 0 : 1);
