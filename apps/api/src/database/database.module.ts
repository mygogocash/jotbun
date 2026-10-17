import { Module } from '@nestjs/common';
import { Pool } from 'pg';

import { poolConfigFromUrl, poolMaxFromEnv } from './database-config';
import { DatabaseService, PG_POOL } from './database.service';

@Module({
  providers: [
    {
      provide: PG_POOL,
      useFactory: (): Pool => {
        const pool = new Pool(poolConfigFromUrl(process.env.DATABASE_URL, poolMaxFromEnv(process.env.DATABASE_POOL_MAX)));
        // An idle client error must not crash the process; log no details,
        // since driver messages can include connection parameters.
        pool.on('error', () => console.error('[database] idle connection error; it was discarded.'));
        return pool;
      },
    },
    DatabaseService,
  ],
  exports: [DatabaseService],
})
export class DatabaseModule {}
