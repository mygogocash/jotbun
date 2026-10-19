// The locale catalogs against the copy the app shows (redesign E2, approved
// 19 October 2026). Copy is looked up by its English text, so a string missing
// from en.json, or a key missing from th.json, silently renders English: these
// tests make that loud.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const appRoot = fileURLToPath(new URL('../../', import.meta.url));
const read = (locale: string): Record<string, string> => JSON.parse(readFileSync(join(appRoot, 'src/messages', `${locale}.json`), 'utf8'));
const en = read('en');

const placeholders = (text: string) => [...text.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((match) => match[1]).sort();

test('th.json translates every key in en.json', () => {
  const th = read('th');
  const missing = Object.keys(en).filter((key) => typeof th[key] !== 'string' || th[key].trim() === '');
  assert.deepEqual(missing, [], `${missing.length} keys have no Thai text`);
});

// Vietnamese is not being translated for now (owner, 19 October 2026): a key it
// lacks shows the English. What it does have must still fit en.json.
for (const locale of ['th', 'vi'] as const) {
  test(`${locale}.json has only en.json's keys, each keeping its placeholders`, () => {
    const catalog = read(locale);
    const extra = Object.keys(catalog).filter((key) => !(key in en));
    assert.deepEqual(extra, [], `${locale}.json has keys en.json does not`);
    const changed = Object.keys(catalog).filter((key) => placeholders(en[key]).join() !== placeholders(catalog[key]).join());
    assert.deepEqual(changed, [], `${locale} text that drops or renames a {placeholder}`);
  });
}

/** The redesign's own code: every literal it passes to `tc(...)` must be English copy in en.json. */
const REDESIGN = ['src/screens/redesign', 'src/ui', 'src/mascot', 'src/spend/v1/redesign'];
const CALL = /\btc\(\s*(['"])((?:\\.|(?!\1).)*)\1/g;

/**
 * Folders skipped here while their area's copy stays out of the catalogs. None
 * is skipped now: R4–R7's copy (`planning/`, `insights/`, `account/` and
 * `import/` folders) is in the catalogs, with Thai, pending the owner's E2
 * approval of checkpoints 2–5, so every literal in those folders is checked
 * too. Their templates that reach `tc` through a variable or a table are
 * checked from each model's own test (`spend/v1/redesign/testing/catalog.ts`).
 */
const AWAITING_E2 = new Set<string>();

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return AWAITING_E2.has(name) ? [] : sources(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

test('every literal the redesign passes to tc() is copy in en.json', () => {
  const english = new Set(Object.values(en));
  const missing = new Set<string>();
  for (const file of REDESIGN.flatMap((dir) => sources(join(appRoot, dir)))) {
    for (const match of readFileSync(file, 'utf8').matchAll(CALL)) {
      const text = match[2].replace(/\\(['"\\])/g, '$1');
      if (!english.has(text)) missing.add(`${text}  (${file.slice(appRoot.length)})`);
    }
  }
  assert.deepEqual([...missing], []);
});
