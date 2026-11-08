import type { AuthEnv } from './env'
import { createAuth, type JotbunAuth } from './create-auth'
import { mailerFromEnv } from './mailer'

// One instance per env object. No cloudflare:workers import: the vault Worker uses this too (Task 10a).
const instances = new WeakMap<AuthEnv, JotbunAuth>()

export function authFor(env: AuthEnv): JotbunAuth {
  const existing = instances.get(env)
  if (existing) return existing
  const created = createAuth(env, { mailer: mailerFromEnv(env) })
  instances.set(env, created)
  return created
}
