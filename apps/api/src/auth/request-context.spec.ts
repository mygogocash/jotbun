import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { parseMinor } from '@gogospend/contracts';
import request from 'supertest';

import { setLogSink } from '../common/safe-request-logger';
import { createV1TestApp } from '../testing/v1-test-app';
import { Access } from './auth-route.decorator';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

@Controller('v1/probe')
class ProbeController {
  @Get('items/:id') @Access('public') item(@Param('id') id: string) { return { length: id.length }; }
  @Post('echo') @Access('public') echo(@Body() body: Record<string, unknown>) { return { keys: Object.keys(body ?? {}) }; }
  @Get('boom') @Access('public') boom() { throw new Error('SECRET_INTERNAL postgres://user:SECRET_PASSWORD@db.example/db'); }
  @Get('db-down') @Access('public') dbDown() { throw Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), { code: 'ECONNREFUSED' }); }
  @Get('db-restarting') @Access('public') dbRestarting() { throw Object.assign(new Error('terminating connection due to administrator command'), { code: '57P01' }); }
  @Post('amount') @Access('public') amount(@Body() body: { amount_minor?: unknown }) { return { amount: parseMinor(body.amount_minor, { allowZero: false, allowNegative: false }, 'amount_minor').toString() }; }
}

let app: INestApplication;
let logs: string[] = [];
let restoreSink: ReturnType<typeof setLogSink>;

beforeAll(async () => {
  app = await createV1TestApp([ProbeController]);
  restoreSink = setLogSink((line) => logs.push(line));
});

afterAll(async () => {
  setLogSink(restoreSink);
  await app.close();
});

beforeEach(() => {
  logs = [];
});

describe('request context', () => {
  it('generates a request id per request and ignores a client-supplied one', async () => {
    const first = await request(app.getHttpServer()).get('/v1/probe/items/1').set('x-request-id', 'client-chosen');
    const second = await request(app.getHttpServer()).get('/v1/probe/items/1');
    expect(first.headers['x-request-id']).toMatch(UUID);
    expect(first.headers['x-request-id']).not.toBe(second.headers['x-request-id']);
  });
});

describe('safe request logging', () => {
  it('logs route templates, status and latency but never query strings, headers, paths or bodies', async () => {
    const server = app.getHttpServer();
    await request(server)
      .get('/v1/probe/items/SECRET_PATH_ID?token=SECRET_QUERY&signed=SECRET_URL')
      .set({ authorization: 'Bearer SECRET_HEADER', 'x-gogospend-session': 'SECRET_SESSION', cookie: 'sid=SECRET_COOKIE' });
    await request(server).post('/v1/probe/echo').send({ note: 'SECRET_BODY', amount_minor: '6500' });
    await request(server).get('/v1/probe/boom');
    await request(server).get('/v1/no-such-route?SECRET_UNMATCHED=1');

    // SECRET_ and Bearer cannot be part of a request id (lowercase hex) or a number: looked for everywhere.
    expect(logs.join('\n')).not.toMatch(/SECRET_|Bearer/);
    const entries = logs.map((line) => JSON.parse(line) as Record<string, unknown>);
    // The amount is digits, which a random request id can contain (CI run 40616621319 logged
    // 3b86d41e-c46d-4812-b9e2-80cd68765006). So each request id is checked for its shape, and the
    // amount is looked for in every other key and value.
    for (const { request_id, ...rest } of entries) {
      expect(request_id).toMatch(UUID);
      expect(JSON.stringify(rest)).not.toContain('6500');
    }
    const item = entries.find((entry) => entry.route === '/v1/probe/items/:id');
    expect(item).toMatchObject({ method: 'GET', status: 200 });
    expect(item?.request_id).toMatch(UUID);
    expect(typeof item?.latency_ms).toBe('number');
    expect(entries.some((entry) => entry.route === 'unmatched' && entry.status === 404)).toBe(true);
    expect(entries.some((entry) => entry.status === 500 && entry.error === 'Error')).toBe(true);
  });
});

describe('problem responses', () => {
  it.each(['/v1/probe/db-down', '/v1/probe/db-restarting'])('reports a database outage on %s as 503, not 500', async (path) => {
    const res = await request(app.getHttpServer()).get(path);
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('SERVICE_UNAVAILABLE');
    expect(JSON.stringify(res.body)).not.toContain('ECONNREFUSED');
  });

  it('marks every v1 response as not cacheable by default', async () => {
    expect((await request(app.getHttpServer()).get('/v1/probe/items/1')).headers['cache-control']).toBe('no-store');
    expect((await request(app.getHttpServer()).get('/v1/nothing-here')).headers['cache-control']).toBe('no-store');
  });

  it('hides internal errors behind INTERNAL_ERROR', async () => {
    const res = await request(app.getHttpServer()).get('/v1/probe/boom');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ code: 'INTERNAL_ERROR', request_id: res.headers['x-request-id'], message_key: 'errors.internal_error' });
  });

  it('returns NOT_FOUND for unmatched routes', async () => {
    const res = await request(app.getHttpServer()).get('/v1/nothing-here');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('maps contract validation errors to 422 with the field', async () => {
    const res = await request(app.getHttpServer()).post('/v1/probe/amount').send({ amount_minor: '65.00' });
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ code: 'INVALID_MINOR', fields: { amount_minor: 'INVALID_MINOR' } });
  });

  it('answers malformed JSON with a problem, not an HTML page', async () => {
    const res = await request(app.getHttpServer()).post('/v1/probe/echo').set('content-type', 'application/json').send('{"note":');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
    expect(res.body.request_id).toBe(res.headers['x-request-id']);
  });

  it('rejects a body over the 2 MiB v1 cap', async () => {
    const res = await request(app.getHttpServer()).post('/v1/probe/echo').send({ note: 'x'.repeat(2 * 1024 * 1024 + 1) });
    expect(res.status).toBe(413);
    expect(res.body.code).toBe('COMMAND_TOO_LARGE');
  });
});
