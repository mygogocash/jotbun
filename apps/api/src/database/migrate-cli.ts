// `npm run db:migrate -w gogospend-api`: applies migrations with the
// migration-only DATABASE_DIRECT_URL. Never part of API or worker startup.
import { runMigrations } from './migrations';

async function main(): Promise<void> {
  const url = process.env.DATABASE_DIRECT_URL;
  if (!url) throw new Error('DATABASE_DIRECT_URL is not configured.');
  await runMigrations(url);
  console.log('Migrations are up to date.');
}

main().catch((error: unknown) => {
  console.error(`Migration failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  process.exitCode = 1;
});
