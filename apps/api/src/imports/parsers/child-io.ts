// The parser child's side of the protocol: `node <child> <format> <today>`,
// the file on stdin (at most 12 MiB), one JSON ParseResult on stdout, exit 0.
// A whole-file refusal is `{ok:false, code}`; any other error is
// `parse_failed` with no message (error text may quote the file). The child
// reports its own peak memory and CPU time so the worker can enforce the
// reviewed budget.
import { IMAGE_FORMATS, LIMITS, ParseRejection, TABLE_FORMATS } from './protocol.ts';
import type { ParseBody, ParseFormat, ParseResult, Usage } from './protocol.ts';

const FORMATS: readonly string[] = [...TABLE_FORMATS, ...IMAGE_FORMATS];

function usage(): Usage {
  const used = process.resourceUsage();
  return { max_rss_kb: used.maxRSS, cpu_ms: Math.round((used.userCPUTime + used.systemCPUTime) / 1000) };
}

async function readInput(): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of process.stdin) {
    const bytes = chunk as Buffer;
    total += bytes.length;
    if (total > LIMITS.inputBytes) throw new ParseRejection('parse_failed');
    chunks.push(bytes);
  }
  return Buffer.concat(chunks, total);
}

export function runChild(parse: (format: ParseFormat, bytes: Buffer, today: string) => ParseBody | Promise<ParseBody>): void {
  void (async () => {
    let result: ParseResult;
    try {
      const [format, today] = process.argv.slice(2);
      if (!FORMATS.includes(format) || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(today ?? '')) throw new ParseRejection('parse_failed');
      const body = await parse(format as ParseFormat, await readInput(), today);
      result = { ok: true, ...body, usage: usage() };
    } catch (error) {
      result = { ok: false, code: error instanceof ParseRejection ? error.code : 'parse_failed', usage: usage() };
    }
    process.stdout.write(JSON.stringify(result));
  })();
}
