// Writes each source in a source map's sourcesContent to an output folder.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';
const [map, out] = process.argv.slice(2);
const m = JSON.parse(readFileSync(map, 'utf8'));
mkdirSync(out, { recursive: true });
(m.sources || []).forEach((s, i) => { const c = m.sourcesContent?.[i]; if (c) { const f = join(out, basename(s)); writeFileSync(f, c); console.log(f, c.length); } });
