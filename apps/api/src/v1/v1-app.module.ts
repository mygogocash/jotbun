import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';

import { DatabaseModule } from '../database/database.module';
import { DatabaseService } from '../database/database.service';

/**
 * Root of the standalone v1 API: PostgreSQL only. It must never import the
 * legacy Mongo/Firebase/spend modules or their cron jobs (v1-isolation.spec.ts).
 */
@Module({
  imports: [DatabaseModule],
})
export class V1AppModule {}

export async function createV1App(): Promise<NestExpressApplication> {
  // abortOnError: false makes configuration errors reject here (main.ts sets
  // the exit code) instead of Nest calling process.exit() itself.
  const app = await NestFactory.create<NestExpressApplication>(V1AppModule, { logger: ['error', 'warn'], abortOnError: false });
  try {
    await app.get(DatabaseService).assertLeastPrivilegeLogin();
  } catch (error) {
    await app.close();
    throw error;
  }
  app.use(helmet());
  // Master plan: 2 MiB v1 JSON cap; routes set stricter limits.
  app.useBodyParser('json', { limit: '2mb' });
  app.enableShutdownHooks();
  return app;
}
