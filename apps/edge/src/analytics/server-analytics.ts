// Server analytics (spec section 7): the analytics id, the server's allow-listed events, anonymous counts and PostHog person deletion.
// The caller checks consent before capture(). Failure and deletion counts carry no person, so they need no consent.
import { BUILTIN_CATEGORIES } from '@gogospend/contracts'
import { PostHog } from 'posthog-node'

export const POSTHOG_EU_HOST = 'https://eu.i.posthog.com'
// PostHog's private API, used only for person deletion.
export const POSTHOG_EU_APP_HOST = 'https://eu.posthog.com'

export type ServerAnalyticsEnv = {
  POSTHOG_PROJECT_TOKEN?: string
  // Never rotates: a new key gives every person a new analytics id, and deletion would then miss the persons made under the old one.
  ANALYTICS_ID_KEY?: string
  POSTHOG_PERSONAL_API_KEY?: string
  POSTHOG_PROJECT_ID?: string
}

export type ServerEventName = 'record_saved' | 'sync_failed' | 'resync_required'
export type ServerEvent = { name: ServerEventName; properties: Record<string, string | number | boolean> }
export type CaptureMessage = { distinctId: string; event: string; properties: Record<string, unknown> }
export type PostHogPort = { captureImmediate(message: CaptureMessage): Promise<unknown> }

export type ServerAnalytics = {
  capture(analyticsId: string, event: ServerEvent): void
  captureFailure(failureName: string, routeId: string): void
  captureAnonymous(event: 'account_deleted'): void
}

const ANALYTICS_ID = /^[0-9a-f]{64}$/
const FAILURE_TYPE = /^[A-Za-z][A-Za-z0-9_]{0,63}$/
const ROUTE = /^[a-z][a-z_.]{0,63}$/
const REASON_CODE = /^[A-Z][A-Z0-9_]{0,63}$/
const RECORD_KINDS: readonly string[] = ['expense', 'income', 'transfer']
const BUILTIN_KEYS: ReadonlySet<string> = new Set(BUILTIN_CATEGORIES.map((category) => category.key))

type Allowed = Record<string, string | number | boolean>

/** The analytics id: the lowercase hex HMAC-SHA256 of the user id under the key, both read as UTF-8. */
export async function analyticsIdFor(userId: string, key: string): Promise<string> {
  const hmacKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = await crypto.subtle.sign('HMAC', hmacKey, new TextEncoder().encode(userId))
  return Array.from(new Uint8Array(mac), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

// Each event keeps only the properties it names, and only values it allows. A category outside the built-in keys is sent as custom.
function allowedProperties(event: ServerEvent): Allowed | null {
  const { properties } = event
  switch (event.name) {
    case 'record_saved': {
      const allowed: Allowed = {}
      const { kind, category_key: categoryKey } = properties
      if (typeof kind === 'string' && RECORD_KINDS.includes(kind)) allowed.kind = kind
      if (categoryKey !== undefined) allowed.category_key = typeof categoryKey === 'string' && BUILTIN_KEYS.has(categoryKey) ? categoryKey : 'custom'
      return allowed
    }
    case 'sync_failed':
    case 'resync_required': {
      const allowed: Allowed = {}
      const { reason_code: reasonCode } = properties
      if (typeof reasonCode === 'string' && REASON_CODE.test(reasonCode)) allowed.reason_code = reasonCode
      return allowed
    }
    default:
      return null
  }
}

// PostHog's Workers guide: send each event at once, and hand the send to waitUntil. privacyMode is set now so that later phases cannot build the client without it.
const defaultPort = (token: string): PostHogPort =>
  new PostHog(token, { host: POSTHOG_EU_HOST, flushAt: 1, flushInterval: 0, requestTimeout: 5000, fetchRetryCount: 1, disableGeoip: true, privacyMode: true })

/** The server's PostHog client, or null while no project token is set: then nothing is sent. */
export function createServerAnalytics(
  env: ServerAnalyticsEnv,
  waitUntil: (promise: Promise<unknown>) => void,
  port: (token: string) => PostHogPort = defaultPort,
): ServerAnalytics | null {
  const token = env.POSTHOG_PROJECT_TOKEN
  if (!token) return null
  const client = port(token)
  const send = (message: CaptureMessage): void => {
    waitUntil(client.captureImmediate(message))
  }
  return {
    capture(analyticsId, event) {
      if (!ANALYTICS_ID.test(analyticsId)) return
      const properties = allowedProperties(event)
      if (properties === null) return
      send({ distinctId: analyticsId, event: event.name, properties: { ...properties, origin: 'server' } })
    },
    captureFailure(failureName, routeId) {
      const type = FAILURE_TYPE.test(failureName) ? failureName : 'Error'
      const route = ROUTE.test(routeId) ? routeId : 'worker'
      send({
        distinctId: crypto.randomUUID(),
        event: '$exception',
        properties: {
          $exception_list: [{ type, value: type, mechanism: { handled: true, synthetic: true } }],
          $exception_fingerprint: `${type}:${route}`,
          route,
          origin: 'server',
          $process_person_profile: false,
        },
      })
    },
    captureAnonymous(event) {
      if (event !== 'account_deleted') return
      send({ distinctId: crypto.randomUUID(), event, properties: { origin: 'server', $process_person_profile: false } })
    },
  }
}

export type PersonDeletion = 'queued' | 'nothing_to_delete'

export class AnalyticsDeletionFailed extends Error {}

/**
 * Asks PostHog EU to delete the person, its events and its recordings. Decided by the analytics key: without it, no analytics id was ever sent.
 * Never logs the personal key or the analytics id.
 */
export async function deletePostHogPerson(env: ServerAnalyticsEnv, userId: string, fetchImpl: typeof fetch = fetch): Promise<PersonDeletion> {
  const key = env.ANALYTICS_ID_KEY
  if (!key) return 'nothing_to_delete'
  const personalKey = env.POSTHOG_PERSONAL_API_KEY
  const projectId = env.POSTHOG_PROJECT_ID
  if (!personalKey || !projectId) throw new AnalyticsDeletionFailed('PostHog deletion is not configured')
  const distinctId = await analyticsIdFor(userId, key)
  let response: Response
  try {
    response = await fetchImpl(`${POSTHOG_EU_APP_HOST}/api/projects/${encodeURIComponent(projectId)}/persons/bulk_delete`, {
      method: 'POST',
      headers: { authorization: `Bearer ${personalKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ distinct_ids: [distinctId], delete_events: true, delete_recordings: true }),
    })
  } catch {
    throw new AnalyticsDeletionFailed('PostHog deletion request failed')
  }
  if (response.status !== 202) throw new AnalyticsDeletionFailed('PostHog deletion was refused')
  const body: unknown = await response.json().catch(() => null)
  const errors = body !== null && typeof body === 'object' && 'deletion_errors' in body ? body.deletion_errors : undefined
  if (!Array.isArray(errors) || errors.length > 0) throw new AnalyticsDeletionFailed('PostHog deletion reported errors')
  return 'queued'
}
