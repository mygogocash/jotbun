// Standalone v1 API entry (`npm run start:v1`). Migrations are never run here.
import { createV1App } from './v1-app.module';

async function main(): Promise<void> {
  const app = await createV1App();
  const host = process.env.HOST ?? '127.0.0.1';
  const port = Number(process.env.PORT ?? 8091);
  await app.listen(port, host);
  console.log(`GoGoSpend v1 API listening on http://${host}:${port}`);
}

main().catch((error: unknown) => {
  console.error(`v1 startup failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  process.exitCode = 1;
});
