// Test use only (it reads files, so nothing the app bundles may import it).
// Copy is looked up by its English text: a template a model builds that is
// missing from en.json, or whose key th.json lacks, shows English in Thai.
// The catalog guard (src/i18n/catalogs.test.ts) sees only `tc` calls given a
// string literal; templates that reach `tc` through a variable or a table are
// checked here, from each model's own test.
import { readFileSync } from 'node:fs';

import type { CopyValues, Translate } from '../shared.ts';

const catalog = (locale: string): Record<string, string> =>
  JSON.parse(readFileSync(new URL(`../../../../messages/${locale}.json`, import.meta.url), 'utf8'));

/** Each text that is not copy in en.json with Thai, and why; empty when every one is. First key wins, as in `translateCopy`. */
export function untranslated(texts: Iterable<string>): string[] {
  const en = catalog('en');
  const th = catalog('th');
  const keyOf = new Map<string, string>();
  for (const [key, value] of Object.entries(en)) if (!keyOf.has(value)) keyOf.set(value, key);
  const gaps: string[] = [];
  for (const text of new Set(texts)) {
    const key = keyOf.get(text);
    if (!key) gaps.push(`"${text}" is not in en.json`);
    else if (!th[key]?.trim()) gaps.push(`"${text}" has no Thai`);
  }
  return gaps;
}

/** A `tc` that answers in English and keeps every English text it was asked for. */
export function recordingTc(): { tc: Translate; asked: Set<string> } {
  const asked = new Set<string>();
  const tc: Translate = (english: string, values?: CopyValues) => {
    asked.add(english);
    return values ? english.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match)) : english;
  };
  return { tc, asked };
}
