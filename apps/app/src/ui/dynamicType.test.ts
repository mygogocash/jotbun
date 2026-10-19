// Dynamic Type (redesign R8): text in the redesign grows with the person's text
// size, up to its role's ceiling (`BUN_MAX_FONT_SCALE`). `BunText` applies the
// ceiling itself; anything that draws text without it (a text field, or a raw
// Text) must set `maxFontSizeMultiplier`, or at the largest accessibility size
// it grows 3.6x and splits words mid-word.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const appRoot = fileURLToPath(new URL('../../', import.meta.url));
const REDESIGN = ['src/screens/redesign', 'src/ui', 'src/mascot'];

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) ? [path] : [];
  });
}

const TEXT_TAGS = /<(TextInput|Text|RNText|RNTextInput|Animated\.Text|Animated\.TextInput)\b/g;

/**
 * Each text element's opening tag in `source`: from `<Name` to the `>` that
 * ends it, reading through `{…}` (arrows, comparisons and strings inside them
 * are not the end). A `<` right after a name or a dot is a type argument
 * (`useRef<TextInput>`), not an element.
 */
export function openingTags(source: string): { at: number; tag: string }[] {
  const tags: { at: number; tag: string }[] = [];
  for (const match of source.matchAll(TEXT_TAGS)) {
    const at = match.index ?? 0;
    if (at > 0 && /[\w$.]/.test(source[at - 1])) continue;
    let depth = 0;
    let quote: string | null = null;
    let end = at + match[0].length;
    for (; end < source.length; end += 1) {
      const char = source[end];
      if (quote) {
        if (char === '\\') end += 1;
        else if (char === quote) quote = null;
        continue;
      }
      if (char === '{') depth += 1;
      else if (char === '}') depth -= 1;
      else if (depth > 0 && (char === "'" || char === '"' || char === '`')) quote = char;
      else if (depth === 0 && char === '>') break;
    }
    tags.push({ at, tag: source.slice(at, end + 1) });
  }
  return tags;
}

/** Each text element's opening tag in the redesign's code, with where it is. */
function textElements(): { where: string; tag: string }[] {
  const found: { where: string; tag: string }[] = [];
  for (const file of REDESIGN.flatMap((dir) => sources(join(appRoot, dir)))) {
    const source = readFileSync(file, 'utf8');
    for (const { at, tag } of openingTags(source)) {
      const line = source.slice(0, at).split('\n').length;
      found.push({ where: `${file.slice(appRoot.length)}:${line}`, tag });
    }
  }
  return found;
}

test('the scan reads a whole tag, through arrows, comparisons and strings, and skips type arguments', () => {
  const capped = (source: string) => openingTags(source).map(({ tag }) => /\bmaxFontSizeMultiplier=/.test(tag));
  assert.deepEqual(capped('<TextInput onChangeText={(t) => set(t)} maxFontSizeMultiplier={2} />'), [true]);
  assert.deepEqual(capped('<TextInput editable={count > 0} maxFontSizeMultiplier={2} />'), [true]);
  assert.deepEqual(capped('<Text accessibilityLabel={`a > b`} maxFontSizeMultiplier={2}>x</Text>'), [true]);
  assert.deepEqual(capped('const ref = useRef<TextInput>(null); <TextInput maxFontSizeMultiplier={2} />'), [true]);
  assert.deepEqual(capped('<Animated.Text style={s}>x</Animated.Text>'), [false]);
  assert.deepEqual(capped('<RNTextInput value={v} />'), [false]);
  assert.deepEqual(capped('<TextField label="x" /><Textual />'), []);
});

test('every text field and raw Text in the redesign sets a ceiling on how far its text grows', () => {
  const elements = textElements();
  assert.ok(elements.some(({ tag }) => tag.startsWith('<TextInput')), 'the scan finds the text fields');
  const uncapped = elements.filter(({ tag }) => !/\bmaxFontSizeMultiplier=/.test(tag)).map(({ where }) => where);
  assert.deepEqual(uncapped, []);
});
