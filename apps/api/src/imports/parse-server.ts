// The stateless statement parser (1B-T1): bytes in, a parse outcome out. It is
// the parse process of the API image, started as `node dist/imports/parse-server.js`.
// It holds no database, no secrets and no bindings: the file arrives in the
// request body and the validated preview goes back in the response (C1, spec
// §6.1). It judges every file with the job worker's rules (parse-outcome.ts) and
// runs the parser child exactly as the worker does (parser-runner.ts).
//
//   GET  /health  200 {"status":"ok"} once the parser sandbox holds; else 503.
//   POST /parse   x-jotbun-format (csv, xlsx, jpeg, png or webp) and
//                 x-jotbun-today (YYYY-MM-DD, Bangkok) headers; the body is the
//                 file, at most IMPORT_UPLOAD_MAX_BYTES. 200 with a `parsed` or a
//                 `retry` reply; 400 for a bad header; 413 past the cap.
//
// One parse runs at a time. A request that arrives during a parse, or while the
// sandbox does not hold, is answered `not_started`: no child ran, so the caller
// spends no attempt. A client that goes away mid-parse aborts its child and gets
// no reply. Logs carry counts only, never content, names or error text.
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import { IMPORT_UPLOAD_MAX_BYTES } from '@gogospend/contracts';

import { ConfigurationError } from '../common/configuration-error';
import { failureName } from '../common/operational-metrics';
import { applyHttpTimeouts, handleShutdownSignals, runMain, shutdownTimeoutMsFromEnv } from '../common/process-lifecycle';
import { importParsingStartup } from './import-parsing';
import type { ImportParsingStartup } from './import-parsing';
import { previewFromOutcome } from './parse-outcome';
import type { PreviewRecord, SanitizedImage } from './parse-outcome';
import { PARSER_CHILD_MEMORY_MIB } from './parser-runner';
import type { ParserRunnerPort } from './parser-runner';
import { IMAGE_FORMATS, TABLE_FORMATS } from './parsers/protocol';
import type { ImageFormat, ParseFormat } from './parsers/protocol';

export const PARSE_FORMAT_HEADER = 'x-jotbun-format';
export const PARSE_TODAY_HEADER = 'x-jotbun-today';

export type ParseServiceReply =
  | { kind: 'parsed'; record: PreviewRecord; image: { format: ImageFormat; width: number; height: number; base64: string } | null }
  | { kind: 'retry'; code: 'parser_unavailable' | 'parser_sandbox_unsupported' | 'not_started' };

export type ParseServerOptions = {
  port: number;
  host?: string;
  runner?: ParserRunnerPort;
  memoryBudgetKb?: number;
  startup?: () => Promise<ImportParsingStartup>;
};

export type ParseServer = { port: number; close(): Promise<void> };

type State = {
  /** Null while the startup check found no sandbox: no parse runs then. */
  runner: ParserRunnerPort | null;
  memoryBudgetKb: number;
  busy: boolean;
  ran: number;
};

type Answer = { status: number; body: unknown };

const TODAY_PATTERN = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
const FORMATS: readonly string[] = [...TABLE_FORMATS, ...IMAGE_FORMATS];

export async function startParseServer(options: ParseServerOptions): Promise<ParseServer> {
  const parsing = await (options.startup ?? importParsingStartup)();
  const state: State = {
    // Whatever runner was given, none runs where the startup check found no sandbox.
    runner: parsing.parse === null ? null : (options.runner ?? parsing.parse.runner ?? null),
    memoryBudgetKb: options.memoryBudgetKb ?? PARSER_CHILD_MEMORY_MIB * 1024,
    busy: false,
    ran: 0,
  };
  const server = createServer((req, res) => {
    handle(req, res, state).catch((error: unknown) => {
      console.error(`parse server: request failed (${failureName(error)})`);
      if (!res.headersSent) send(res, 500, { error: 'internal' });
    });
  });
  applyHttpTimeouts(server);
  await listen(server, options.port, options.host ?? '0.0.0.0');
  server.on('error', (error: Error) => console.error(`parse server: ${failureName(error)}`));
  const { port } = server.address() as AddressInfo;
  return { port, close: () => closeServer(server) };
}

async function handle(req: IncomingMessage, res: ServerResponse, state: State): Promise<void> {
  // A failed request is answered or dropped; its error never reaches the process as an uncaught one.
  req.on('error', () => undefined);
  if (req.method === 'GET' && req.url === '/health') {
    req.resume();
    return state.runner === null ? send(res, 503, { status: 'unavailable' }) : send(res, 200, { status: 'ok' });
  }
  if (req.method === 'POST' && req.url === '/parse') return parse(req, res, state);
  req.resume();
  return send(res, 404, { error: 'not_found' });
}

