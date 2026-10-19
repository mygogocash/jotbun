// Code that runs in the app runs on Hermes, which has no Web Crypto global:
// `globalThis.crypto.randomUUID()` passes in Node's tests and throws in the
// app (found on the simulator in the dev catalogue's import sections, E2).
// Ids come from expo-crypto instead.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const src = fileURLToPath(new URL('../', import.meta.url));

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !/(testing|Harness|Stub)/.test(path) ? [path] : [];
  });
}

test('no app code reaches for the Web Crypto global, which Hermes lacks', () => {
  const offenders = sources(src).filter((file) => /globalThis\.crypto\b|(?<![.\w])crypto\.randomUUID\(/.test(readFileSync(file, 'utf8')));
  assert.deepEqual(offenders.map((file) => file.slice(src.length)), []);
});
