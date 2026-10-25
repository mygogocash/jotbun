import { request } from 'node:http';

import { IMPORT_UPLOAD_MAX_BYTES } from '@gogospend/contracts';

import { parsingRunner } from './fixtures/parsing-runner';
import { IMAGE_MARKERS, imageWithMetadata } from './fixtures/synthetic-parse';
import type { ImportParsingStartup } from './import-parsing';
import { sanitizedImageHeader } from './parse-outcome';
import { PARSE_FORMAT_HEADER, PARSE_TODAY_HEADER, startParseServer } from './parse-server';
import type { ParseServer, ParseServiceReply } from './parse-server';
import type { ParserRunInput, ParserRunOutcome, ParserRunnerPort } from './parser-runner';
import type { ParsedRow } from './parsers/protocol';

// The parse server (1B-T1): bytes in, a parse outcome out. Each case starts the
// server on port 0 with a fake runner, unless the case says otherwise. The
// real-child JPEG case runs on every runtime, as parser-runner.spec.ts's
// real-child image cases do (parsingRunner() is gated on Node 25 and later,
// and ungated on Node 24), so it is never skipped.

const HOST = '127.0.0.1';
const TODAY = '2026-10-25';
const BYTES = Buffer.from('date,amount\n2026-10-20,-60\n');
const ROW: ParsedRow = {
  source_row_id: 'row:2',
  occurred_on: '2026-10-20',
  type: 'expense',
  amount_minor: '6000',
  wallet_label: 'Cash',
  category_label: 'food',
  merchant: 'ข้าวมันไก่',
  note: null,
  issues: [],
};
const OK = (rows: ParsedRow[] = [ROW]): ParserRunOutcome => ({
  kind: 'result',
  result: { ok: true, layout: 'generic', rows, file_issues: [], image: null, usage: { max_rss_kb: 1000, cpu_ms: 5 } },
});

/** A runner that answers `answer` for every run; `run` is a jest mock, so the cases can count its runs. */
const runnerOf = (answer: (input: ParserRunInput) => Promise<ParserRunOutcome>) => ({ run: jest.fn(answer) });
const sandboxed = (runner: ParserRunnerPort) => async (): Promise<ImportParsingStartup> => ({ parse: { runner }, alert: null });
const unsandboxed = async (): Promise<ImportParsingStartup> => ({ parse: null, alert: 'job worker: import parsing disabled (parser sandbox unsupported: net)' });

const started: ParseServer[] = [];
async function start(options: { runner: ParserRunnerPort; startup: () => Promise<ImportParsingStartup> }): Promise<ParseServer> {
  const server = await startParseServer({ port: 0, host: HOST, ...options });
  started.push(server);
  return server;
}
afterEach(async () => {
  await Promise.all(started.splice(0).map((server) => server.close()));
});

type Reply = { status: number; body: unknown };

/** One request on its own connection, read to its end. */
function send(port: number, method: 'GET' | 'POST', path: string, headers: Record<string, string>, body?: Buffer): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = request({ host: HOST, port, method, path, headers, agent: false }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let parsed: unknown = text;
        try {
          parsed = text === '' ? null : JSON.parse(text);
        } catch {
          // Kept as text: a case that expects JSON then fails on the text.
        }
        resolve({ status: res.statusCode ?? 0, body: parsed });
      });
    });
    req.on('error', reject);
    req.end(body);
  });
}

const get = (port: number, path: string) => send(port, 'GET', path, {});
const parse = (port: number, format: string | undefined, today: string | undefined, bytes: Buffer) =>
  send(
    port,
    'POST',
    '/parse',
    {
      'content-type': 'application/octet-stream',
      ...(format === undefined ? {} : { [PARSE_FORMAT_HEADER]: format }),
      ...(today === undefined ? {} : { [PARSE_TODAY_HEADER]: today }),
    },
    bytes,
  );

