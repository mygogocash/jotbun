// The parser sandbox from dist (Node 26 review): runs each parser child's
// self-check exactly as the job worker does at startup, from the built
// CommonJS files the release image runs. The Jest suite starts the children
// from TypeScript, where sharp loads through its ES module build and Node
// never reads the missing package.json files that once crashed the image
// child; only dist takes that path. Fails unless both children run
// sandboxed, on Node 26 or later (owner decision §7.1). Run after the build.
'use strict';
const { join } = require('node:path');

async function main() {
  const major = Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10);
  const { ParserRunner } = require(join(__dirname, '..', 'dist', 'imports', 'parser-runner.js'));
  const verdict = await new ParserRunner().verifySandbox();
  const failures = [];
  if (major < 26) failures.push('node');
  if (!verdict.supported) failures.push('sandbox');
  process.stdout.write(`${JSON.stringify({ node: process.versions.node, sandbox: verdict, ok: failures.length === 0, ...(failures.length > 0 ? { failures } : {}) })}\n`);
  process.exitCode = failures.length === 0 ? 0 : 1;
}

main().catch((error) => {
  // The error class only: never its text.
  process.stdout.write(`${JSON.stringify({ ok: false, failures: ['check'], error: error instanceof Error ? error.name : 'unknown' })}\n`);
  process.exitCode = 1;
});
