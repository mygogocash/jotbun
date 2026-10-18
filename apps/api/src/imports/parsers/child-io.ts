// The parser child's side of the protocol: `node <child> <format> <today>`,
// the file on stdin (at most 12 MiB), one JSON ParseResult on stdout, exit 0.
// A whole-file refusal is `{ok:false, code}`; any other error is
// `parse_failed` with no message (error text may quote the file). The child
// reports its own peak memory and CPU time so the worker can enforce the
// reviewed budget. `node <child> sandbox <today>` runs the self-check
// (sandbox-check.ts) instead of a parse.
//
// Memory: the peak is sampled from the process's resident size (every 5 ms,
// and after the output is written), because on Linux `ru_maxrss` starts at
// the parent's size - it survives execve - and so is the worker's size, not
// this child's. Elsewhere the larger of the two is reported. An image is
// written in base64 slices, so its encoding never exists as one string.
import { sandboxReport } from './sandbox-check.ts';
import { IMAGE_FORMATS, LIMITS, ParseRejection, TABLE_FORMATS } from './protocol.ts';
import type { ChildBody, ParseFormat, Usage } from './protocol.ts';

const FORMATS: readonly string[] = [...TABLE_FORMATS, ...IMAGE_FORMATS];
// A multiple of 3 bytes, so each slice encodes without padding.
const BASE64_SLICE = 48 * 1024;

let peakRssKb = 0;
function sample(): void {
  const kb = Math.ceil(process.memoryUsage.rss() / 1024);
  if (kb > peakRssKb) peakRssKb = kb;
}

function usage(): Usage {
  sample();
  const used = process.resourceUsage();
  return {
    max_rss_kb: process.platform === 'linux' ? peakRssKb : Math.max(peakRssKb, used.maxRSS),
    cpu_ms: Math.round((used.userCPUTime + used.systemCPUTime) / 1000),
  };
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

function write(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (process.stdout.write(text)) resolve();
    else process.stdout.once('drain', () => resolve());
  });
}

type ChildResult = ({ ok: true } & ChildBody) | { ok: false; code: string };

async function writeResult(result: ChildResult): Promise<void> {
  if (!result.ok || result.image === null) {
    const body = result.ok ? { ...result, image: null } : result;
    await write(JSON.stringify({ ...body, usage: usage() }));
    return;
  }
  const { image, ...rest } = result;
  // `…"base64":""}}` without its last three characters ends inside the empty string.
  const head = JSON.stringify({ ...rest, image: { format: image.format, width: image.width, height: image.height, base64: '' } });
  await write(head.slice(0, -3));
  const bytes = Buffer.from(image.bytes.buffer, image.bytes.byteOffset, image.bytes.byteLength);
  for (let at = 0; at < bytes.length; at += BASE64_SLICE) await write(bytes.subarray(at, at + BASE64_SLICE).toString('base64'));
  await write(`"},"usage":${JSON.stringify(usage())}}`);
}

export function runChild(parse: (format: ParseFormat, bytes: Buffer, today: string) => ChildBody | Promise<ChildBody>): void {
  const sampler = setInterval(sample, 5);
  sampler.unref();
  void (async () => {
    const [mode, today] = process.argv.slice(2);
    try {
      if (mode === 'sandbox') {
        await write(JSON.stringify(await sandboxReport(await readInput())));
        return;
      }
      let result: ChildResult;
      try {
        if (!FORMATS.includes(mode) || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(today ?? '')) throw new ParseRejection('parse_failed');
        result = { ok: true, ...(await parse(mode as ParseFormat, await readInput(), today)) };
      } catch (error) {
        result = { ok: false, code: error instanceof ParseRejection ? error.code : 'parse_failed' };
      }
      await writeResult(result);
    } finally {
      clearInterval(sampler);
    }
  })();
}
