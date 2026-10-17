import { Module } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';

import { AuthModule } from '../auth/auth.module';
import { CategoriesModule } from '../categories/categories.module';
import { CommandsModule } from '../commands/commands.module';
import { requestContextMiddleware } from '../auth/request-context';
import { assertRoutesClassified } from '../auth/route-policy';
import { jsonBody } from '../common/json-body';
import { safeRequestLogger } from '../common/safe-request-logger';
import { DatabaseModule } from '../database/database.module';
import { DatabaseService } from '../database/database.service';
import { WalletsModule } from '../wallets/wallets.module';

/**
 * Root of the standalone v1 API: PostgreSQL and Auth0 only. It must never
 * import the legacy Mongo/Firebase/spend modules or their cron jobs
 * (v1-isolation.spec.ts).
 */
@Module({
  imports: [DatabaseModule, AuthModule, CommandsModule, WalletsModule, CategoriesModule],
})
export class V1AppModule {}

/**
 * `TRUST_PROXY_HOPS`: how many reverse proxies in front of the API may set
 * X-Forwarded-For (Railway: 1). Required in production: left unset behind a
 * proxy, every user would share the proxy's address and one sign-in budget.
 * Outside production it defaults to 0, so a client cannot spoof the address.
 */
export function trustProxyHopsFromEnv(value: string | undefined, nodeEnv = process.env.NODE_ENV): number {
  if (value === undefined || value === '') {
    if (nodeEnv === 'production') throw new Error('TRUST_PROXY_HOPS must be set explicitly in production.');
    return 0;
  }
  const hops = Number(value);
  if (!Number.isInteger(hops) || hops < 0 || hops > 3) throw new Error('TRUST_PROXY_HOPS must be an integer from 0 to 3.');
  return hops;
}

/** Middleware shared by the real app and test apps, in order. */
export function configureV1App(app: INestApplication): void {
  const http = app as NestExpressApplication;
  http.set('trust proxy', trustProxyHopsFromEnv(process.env.TRUST_PROXY_HOPS));
  http.use(requestContextMiddleware);
  // v1 responses carry private or credential-bearing data; nothing is cacheable
  // unless a route says otherwise.
  http.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  http.use(safeRequestLogger);
  http.use(helmet());
  // Master plan: 2 MiB v1 JSON cap; routes may set stricter limits.
  http.use(jsonBody('2mb'));
}

export async function createV1App(): Promise<NestExpressApplication> {
  // abortOnError: false makes configuration errors reject here (main.ts sets
  // the exit code) instead of Nest calling process.exit() itself.
  const app = await NestFactory.create<NestExpressApplication>(V1AppModule, {
    bodyParser: false,
    logger: ['error', 'warn'],
    abortOnError: false,
  });
  try {
    await app.get(DatabaseService).assertLeastPrivilegeLogin();
    assertRoutesClassified(app);
    configureV1App(app);
  } catch (error) {
    await app.close();
    throw error;
  }
  app.enableShutdownHooks();
  return app;
}
