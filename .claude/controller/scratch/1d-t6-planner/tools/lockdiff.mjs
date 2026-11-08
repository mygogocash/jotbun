// Compares two package-lock.json files: packages added, removed, changed (version or flags).
import { readFileSync } from 'node:fs';
const [a, b] = process.argv.slice(2).map((p) => JSON.parse(readFileSync(p, 'utf8')));
const pa = a.packages, pb = b.packages;
const added = [], removed = [], changed = [];
for (const k of Object.keys(pb)) if (!(k in pa)) added.push(`${k} ${pb[k].version ?? ''} ${pb[k].hasInstallScript ? 'INSTALL-SCRIPT' : ''} ${pb[k].dev ? 'dev' : ''}${pb[k].devOptional ? 'devOptional' : ''}${pb[k].optional ? 'optional' : ''} peer=${JSON.stringify(pb[k].peerDependencies ?? {})}`);
for (const k of Object.keys(pa)) if (!(k in pb)) removed.push(`${k} ${pa[k].version ?? ''}`);
for (const k of Object.keys(pa)) if (k in pb && JSON.stringify(pa[k]) !== JSON.stringify(pb[k])) {
  const fields = new Set([...Object.keys(pa[k]), ...Object.keys(pb[k])]);
  const diffs = [...fields].filter((f) => JSON.stringify(pa[k][f]) !== JSON.stringify(pb[k][f])).map((f) => `${f}: ${JSON.stringify(pa[k][f])} -> ${JSON.stringify(pb[k][f])}`);
  changed.push(`${k || '(root)'}: ${diffs.join('; ')}`);
}
console.log(`added ${added.length}\n  ${added.join('\n  ')}\nremoved ${removed.length}\n  ${removed.join('\n  ')}\nchanged ${changed.length}\n  ${changed.join('\n  ')}`);
console.log('top-level keys equal except packages:', JSON.stringify({ ...a, packages: 0 }) === JSON.stringify({ ...b, packages: 0 }));
