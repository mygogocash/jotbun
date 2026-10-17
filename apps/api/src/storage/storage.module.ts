import { Module } from '@nestjs/common';

import { objectStoreFromEnv } from './object-store-config';

/** Injection token for the service's private ObjectStore. */
export const OBJECT_STORE = Symbol('OBJECT_STORE');

/** The private object store (R2; `OBJECT_STORE=memory` for local development only). */
@Module({
  providers: [{ provide: OBJECT_STORE, useFactory: () => objectStoreFromEnv(process.env) }],
  exports: [OBJECT_STORE],
})
export class StorageModule {}
