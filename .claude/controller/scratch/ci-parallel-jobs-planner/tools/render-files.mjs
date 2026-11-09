// From a GitHub job log, list each vitest file line: path, tests, duration ms.
import { readFileSync } from 'node:fs';
const text = readFileSync(process.argv[2], 'utf8').replace(/(?:\x1b|\^\[)\[[0-9;]*m/g, '');
const rows = [];
for (const line of text.split('\n')) {
  const m = /\s(src\/\S+\.test\.tsx?)\s+\((\d+) tests?(?: \| [^)]*)?\)(?:\s+\d+ \w+)?\s+(\d+(?:\.\d+)?)(ms|s)\b/.exec(line);
  if (m) rows.push({ file: m[1], tests: Number(m[2]), ms: m[4] === 's' ? Number(m[3]) * 1000 : Number(m[3]) });
}
const seen = new Map();
for (const row of rows) if (!seen.has(row.file)) seen.set(row.file, row);
const list = [...seen.values()].sort((a, b) => b.ms - a.ms);
for (const row of list) console.log(`${String(Math.round(row.ms)).padStart(7)} ms  ${String(row.tests).padStart(4)}  ${row.file}`);
console.log(`files ${list.length}, sum ${Math.round(list.reduce((s, r) => s + r.ms, 0) / 1000)} s`);
