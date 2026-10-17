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

/** Writes an ApiProblem response; also used by middleware outside Nest's filters. */
export function sendProblem(req: Request, res: Response, status: number, code: ApiErrorCode, problem: ProblemOptions = {}): void {
  const body: ApiProblem = {
    code,
    request_id: requestContext(req).requestId,
    message_key: problem.messageKey ?? `errors.${code.toLowerCase()}`,
  };
  if (problem.fields) body.fields = problem.fields;
  if (problem.current !== undefined) body.current = problem.current;
  if (problem.retryAfterSeconds !== undefined) {
    body.retry_after_seconds = problem.retryAfterSeconds;
    res.setHeader('Retry-After', String(problem.retryAfterSeconds));
  }
  res.status(status).json(body);
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
