// HTTP helpers for v1 integration specs: a signed-in user's requests with
// fresh synthetic access tokens and command headers. Test use only.
import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import type { SignedUp } from './auth-fixtures';
import type { JwksFixture } from './jwks-server';

export type CommandOptions = { key?: string; schema?: number | null; ifMatch?: number | null };

export function v1Client(app: INestApplication, issuer: JwksFixture) {
  return (user: SignedUp) => {
    const auth = async () => ({
      'x-gogospend-client': 'ios/1.0.0',
      authorization: `Bearer ${await issuer.accessToken({ sub: user.who.subject })}`,
      'x-gogospend-session': user.binding,
    });
    const commandHeaders = (options: CommandOptions) => {
      const headers: Record<string, string> = { 'idempotency-key': options.key ?? randomUUID() };
      if (options.schema !== null) headers['x-gogospend-command-schema'] = String(options.schema ?? 1);
      if (options.ifMatch !== undefined && options.ifMatch !== null) headers['if-match'] = `"${options.ifMatch}"`;
      return headers;
    };
    return {
      get: async (path: string) => request(app.getHttpServer()).get(path).set(await auth()),
      post: async (path: string, body: unknown = {}, options: CommandOptions = {}) =>
        request(app.getHttpServer()).post(path).set({ ...(await auth()), ...commandHeaders(options) }).send(body as object),
      patch: async (path: string, body: unknown, options: CommandOptions = {}) =>
        request(app.getHttpServer()).patch(path).set({ ...(await auth()), ...commandHeaders(options) }).send(body as object),
      /** A request with only the session headers (no command headers). */
      raw: async (method: 'post' | 'patch' | 'delete', path: string, body: unknown = {}, extra: Record<string, string> = {}) =>
        request(app.getHttpServer())[method](path).set({ ...(await auth()), ...extra }).send(body as object),
    };
  };
}
