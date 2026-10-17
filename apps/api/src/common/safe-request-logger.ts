import type { NextFunction, Request, Response } from 'express';

import { requestContext } from '../auth/request-context';

export type LogSink = (line: string) => void;

let sink: LogSink = (line) => process.stdout.write(`${line}\n`);

/** Tests capture output by swapping the sink. */
export function setLogSink(next: LogSink): LogSink {
  const previous = sink;
  sink = next;
  return previous;
}

/** One JSON line. Callers pass only non-sensitive, already-chosen fields. */
export function writeLog(entry: Record<string, unknown>): void {
  sink(JSON.stringify(entry));
}

/** The matched route template (`/v1/items/:id`), never the concrete URL. */
export function routeTemplate(req: Request): string {
  const path = (req.route as { path?: unknown } | undefined)?.path;
  return typeof path === 'string' ? `${req.baseUrl}${path}` : 'unmatched';
}

/**
 * Logs request ID, method, route template, status and latency only: never
 * query strings, concrete paths, headers, bodies or signed URLs.
 */
export function safeRequestLogger(req: Request, res: Response, next: NextFunction): void {
  res.on('finish', () => {
    const context = requestContext(req);
    writeLog({
      level: 'info',
      request_id: context.requestId,
      method: req.method,
      route: routeTemplate(req),
      status: res.statusCode,
      latency_ms: Math.round(performance.now() - context.startedAt),
    });
  });
  next();
}
