import type { Server } from 'node:http';

import { Module } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';

import { AttachmentsModule } from '../attachments/attachments.module';
import { AuthModule } from '../auth/auth.module';
import { BudgetsModule } from '../budgets/budgets.module';
import { CategoriesModule } from '../categories/categories.module';
import { CommandsModule } from '../commands/commands.module';
import { requestContextMiddleware } from '../auth/request-context';
import { assertRoutesClassified } from '../auth/route-policy';
import { jsonBody } from '../common/json-body';
import { safeRequestLogger } from '../common/safe-request-logger';
import { DatabaseModule } from '../database/database.module';
import { DatabaseService } from '../database/database.service';
import { FeatureGatesModule } from '../common/feature-gates';
import { OperationalLogger } from '../common/operational-metrics';
import { HTTP_TIMEOUTS } from '../common/process-lifecycle';
import { HealthModule } from '../health/health.controller';
import { ExportsModule } from '../exports/exports.module';
import { ImportsModule } from '../imports/imports.module';
import { PrivacyModule } from '../privacy/privacy.module';
import { SyncModule } from '../sync/sync.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { WalletsModule } from '../wallets/wallets.module';
import { ConfigurationError } from '../common/configuration-error';

/**
 * Root of the standalone v1 API: PostgreSQL and Auth0 only. It must never
 * import the legacy Mongo/Firebase/spend modules or their cron jobs
 * (v1-isolation.spec.ts, and the image's release graph,
 * apps/api/scripts/release-graph.mjs). FeatureGatesModule (operational
 * pauses) and HealthModule (`/live`, `/ready`) are P6b's.
 */
@Module({
  imports: [FeatureGatesModule, DatabaseModule, HealthModule, AuthModule, CommandsModule, WalletsModule, CategoriesModule, TransactionsModule, BudgetsModule, SyncModule, ExportsModule, ImportsModule, AttachmentsModule, PrivacyModule],
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
    if (nodeEnv === 'production') throw new ConfigurationError('TRUST_PROXY_HOPS must be set explicitly in production.');
    return 0;
  }
  const hops = Number(value);
  if (!Number.isInteger(hops) || hops < 0 || hops > 3) throw new ConfigurationError('TRUST_PROXY_HOPS must be an integer from 0 to 3.');
  return hops;
}

/**
 * Node's limit on receiving one whole request, owned by
 * common/process-lifecycle.ts (HTTP_TIMEOUTS.requestMs: the upload receive
 * bound + 60 s). Set here as well so test apps get it; main.ts applies the
 * header and keep-alive limits too. JSON bodies stay capped at 2 MiB.
 */
export const V1_REQUEST_TIMEOUT_MS = HTTP_TIMEOUTS.requestMs;

/** Middleware shared by the real app and test apps, in order. */
export function configureV1App(app: INestApplication): void {
  const http = app as NestExpressApplication;
  (http.getHttpServer() as Server).requestTimeout = V1_REQUEST_TIMEOUT_MS;
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
  // Signed provider events: 8 KiB, raw bytes kept for the signature check.
  // Parsed here first, so the general parser below skips them.
  http.use('/v1/auth/provider-events', jsonBody('8kb', { keepRaw: true }));
  // Master plan: 2 MiB v1 JSON cap; routes may set stricter limits.
  http.use(jsonBody('2mb'));
}

export async function createV1App(): Promise<NestExpressApplication> {
  // abortOnError: false makes configuration errors reject here (main.ts sets
  // the exit code) instead of Nest calling process.exit() itself.
  const app = await NestFactory.create<NestExpressApplication>(V1AppModule, {
    bodyParser: false,
    // Nest's own errors and warnings, redacted and without stack traces.
    logger: new OperationalLogger(),
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
  // Signals are handled by main.ts (graceful, bounded shutdown), not Nest's
  // shutdown hooks, which would re-raise the signal around our handler.
  return app;
}