describe('the parse server', () => {
  // One count line is logged per parse. The cases read the replies, not the log.
  beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('answers health once the sandbox holds, and 503 when it does not', async () => {
    const runner = runnerOf(async () => OK());
    const up = await start({ runner, startup: sandboxed(runner) });
    expect(await get(up.port, '/health')).toEqual({ status: 200, body: { status: 'ok' } });

    // The runner is given, but the startup check found no sandbox: nothing may run.
    const down = await start({ runner, startup: unsandboxed });
    expect(await get(down.port, '/health')).toEqual({ status: 503, body: { status: 'unavailable' } });
    expect(await parse(down.port, 'csv', TODAY, BYTES)).toEqual({ status: 200, body: { kind: 'retry', code: 'not_started' } });
    expect(runner.run).not.toHaveBeenCalled();
  });

  it('returns the validated preview of a parsed statement', async () => {
    const runner = runnerOf(async () => OK());
    const server = await start({ runner, startup: sandboxed(runner) });
    expect(await parse(server.port, 'csv', TODAY, BYTES)).toEqual({
      status: 200,
      body: {
        kind: 'parsed',
        image: null,
        record: { preview: { status: 'ready', layout: 'generic', issues: [], image: null }, candidates: [{ ...ROW, ordinal: 1, review_required: false }] },
      },
    });
  });

  it("uses the request's today: a row dated after it is flagged", async () => {
    const runner = runnerOf(async () => OK([{ ...ROW, occurred_on: '2026-10-26' }]));
    const server = await start({ runner, startup: sandboxed(runner) });
    const flagged = await parse(server.port, 'csv', TODAY, BYTES);
    expect(flagged.body).toMatchObject({ kind: 'parsed', record: { candidates: [{ occurred_on: null, issues: [{ field: 'occurred_on', code: 'date_out_of_range' }] }] } });
    // The same row is kept once the request's own today is after its date: the header decides, not the clock.
    const kept = await parse(server.port, 'csv', '2026-10-27', BYTES);
    expect(kept.body).toMatchObject({ kind: 'parsed', record: { candidates: [{ occurred_on: '2026-10-26', issues: [] }] } });
  });

  it('a timeout, a crash or a memory overrun is a rejected preview with its reason, never a retry', async () => {
    const cases: [ParserRunOutcome, string][] = [
      [{ kind: 'timeout' }, 'parse_timeout'],
      [{ kind: 'crashed' }, 'parse_failed'],
      [{ kind: 'memory_limit' }, 'parse_resource_limit'],
    ];
    for (const [outcome, code] of cases) {
      const runner = runnerOf(async () => outcome);
      const server = await start({ runner, startup: sandboxed(runner) });
      expect(await parse(server.port, 'csv', TODAY, BYTES)).toEqual({
        status: 200,
        body: { kind: 'parsed', image: null, record: { preview: { status: 'rejected', layout: null, issues: [code], image: null }, candidates: [] } },
      });
    }
  });

  it('a child that cannot start asks to be retried', async () => {
    const runner = runnerOf(async () => ({ kind: 'spawn_failed' }));
    const server = await start({ runner, startup: sandboxed(runner) });
    expect(await parse(server.port, 'csv', TODAY, BYTES)).toEqual({ status: 200, body: { kind: 'retry', code: 'parser_unavailable' } });
  });

  it('refuses a body over 12 MiB with 413 before parsing', async () => {
    const runner = runnerOf(async () => OK());
    const server = await start({ runner, startup: sandboxed(runner) });
    // The cap itself is accepted; one byte more is refused before the parser runs.
    expect((await parse(server.port, 'csv', TODAY, Buffer.alloc(IMPORT_UPLOAD_MAX_BYTES))).status).toBe(200);
    expect(runner.run).toHaveBeenCalledTimes(1);
    expect((await parse(server.port, 'csv', TODAY, Buffer.alloc(IMPORT_UPLOAD_MAX_BYTES + 1))).status).toBe(413);
    expect(runner.run).toHaveBeenCalledTimes(1);
  }, 60_000);

  it('runs one parse at a time; a second request at once is told it has not started', async () => {
    let entered: () => void = () => undefined;
    const reached = new Promise<void>((resolve) => {
      entered = () => resolve();
    });
    let leave: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      leave = () => resolve();
    });
    const runner = runnerOf(async () => {
      entered();
      await held;
      return OK();
    });
    const server = await start({ runner, startup: sandboxed(runner) });
    const first = parse(server.port, 'csv', TODAY, BYTES);
    // Wait until the first parse is running, or its reply has come back without one.
    await Promise.race([reached, first]);
    expect(runner.run).toHaveBeenCalledTimes(1);
    expect(await parse(server.port, 'csv', TODAY, BYTES)).toEqual({ status: 200, body: { kind: 'retry', code: 'not_started' } });
    leave();
    expect((await first).body).toMatchObject({ kind: 'parsed' });
    expect(await parse(server.port, 'csv', TODAY, BYTES)).toMatchObject({ status: 200, body: { kind: 'parsed' } });
    expect(runner.run).toHaveBeenCalledTimes(2);
  });

  it('an unknown format or a missing today header is 400', async () => {
    const runner = runnerOf(async () => OK());
    const server = await start({ runner, startup: sandboxed(runner) });
    expect((await parse(server.port, 'docx', TODAY, BYTES)).status).toBe(400);
    expect((await parse(server.port, undefined, TODAY, BYTES)).status).toBe(400);
    expect((await parse(server.port, 'csv', undefined, BYTES)).status).toBe(400);
    expect((await parse(server.port, 'csv', '2026/10/25', BYTES)).status).toBe(400);
    expect(runner.run).not.toHaveBeenCalled();
  });

  it('re-encodes a real JPEG and returns it without metadata', async () => {
    const runner = parsingRunner();
    const server = await start({ runner, startup: sandboxed(runner) });
    const reply = await parse(server.port, 'jpeg', TODAY, await imageWithMetadata('jpeg', 64, 48));
    expect(reply.status).toBe(200);
    expect(reply.body).toMatchObject({
      kind: 'parsed',
      record: { preview: { status: 'ready', layout: 'receipt', issues: ['receipt_fields_unread'], image: { width: 64, height: 48 } } },
      image: { format: 'jpeg', width: 64, height: 48 },
    });
    const image = (reply.body as Extract<ParseServiceReply, { kind: 'parsed' }>).image;
    const sanitized = Buffer.from(image?.base64 ?? '', 'base64');
    expect(sanitizedImageHeader(sanitized, 'jpeg')).toEqual({ width: 64, height: 48 });
    for (const marker of IMAGE_MARKERS) expect(sanitized.includes(marker)).toBe(false);
  }, 60_000);
});
