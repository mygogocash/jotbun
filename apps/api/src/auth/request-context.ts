import { randomUUID } from 'node:crypto';

import { createParamDecorator } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { ApiIdentity, SessionContext } from '@gogospend/contracts';
import type { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';

/** Per-request state set by the v1 middleware and access guards. */
export type RequestContext = {
  requestId: string;
  startedAt: number;
  identity?: ApiIdentity;
  session?: SessionContext;
};

const CONTEXT = Symbol('gogospend.requestContext');
type WithContext = Request & { [CONTEXT]?: RequestContext };

/**
 * First v1 middleware. The request ID is always generated here; a client's
 * own `x-request-id` is ignored so logs cannot be correlated or spoofed by it.
 */
export function requestContextMiddleware(req: Request, res: Response, next: NextFunction): void {
  const context: RequestContext = { requestId: randomUUID(), startedAt: performance.now() };
  (req as WithContext)[CONTEXT] = context;
  res.setHeader(REQUEST_ID_HEADER, context.requestId);
  next();
}

export function requestContext(req: Request): RequestContext {
  const context = (req as WithContext)[CONTEXT];
  if (!context) throw new Error('v1 request context is missing; requestContextMiddleware must run first.');
  return context;
}

/** The session resolved by ApplicationSessionGuard; only on bound routes. */
export const CurrentSession = createParamDecorator((_data: unknown, ctx: ExecutionContext): SessionContext => {
  const session = requestContext(ctx.switchToHttp().getRequest<Request>()).session;
  if (!session) throw new Error('CurrentSession used on a route without a bound session.');
  return session;
});

/** The verified token identity; on every non-public route. */
export const CurrentIdentity = createParamDecorator((_data: unknown, ctx: ExecutionContext): ApiIdentity => {
  const identity = requestContext(ctx.switchToHttp().getRequest<Request>()).identity;
  if (!identity) throw new Error('CurrentIdentity used on a public route.');
  return identity;
});
