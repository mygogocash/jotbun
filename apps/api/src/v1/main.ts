// Standalone v1 API entry (`npm run start:v1`; the image's default command).
// Migrations are never run here: they are a separate, earlier release step
// (`npm run db:migrate` with the migration-only DATABASE_DIRECT_URL).
// SIGTERM/SIGINT (common/process-lifecycle.ts, gracefulHttpStop): /ready
// turns 503 (draining) and every response says Connection: close; after
// SHUTDOWN_DRAIN_DELAY_SECONDS the server stops accepting connections, closes
// idle ones and waits for in-flight requests; only then does the app close
// (and end its database pool). Exit 0, or exit 1 with every socket closed
// once SHUTDOWN_TIMEOUT_SECONDS has passed.
import type { Server } from 'node:http';

import {
  applyHttpTimeouts,
  gracefulHttpStop,
  handleShutdownSignals,
  runMain,
  shutdownDrainDelayMsFromEnv,
  shutdownTimeoutMsFromEnv,
  trackHttpDrain,
} from '../common/process-lifecycle';
import { HealthService } from '../health/health.service';
import { createV1App } from './v1-app.module';

async function main(): Promise<void> {
  const timeoutMs = shutdownTimeoutMsFromEnv(process.env.SHUTDOWN_TIMEOUT_SECONDS);
  const delayMs = shutdownDrainDelayMsFromEnv(process.env.SHUTDOWN_DRAIN_DELAY_SECONDS, timeoutMs);
  const app = await createV1App();
  const server = app.getHttpServer() as Server;
  applyHttpTimeouts(server);
  const drain = trackHttpDrain(server);
  handleShutdownSignals({
    name: 'v1',
    timeoutMs,
    exitWhenStopped: true,
    stop: () => gracefulHttpStop({ markDraining: () => app.get(HealthService).markDraining(), delayMs, drain, closeApp: () => app.close() }),
    onTimeout: () => server.closeAllConnections(),
  });
  const host = process.env.HOST ?? '127.0.0.1';
  const port = Number(process.env.PORT ?? 8091);
  await app.listen(port, host);
  console.log(`GoGoSpend v1 API listening on http://${host}:${port}`);
}

if (require.main === module) void runMain('v1', main);
