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

/** Each `<TextInput …>` or bare `<Text …>` element's opening tag, with where it is. */
function textElements(): { where: string; tag: string }[] {
  const found: { where: string; tag: string }[] = [];
  for (const file of REDESIGN.flatMap((dir) => sources(join(appRoot, dir)))) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/<(TextInput|Text|RNText)\b([^>]|=>)*?\/?>/gs)) {
      const line = source.slice(0, match.index).split('\n').length;
      found.push({ where: `${file.slice(appRoot.length)}:${line}`, tag: match[0] });
    }
  }
  return found;
}

test('every text field and raw Text in the redesign sets a ceiling on how far its text grows', () => {
  const elements = textElements();
  assert.ok(elements.some(({ tag }) => tag.startsWith('<TextInput')), 'the scan finds the text fields');
  const uncapped = elements.filter(({ tag }) => !/\bmaxFontSizeMultiplier=/.test(tag)).map(({ where }) => where);
  assert.deepEqual(uncapped, []);
});
