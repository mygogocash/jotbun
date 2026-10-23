// The Workers runtime module the Cloudflare Vite plugin provides. Typed here
// with the bindings the edge reads (see src/server/env.ts and wrangler.jsonc).
declare module 'cloudflare:workers' {
  export const env: Record<string, unknown>
  /** Extends this invocation for `promise` without delaying the response (ctx.waitUntil). */
  export function waitUntil(promise: Promise<unknown>): void

  /** The Durable Object container API (ctx.container), as far as the parser uses it. */
  export interface ContainerLike {
    readonly running: boolean
    start(options?: { env?: Record<string, string>; enableInternet?: boolean; entrypoint?: string[] }): void
    monitor(): Promise<void>
    setInactivityTimeout(ms: number): Promise<void>
  }

  export interface DurableObjectStateLike {
    readonly container?: ContainerLike
    waitUntil(promise: Promise<unknown>): void
  }

  export class DurableObject<Env = unknown> {
    constructor(ctx: DurableObjectStateLike, env: Env)
    protected readonly ctx: DurableObjectStateLike
    protected readonly env: Env
  }
}
