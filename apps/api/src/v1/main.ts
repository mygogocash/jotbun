// Standalone v1 API entry (`npm run start:v1`; the image's default command).
// Migrations are never run here: they are a separate, earlier release step
// (`npm run db:migrate` with the migration-only DATABASE_DIRECT_URL).
// SIGTERM/SIGINT: /ready turns 503 (draining), the server stops accepting
// connections and in-flight requests finish within SHUTDOWN_TIMEOUT_SECONDS;
// after that the remaining sockets are closed and the process exits 1.
import type { Server } from 'node:http';

import { applyHttpTimeouts, handleShutdownSignals, runMain, shutdownTimeoutMsFromEnv } from '../common/process-lifecycle';
import { HealthService } from '../health/health.service';
import { createV1App } from './v1-app.module';

async function main(): Promise<void> {
  const timeoutMs = shutdownTimeoutMsFromEnv(process.env.SHUTDOWN_TIMEOUT_SECONDS);
  const app = await createV1App();
  const server = app.getHttpServer() as Server;
  applyHttpTimeouts(server);
  handleShutdownSignals({
    name: 'v1',
    timeoutMs,
    exitWhenStopped: true,
    stop: async () => {
      app.get(HealthService).markDraining();
      await app.close();
    },
    onTimeout: () => server.closeAllConnections(),
  });
  const host = process.env.HOST ?? '127.0.0.1';
  const port = Number(process.env.PORT ?? 8091);
  await app.listen(port, host);
  console.log(`GoGoSpend v1 API listening on http://${host}:${port}`);
}

if (require.main === module) void runMain('v1', main);
