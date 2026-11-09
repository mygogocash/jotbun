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
 * Folders skipped here while their area's copy stays out of the catalogs.
 * `signin/` (1C-T8: the sign-in, terms, session-ended, devices and reminder
 * drafts) awaits the owner's E2 approval: its new lines are Thai drafts in
 * its own `draftCopy.ts`, checked by the two tests after this one, and 1C-T9
 * moves them into the catalogs and empties this set again. R4–R7's copy
 * (`planning/`, `insights/`, `account/` and `import/` folders) is in the
 * catalogs, with Thai, so every literal in those folders is checked too.
 * Their templates that reach `tc` through a variable or a table are checked
 * from each model's own test (`spend/v1/redesign/testing/catalog.ts`).
 */
const AWAITING_E2 = new Set<string>(['signin']);

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

// 1C-T8's drafts (`signin/`, awaiting E2): new lines go through the folder's
// own copy hook, which its screens name `sc` (`useSigninCopy`), and its Thai
// comes from `DRAFT_TH`; words the screens keep from today stay on `tc`.
const SIGNIN = join(appRoot, 'src/screens/redesign/signin');
const DRAFT_CALL = /\bsc\(\s*(['"])((?:\\.|(?!\1).)*)\1/g;

function signinLiterals(pattern: RegExp): Map<string, string> {
  const found = new Map<string, string>();
  for (const file of readdirSync(SIGNIN).filter((name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)).map((name) => join(SIGNIN, name))) {
    for (const match of readFileSync(file, 'utf8').matchAll(pattern)) {
      const text = match[2].replace(/\\(['"\\])/g, '$1');
      if (!found.has(text)) found.set(text, file.slice(appRoot.length));
    }
  }
  return found;
}

test('every literal the signin folder passes to its copy hook has a Thai draft', async () => {
  const { DRAFT_TH } = await import('../screens/redesign/signin/draftCopy.ts');
  const literals = signinLiterals(DRAFT_CALL);
  // The pattern finds the screens' lines (it would pass on none).
  assert.equal(literals.has('Enter the 6-digit code sent to'), true);
  const missing = [...literals].filter(([english]) => !Object.hasOwn(DRAFT_TH, english)).map(([english, file]) => `${english}  (${file})`);
  assert.deepEqual(missing, [], 'lines with no Thai draft');
  const unused = Object.keys(DRAFT_TH).filter((english) => !literals.has(english));
  assert.deepEqual(unused, [], 'drafts no screen shows');
  for (const [english, thai] of Object.entries(DRAFT_TH)) {
    assert.match(thai, /[\u0E00-\u0E7F]/, english);
    assert.deepEqual(placeholders(thai), placeholders(english), english);
  }
});

test('every literal the signin folder passes to tc() is approved copy already in en.json', () => {
  const english = new Set(Object.values(en));
  const missing = [...signinLiterals(CALL)].filter(([text]) => !english.has(text)).map(([text, file]) => `${text}  (${file})`);
  assert.deepEqual(missing, []);
});
