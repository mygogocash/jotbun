import { Controller, Get, Module } from '@nestjs/common';

import { Access } from '../auth/auth-route.decorator';
import { ProblemException } from '../common/api-problem.filter';
import { DatabaseModule } from '../database/database.module';
import { HealthService, READINESS_RECEIPTS, readinessReceiptsFromEnv } from './health.service';

/** How soon a probe should ask again after a 503 from /ready. */
const NOT_READY_RETRY_SECONDS = 30;

/**
 * Public health routes (no token, no rate-limit charge, no client-version
 * check, never paused by a gate):
 * - `GET /live` → 200 `{status: "live"}` while the process runs; it touches
 *   no dependency, so a database or receipt problem never restarts the API;
 * - `GET /ready` → 200 `{status: "ready", checks}`, or 503 `ApiProblem`
 *   `SERVICE_UNAVAILABLE` (`errors.not_ready`) whose `fields` name each
 *   check's state: `process` ok/draining, `database` ok/failed/timeout and
 *   `receipt.<kind>` passed/missing/failed/expired/invalid.
 * Point the platform's deploy health check at `/ready`, liveness at `/live`.
 */
@Controller()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get('live')
  @Access('public')
  live(): { status: 'live' } {
    return this.health.live();
  }

  @Get('ready')
  @Access('public')
  async ready(): Promise<{ status: 'ready'; checks: Record<string, string> }> {
    const result = await this.health.ready();
    if (!result.ready) {
      throw new ProblemException(503, 'SERVICE_UNAVAILABLE', { messageKey: 'errors.not_ready', fields: result.checks, retryAfterSeconds: NOT_READY_RETRY_SECONDS });
    }
    return { status: 'ready', checks: result.checks };
  }
}

/** Health routes and the readiness receipts (read once from the environment at startup). */
@Module({
  imports: [DatabaseModule],
  controllers: [HealthController],
  providers: [HealthService, { provide: READINESS_RECEIPTS, useFactory: () => readinessReceiptsFromEnv(process.env) }],
  exports: [HealthService],
})
export class HealthModule {}
