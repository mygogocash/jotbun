// Balance of catalogue section cases split by id length modulo k (k = 2, 3, 4), from a CI
// job log's per-case durations, now and with the P2 plan's planned bw- ids at the median.
// Usage: node residue-balance.mjs <gate-log> [p2-plan.md]
import { readFileSync } from 'node:fs';
const [log, plan] = process.argv.slice(2);
const text = readFileSync(log, 'utf8').replace(/(?:\x1b|\^\[)\[[0-9;]*m/g, '');
const cases = new Map();
for (const m of text.matchAll(/✓ section (\S+) renders without errors in light and dark, in en, th and vi\s+(\d+)ms/g)) {
  if (!cases.has(m[1])) cases.set(m[1], Number(m[2]));
}
const times = [...cases.values()].sort((a, b) => a - b);
const median = times[Math.floor(times.length / 2)];
const planned = plan
  ? [...new Set([...readFileSync(plan, 'utf8').matchAll(/`(bw-[a-z0-9-]+)`/g)].map((m) => m[1]))].filter((id) => !cases.has(id))
  : [];
const total = (ids) => Math.round(ids.reduce((s, [, ms]) => s + ms, 0) / 1000);
console.log(`cases ${cases.size}, ${total([...cases])} s, median ${median} ms; planned bw- ids not yet present ${planned.length}`);
for (const k of [2, 3, 4]) {
  const now = Array.from({ length: k }, () => []);
  const later = Array.from({ length: k }, () => []);
  for (const entry of cases) { now[entry[0].length % k].push(entry); later[entry[0].length % k].push(entry); }
  for (const id of planned) later[id.length % k].push([id, median]);
  console.log(`len mod ${k}: now ${now.map((p, r) => `r${r} ${p.length}/${total(p)}s`).join(' | ')}   with planned: ${later.map((p, r) => `r${r} ${p.length}/${total(p)}s`).join(' | ')}`);
}
