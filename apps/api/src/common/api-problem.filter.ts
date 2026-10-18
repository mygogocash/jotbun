import { STATUS_CODES as HTTP_STATUS_CODES } from 'node:http';

import { Catch, HttpException, HttpStatus } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { ContractValidationError } from '@gogospend/contracts';
import type { ApiErrorCode, ApiProblem } from '@gogospend/contracts';
import type { Request, Response } from 'express';

import { requestContext } from '../auth/request-context';
import { routeTemplate, writeLog } from './safe-request-logger';

export type ProblemOptions = { fields?: Record<string, string>; retryAfterSeconds?: number; messageKey?: string; current?: unknown };

/** An HTTP error that is rendered as an ApiProblem with a stable code. */
export class ProblemException extends HttpException {
  readonly code: ApiErrorCode;
  readonly problem: ProblemOptions;

  constructor(status: number, code: ApiErrorCode, problem: ProblemOptions = {}) {
    super(code, status);
    this.code = code;
    this.problem = problem;
  }
}

/**
 * Writes an ApiProblem response; also used by middleware outside Nest's
 * filters. A refusal sent before the request body was read (a gate, the
 * access guard, a body parser limit) closes the connection afterwards, so
 * Node does not read whatever the client still sends - up to the 9-minute
 * request timeout for a refused upload - just to keep the socket alive.
 */
export function sendProblem(req: Request, res: Response, status: number, code: ApiErrorCode, problem: ProblemOptions = {}): void {
  const body: ApiProblem = {
    code,
    request_id: requestContext(req).requestId,
    message_key: problem.messageKey ?? `errors.${code.toLowerCase()}`,
  };
  if (problem.fields) body.fields = problem.fields;
  if (problem.current !== undefined) body.current = problem.current;
  if (problem.retryAfterSeconds !== undefined) body.retry_after_seconds = problem.retryAfterSeconds;
  // A client still writing a chunked body never sees Express's json() reply on
  // Node 24: ending that reply with Connection: close aborts the socket (RST)
  // and drops the bytes. Write the refusal on the socket and half-close it,
  // without reading the rest of the body. GETs and finished bodies stay on
  // Express so Cache-Control and the request log still apply.
  if (hasUnreadBody(req) && !res.headersSent && refuseUnread(req, status, Buffer.from(JSON.stringify(body)), problem.retryAfterSeconds)) return;
  if (!req.complete && !res.headersSent) res.setHeader('Connection', 'close');
  if (problem.retryAfterSeconds !== undefined) res.setHeader('Retry-After', String(problem.retryAfterSeconds));
  res.status(status).json(body);
}

/** A request that still has a body the handler did not read. */
function hasUnreadBody(req: Request): boolean {
  if (req.complete) return false;
  const length = req.headers['content-length'];
  if (typeof length === 'string' && /^\d+$/.test(length) && Number(length) > 0) return true;
  const encoding = req.headers['transfer-encoding'];
  return typeof encoding === 'string' && encoding.length > 0;
}

/** True when the refusal was written and the socket half-closed. */
function refuseUnread(req: Request, status: number, payload: Buffer, retryAfterSeconds?: number): boolean {
  const socket = req.socket;
  if (!socket || socket.destroyed) return false;
  const swallow = () => undefined;
  socket.on('error', swallow);
  req.on('error', swallow);
  const reason = HTTP_STATUS_CODES[status] ?? 'Error';
  const headers = [
    `HTTP/1.1 ${status} ${reason}`,
    'Content-Type: application/json; charset=utf-8',
    `Content-Length: ${payload.length}`,
    'Connection: close',
  ];
  if (retryAfterSeconds !== undefined) headers.push(`Retry-After: ${retryAfterSeconds}`);
  // A prior setHeader corks the socket; a direct write stays buffered until
  // uncork, and the client then blocks on its own write forever.
  const chunk = Buffer.concat([Buffer.from(`${headers.join('\r\n')}\r\n\r\n`), payload]);
  socket.cork();
  socket.write(chunk);
  socket.uncork();
  socket.end();
  // Drop the unread body on the next turn, after the refusal bytes are queued.
  // Destroying in the same turn sends a RST that discards them (Node 24).
  setImmediate(() => {
    if (!socket.destroyed) socket.destroy();
  });
  return true;
}

// Nest/Express errors without our own code, by status.
const STATUS_CODES: Partial<Record<number, ApiErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: 'VALIDATION_FAILED',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHENTICATED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'COMMAND_TOO_LARGE',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'VALIDATION_FAILED',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'SERVICE_UNAVAILABLE',
};

// Network failures reaching PostgreSQL, and SQLSTATE classes 08 (connection
// exception), 53 (insufficient resources) and 57P (operator intervention).
const UNAVAILABLE_NETWORK_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENOTFOUND', 'EPIPE']);

function isDatabaseUnavailable(exception: unknown): boolean {
  const code = (exception as { code?: unknown } | null)?.code;
  if (typeof code !== 'string') {
    return exception instanceof Error && /Connection terminated|timeout exceeded when trying to connect/i.test(exception.message);
  }
  return UNAVAILABLE_NETWORK_CODES.has(code) || /^(08|53)[0-9A-Z]{3}$|^57P0[1-3]$/.test(code);
}

/**
 * Every v1 error becomes an ApiProblem. Unexpected errors are 500
 * INTERNAL_ERROR with no detail in the response, and only the error class
 * name in the log.
 */
@Catch()
export class ApiProblemFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    if (exception instanceof ProblemException) {
      sendProblem(req, res, exception.getStatus(), exception.code, exception.problem);
      return;
    }
    if (exception instanceof ContractValidationError) {
      sendProblem(req, res, HttpStatus.UNPROCESSABLE_ENTITY, exception.code as ApiErrorCode, {
        fields: { [exception.field ?? 'body']: exception.code },
      });
      return;
    }
    if (isDatabaseUnavailable(exception)) {
      sendProblem(req, res, HttpStatus.SERVICE_UNAVAILABLE, 'SERVICE_UNAVAILABLE', { retryAfterSeconds: 5 });
      return;
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code = STATUS_CODES[status] ?? (status >= 400 && status < 500 ? 'VALIDATION_FAILED' : undefined);
      if (code) {
        // A client error keeps its status even without a specific code.
        sendProblem(req, res, status, code);
        return;
      }
    }
    writeLog({
      level: 'error',
      request_id: requestContext(req).requestId,
      route: routeTemplate(req),
      status: 500,
      error: exception instanceof Error ? exception.name : typeof exception,
    });
    sendProblem(req, res, HttpStatus.INTERNAL_SERVER_ERROR, 'INTERNAL_ERROR');
  }
}
