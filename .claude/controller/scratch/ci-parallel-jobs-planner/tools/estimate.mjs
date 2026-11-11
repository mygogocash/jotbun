// Expected job times for ci-parallel-jobs' nine jobs, from the step times of measured runs of the
// old three-job workflow. Every number is a sum of measured steps, except two estimates, marked:
//   - typecheck:routes = the run's typecheck:app (the same tsc run, plus Expo's route generator);
//   - the iOS export = 1.2 x the run's export:web (5757 modules to 4791) + 15 s for hermesc.
// Render and per-section times need the run's gate log (raw/gate-<id>.log): every render file but
// the two per-section suites over 2 workers, and each section part's slowest suite, each plus the
// vitest start-up the full run spent per worker (import, setup, environment, transform / 2).
//
//   node estimate.mjs <evidence-dir> <raw-dir> <run-id> ...
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const [evidence, raw, ...ids] = process.argv.slice(2);
const secs = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 1000);
const residue = (id) => id.length % 3;

for (const id of ids) {
  const { jobs } = JSON.parse(readFileSync(join(evidence, `jobs-${id}.json`), 'utf8'));
  const wall = Math.max(...jobs.map((job) => Date.parse(job.completed_at))) - Math.min(...jobs.map((job) => Date.parse(job.created_at)));
  const step = (job, re) => job.steps.filter((s) => re.test(s.name)).reduce((sum, s) => sum + secs(s.started_at, s.completed_at), 0);
  const gate = jobs.find((job) => job.name.startsWith('Typecheck'));
  const db = jobs.find((job) => job.name.startsWith('SQL'));
  const image = jobs.find((job) => job.name.startsWith('Release'));
  // Set up, checkout, setup-node, install and the post steps: what every npm job pays.
  const setup = (job) => step(job, /^(Set up job|Run actions\/checkout|Run actions\/setup-node|Install|Run npm ci|Post |Complete job)/);
  const o = setup(gate);
  const typecheckApp = step(gate, /typecheck:app$/);
  const web = step(gate, /export:web/);
  const ios = Math.round(1.2 * web + 15);
  const checks = o + step(gate, /run typecheck$/) + typecheckApp + typecheckApp + step(gate, /test:api|test:app|test:unit|test:dev|build -w gogospend-api|Release graph|Parser sandbox|Whitespace/);
  const exportsJob = o + web + ios;
  const database = setup(db) + step(db, /test:db$|test:ops/);
  const edge = setup(db) + step(db, /build -w gogospend-api|install:edge|typecheck:edge|test:edge$|test:edge:workers|build:edge|test:edge:db/) + 18;
  const imageJob = secs(image.started_at, image.completed_at);
  let render = null;
  let sections = null;
  const log = join(raw, `gate-${id}.log`);
  if (existsSync(log)) {
    const text = readFileSync(log, 'utf8').replace(/(?:\x1b|\^\[)\[[0-9;]*m/g, '');
    const file = (name) => Number(new RegExp(`${name.replace(/\./g, '\\.')} \\(\\d+ tests?[^)]*\\)\\s+(\\d+)ms`).exec(text)?.[1] ?? 0) / 1000;
    const total = Number(/Duration\s+[\d.]+s \(transform ([\d.]+)s, setup ([\d.]+)s, import ([\d.]+)s, tests ([\d.]+)s, environment ([\d.]+)s/.exec(text)?.slice(1).reduce((s, v, i) => (i === 3 ? s : s + Number(v)), 0) ?? 0);
    const tests = Number(/Duration\s+[\d.]+s \(transform [\d.]+s, setup [\d.]+s, import [\d.]+s, tests ([\d.]+)s/.exec(text)?.[1] ?? 0);
    const startup = total / 2;
    const catalogue = file('src/dev/catalogue/CatalogueScreen.render.test.tsx');
    const reader = file('src/dev/catalogue/screenReader.render.test.tsx');
    const parts = [0, 0, 0];
    const readerParts = [0, 0, 0];
    for (const m of text.matchAll(/✓ section (\S+) renders without errors in light and dark, in en, th and vi\s+(\d+)ms/g)) parts[residue(m[1])] += Number(m[2]) / 1000;
    for (const m of text.matchAll(/✓ section (\S+?): every control has a name, nothing hidden takes focus\s+(\d+)ms/g)) readerParts[residue(m[1])] += Number(m[2]) / 1000;
    parts[2] += Math.max(0, catalogue - parts.reduce((a, b) => a + b, 0)); // the catalogue's other cases run in part 3
    render = Math.round(o + (tests - catalogue - reader) / 2 + startup);
    sections = parts.map((part, k) => Math.round(o + Math.max(part, readerParts[k]) + 25));
  }
  const times = { checks, exports: exportsJob, render, 'sections-1': sections?.[0], 'sections-2': sections?.[1], 'sections-3': sections?.[2], database, edge, image: imageJob };
  const known = Object.values(times).filter((value) => value !== null && value !== undefined);
  console.log(`run ${id}: old wall ${Math.round(wall / 1000)} s; new jobs: ${Object.entries(times).map(([k, v]) => `${k} ${v ?? '-'}`).join(', ')}; new wall about ${Math.max(...known) + 3} s (slowest job + 3 s queue)`);
}
