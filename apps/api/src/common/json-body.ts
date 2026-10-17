import { json } from 'express';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

import { sendProblem } from './api-problem.filter';

/**
 * JSON body parsing for v1. Parser errors happen before Nest's exception
 * filters run, so they are answered here as ApiProblems instead of Express's
 * default HTML error page.
 */
export function jsonBody(limit: string): RequestHandler {
  const parse = json({ limit, strict: true });
  return (req: Request, res: Response, next: NextFunction) => {
    parse(req, res, (error?: unknown) => {
      if (!error) {
        next();
        return;
      }
      const tooLarge = (error as { type?: unknown }).type === 'entity.too.large';
      sendProblem(req, res, tooLarge ? 413 : 400, tooLarge ? 'COMMAND_TOO_LARGE' : 'VALIDATION_FAILED');
    });
  };
}
