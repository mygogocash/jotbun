import { fileURLToPath } from 'node:url'
import type { Plugin, UserConfig } from 'vite'

// The edge Worker reuses the v1 API's domain code (apps/api/src) verbatim: its
// SQL, command protocol, validation and services. Those modules use NestJS
// only for decorators and constructor injection, so at build time Nest's
// packages are swapped for no-op stand-ins and the edge wires the services by
// hand. Nothing else in apps/api is changed or copied.
const SHIMS: Record<string, string> = {
  '@nestjs/common': fileURLToPath(new URL('./src/server/compat/nest-common.ts', import.meta.url)),
  '@nestjs/common/constants': fileURLToPath(new URL('./src/server/compat/nest-constants.ts', import.meta.url)),
  '@nestjs/core': fileURLToPath(new URL('./src/server/compat/nest-core.ts', import.meta.url)),
}

export function apiSeams(): Plugin {
  return {
    name: 'jotbun-api-seams',
    enforce: 'pre',
    resolveId(source) {
      return SHIMS[source] ?? null
    },
  }
}

/** Shared by the app build and the test configs. */
export const apiSeamsConfig: UserConfig = {
  // The API's services are decorated classes (TypeScript legacy decorators);
  // no decorator metadata is emitted because nothing reads it.
  oxc: { decorator: { legacy: true, emitDecoratorMetadata: false } },
  resolve: {
    alias: { '@api': fileURLToPath(new URL('../api/src', import.meta.url)) },
    // apps/api/src resolves these from the repository root and the edge from
    // its own install: one copy each in the bundle.
    dedupe: ['pg', 'drizzle-orm', 'jose'],
  },
}
