// Balance of candidate splits of the catalogue's per-section cases, from a CI job log
// (per-case durations) and, optionally, the P2 plan's planned bw- section ids (counted
// at the median per-section time).
import { readFileSync } from 'node:fs';
const [log, plan] = process.argv.slice(2);
const text = readFileSync(log, 'utf8').replace(/(?:\x1b|\^\[)\[[0-9;]*m/g, '');
const cases = [];
let others = 0;
let inCatalogue = false;
for (const line of text.split('\n')) {
  if (/✓ src\/dev\/catalogue\/CatalogueScreen\.render\.test\.tsx/.test(line)) { inCatalogue = true; continue; }
  if (/✓ src\//.test(line) || /❯ src\//.test(line)) { inCatalogue = false; }
  const m = /✓ section (\S+) renders without errors in light and dark, in en, th and vi\s+(\d+)ms/.exec(line);
  if (m) { cases.push({ name: `section ${m[1]} renders without errors in light and dark, in en, th and vi`, ms: Number(m[2]) }); continue; }
  const o = inCatalogue && /^\S+\s+\S+\s+\S+\s+✓ (.+?)\s+(\d+)ms$/.exec(line.replace(/\t/g, ' '));
  if (o) others += Number(o[2]);
}
const sorted = cases.map((c) => c.ms).sort((a, b) => a - b);
const median = sorted[Math.floor(sorted.length / 2)];
let planned = [];
if (plan) planned = [...new Set([...readFileSync(plan, 'utf8').matchAll(/`(bw-[a-z0-9-]+)`/g)].map((m) => m[1]))]
  .filter((id) => !cases.some((c) => c.name.startsWith(`section ${id} `)))
  .map((id) => ({ name: `section ${id} renders without errors in light and dark, in en, th and vi`, ms: median }));
const splits = {
  'first letter a-p': /^section [a-p]/,
  'first letter a-o': /^section [a-o]/,
  'last char a-m': /^section \S*[a-m] renders/,
  'last char a-k': /^section \S*[a-k] renders/,
  'even-length id': /^section (?:\S\S)+ renders/,
};
const sum = (list) => Math.round(list.reduce((s, c) => s + c.ms, 0) / 1000);
console.log(`cases ${cases.length} (${sum(cases)} s), other catalogue cases ${Math.round(others / 1000)} s, median ${median} ms, planned bw- ids not yet present ${planned.length}`);
for (const [label, re] of Object.entries(splits)) {
  const x = cases.filter((c) => re.test(c.name)); const y = cases.filter((c) => !re.test(c.name));
  const px = planned.filter((c) => re.test(c.name)); const py = planned.filter((c) => !re.test(c.name));
  console.log(`${label.padEnd(18)} now: X ${x.length} cases ${sum(x)} s | Y ${y.length} cases ${sum(y)} s (+ ${Math.round(others / 1000)} s other)   with planned bw-: X ${x.length + px.length} ${sum([...x, ...px])} s | Y ${y.length + py.length} ${sum([...y, ...py])} s`);
}
