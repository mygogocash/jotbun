// `npm run db:migrate -w gogospend-api` (in the image: `node
// dist/database/migrate-cli.js`): applies migrations with the migration-only
// DATABASE_DIRECT_URL. A separate release step that runs before the new API
// and workers start; never part of API or worker startup. A failure reports
// the error class and SQLSTATE only (driver text can echo the connection).
import { runMain } from '../common/process-lifecycle';
import { runMigrations } from './migrations';
import { ConfigurationError } from '../common/configuration-error';

async function main(): Promise<void> {
  const url = process.env.DATABASE_DIRECT_URL;
  if (!url) throw new ConfigurationError('DATABASE_DIRECT_URL is not configured.');
  await runMigrations(url);
  console.log('Migrations are up to date.');
}

if (require.main === module) void runMain('migration', main);
