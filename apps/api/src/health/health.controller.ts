import { Controller, Get, Module } from '@nestjs/common';

import { Access } from '../auth/auth-route.decorator';
import { ProblemException } from '../common/api-problem.filter';
import { DatabaseModule } from '../database/database.module';
import { HealthService, READINESS_RECEIPTS, readinessReceiptsFromEnv } from './health.service';

/**
 * The path the platform's deploy health check (Railway `healthcheckPath`)
 * uses: `/live`. A deploy must be able to go live while the database is
 * degraded or a readiness receipt has lapsed, or an emergency pause or a
 * rollback could never become healthy. The startup itself still verifies
 * the database login (createV1App), so `/live` answering means that check
 * passed. Mandatory receipts are enforced in the operator's release
 * preflight instead (readiness-receipts.ts rules; docs/operations/release.md).
 */
export const DEPLOY_HEALTH_PATH = '/live';

/** How soon a probe should ask again after a 503 from /ready. */
const NOT_READY_RETRY_SECONDS = 30;

/**
 * Public health routes (no token, no rate-limit charge, no client-version
 * check, never paused by a gate):
 * - `GET /live` → 200 `{status: "live"}` while the process runs; it touches
 *   no dependency. The deploy health check and liveness use it.
 * - `GET /ready` → 200 `{status: "ready"}`, or 503 `ApiProblem`
 *   `SERVICE_UNAVAILABLE` (`errors.not_ready`): the readiness signal for
 *   monitoring and for any proxy that routes by readiness. It fails while the
 *   process drains, the database check fails, or any mandatory receipt is
 *   missing, failed, expired or invalid. The response names no check: the
 *   states (receipts included) are in the operator's `readiness` log line.
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
  async ready(): Promise<{ status: 'ready' }> {
    const result = await this.health.ready();
    if (!result.ready) {
      throw new ProblemException(503, 'SERVICE_UNAVAILABLE', { messageKey: 'errors.not_ready', retryAfterSeconds: NOT_READY_RETRY_SECONDS });
    }
    return { status: 'ready' };
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