async function parse(req: IncomingMessage, res: ServerResponse, state: State): Promise<void> {
  const format = headerValue(req, PARSE_FORMAT_HEADER);
  const today = headerValue(req, PARSE_TODAY_HEADER);
  if (!isParseFormat(format) || today === undefined || !TODAY_PATTERN.test(today)) {
    req.resume();
    return send(res, 400, { error: 'bad_request' });
  }
  if (state.runner === null || state.busy) {
    req.resume();
    const reply: ParseServiceReply = { kind: 'retry', code: 'not_started' };
    return send(res, 200, reply);
  }
  const runner = state.runner;
  state.busy = true;
  // The flag is cleared before the reply is sent, so the next request can start at once.
  const answer = await answerParse(req, res, { runner, format, today, state }).finally(() => {
    state.busy = false;
  });
  if (answer !== null) send(res, answer.status, answer.body);
}

async function answerParse(
  req: IncomingMessage,
  res: ServerResponse,
  job: { runner: ParserRunnerPort; format: ParseFormat; today: string; state: State },
): Promise<Answer | null> {
  const bytes = await readBody(req, IMPORT_UPLOAD_MAX_BYTES);
  // Past the cap: refused before the parser runs.
  if (bytes === 'too_large') return { status: 413, body: { error: 'too_large' } };
  // The client went away while its file was arriving: nothing to answer.
  if (bytes === null || res.destroyed) return null;
  const abort = new AbortController();
  res.once('close', () => {
    if (!res.writableEnded) abort.abort();
  });
  const outcome = await job.runner.run({ format: job.format, bytes, today: job.today, signal: abort.signal });
  job.state.ran += 1;
  console.log(`parse server: ran ${job.state.ran}`);
  const decided = previewFromOutcome(job.format, outcome, job.state.memoryBudgetKb, job.today);
  // The client went away mid-parse: its child was killed, and nothing is sent.
  if (decided.kind === 'aborted') return null;
  if (decided.kind === 'retry') {
    const reply: ParseServiceReply = { kind: 'retry', code: decided.code };
    return { status: 200, body: reply };
  }
  const reply: ParseServiceReply = { kind: 'parsed', record: decided.record, image: imageReply(decided.image, decided.record) };
  return { status: 200, body: reply };
}

/** The sanitized image as it goes back, with the size its own header gave (checked in previewFromOutcome). */
function imageReply(image: SanitizedImage | null, record: PreviewRecord): { format: ImageFormat; width: number; height: number; base64: string } | null {
  if (image === null) return null;
  const size = record.preview.image;
  if (size === null) throw new Error('a sanitized image without its size');
  return { format: image.format, width: size.width, height: size.height, base64: image.bytes.toString('base64') };
}

/** The body, read up to `limit` bytes. Past it: 'too_large', and nothing more is kept. Null when the request ends early. */
function readBody(req: IncomingMessage, limit: number): Promise<Buffer | 'too_large' | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const finish = (value: Buffer | 'too_large' | null) => {
      req.off('data', onData);
      req.off('end', onEnd);
      req.off('close', onClose);
      resolve(value);
    };
    const onData = (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) finish('too_large');
      else chunks.push(chunk);
    };
    const onEnd = () => finish(Buffer.concat(chunks, size));
    const onClose = () => {
      if (!req.complete) finish(null);
    };
    req.on('data', onData);
    req.on('end', onEnd);
    req.on('close', onClose);
  });
}

function headerValue(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name];
  return typeof value === 'string' ? value : undefined;
}

function isParseFormat(value: string | undefined): value is ParseFormat {
  return value !== undefined && FORMATS.includes(value);
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(json) });
  res.end(json);
}

function listen(server: Server, port: number, host: string): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

/** `PARSE_SERVER_PORT` (1-65535, default 8080). */
function portFromEnv(value: string | undefined): number {
  if (value === undefined || value === '') return 8080;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new ConfigurationError('PARSE_SERVER_PORT must be a port number (1-65535).');
  return port;
}

async function main(): Promise<void> {
  const port = portFromEnv(process.env.PARSE_SERVER_PORT);
  const shutdownMs = shutdownTimeoutMsFromEnv(process.env.SHUTDOWN_TIMEOUT_SECONDS);
  const server = await startParseServer({
    port,
    // The alert names only why the sandbox does not hold, never more.
    startup: async () => {
      const parsing = await importParsingStartup();
      if (parsing.alert) console.error(parsing.alert);
      return parsing;
    },
  });
  console.log('parse server: listening');
  handleShutdownSignals({ name: 'parse server', timeoutMs: shutdownMs, exitWhenStopped: true, stop: () => server.close() });
}

if (require.main === module) void runMain('parse server', main);
