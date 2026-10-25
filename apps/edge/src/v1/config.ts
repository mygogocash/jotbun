import { ClientVersionGuard, minimumClientVersionsFromEnv } from '@api/common/client-version.guard'
import type { MinimumClientVersions } from '@api/common/client-version.guard'
import { ProblemException } from '@api/common/api-problem.filter'
import { FeatureGates, GATE_SCOPES } from '@api/common/feature-gates'
import type { GateScope } from '@api/common/feature-gates'
import { POLICY_KINDS } from '@gogospend/contracts'
import type { PolicyVersionDto } from '@gogospend/contracts'

import type { V1Env } from './env'
import { logFailure } from './log'
import type { PublishedPolicies } from './protocol'

export const EDGE_CONFIG_KEY = 'config:v1'

/** The JSON stored under config:v1. Every part is optional; a malformed config fails closed. */
export type EdgeConfigJson = {
  gates?: { paused?: GateScope[]; retry_after_seconds?: number }
  policies?: PolicyVersionDto[]
  client_versions?: { ios: string; android: string }
}

export type EdgeConfig = {
  gates: FeatureGates
  policies: PublishedPolicies
  /** Only `check` is used, so a fail-closed guard can stand in for ClientVersionGuard. */
  clientVersions: Pick<ClientVersionGuard, 'check'>
}

/** The retry a fail-closed config asks for (C12). */
const FAIL_CLOSED_RETRY_SECONDS = 30

/**
 * Client minimums missing from both config:v1 and the env. Every non-public call
 * is 503 with a retry, never 426, so a server misconfiguration never shows
 * phones the update-required screen (C5, R13).
 */
const MINIMUMS_UNAVAILABLE: Pick<ClientVersionGuard, 'check'> = {
  check(access) {
    if (access === 'public') return
    throw new ProblemException(503, 'SERVICE_UNAVAILABLE', { retryAfterSeconds: FAIL_CLOSED_RETRY_SECONDS })
  },
}

const VERSION = /^(?:0|[1-9][0-9]{0,5})\.(?:0|[1-9][0-9]{0,5})\.(?:0|[1-9][0-9]{0,5})$/

type ParsedConfig = {
  gates: { paused: GateScope[]; retryAfterSeconds?: number }
  policies: PolicyVersionDto[] | null
  clientVersions: MinimumClientVersions | null
}

/**
 * Reads config:v1 and the env minimums. It never throws: an unreadable or
 * malformed config pauses every gate scope with a retry and publishes no
 * policies, while an absent config leaves gates open and policies unpublished.
 */
export async function readEdgeConfig(kv: KVNamespace, env: V1Env): Promise<EdgeConfig> {
  const fromEnv = minimumsFromEnv(env)
  let stored: unknown
  try {
    stored = await kv.get(EDGE_CONFIG_KEY, 'json')
  } catch (error) {
    logFailure('config_unreadable', error)
    return failClosed(fromEnv)
  }
  if (stored === null) return { gates: new FeatureGates(), policies: null, clientVersions: guardFor(fromEnv) }
  const parsed = parseConfig(stored)
  if (!parsed) {
    logFailure('config_malformed', new Error('config:v1 does not match its shape'))
    return failClosed(fromEnv)
  }
  return {
    gates: new FeatureGates({ paused: parsed.gates.paused, retryAfterSeconds: parsed.gates.retryAfterSeconds }),
    policies: parsed.policies,
    clientVersions: guardFor(parsed.clientVersions ?? fromEnv),
  }
}

function failClosed(fromEnv: MinimumClientVersions | null): EdgeConfig {
  return { gates: new FeatureGates({ paused: [...GATE_SCOPES], retryAfterSeconds: FAIL_CLOSED_RETRY_SECONDS }), policies: null, clientVersions: guardFor(fromEnv) }
}

function guardFor(minimums: MinimumClientVersions | null): Pick<ClientVersionGuard, 'check'> {
  return minimums ? new ClientVersionGuard(minimums) : MINIMUMS_UNAVAILABLE
}

/** MIN_CLIENT_VERSION_IOS and _ANDROID from the env, or null when either is missing or malformed. */
function minimumsFromEnv(env: V1Env): MinimumClientVersions | null {
  try {
    return minimumClientVersionsFromEnv({ MIN_CLIENT_VERSION_IOS: env.MIN_CLIENT_VERSION_IOS, MIN_CLIENT_VERSION_ANDROID: env.MIN_CLIENT_VERSION_ANDROID })
  } catch {
    return null
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const onlyKeys = (value: Record<string, unknown>, allowed: readonly string[]): boolean => Object.keys(value).every((key) => allowed.includes(key))

function parseConfig(value: unknown): ParsedConfig | null {
  if (!isRecord(value) || !onlyKeys(value, ['gates', 'policies', 'client_versions'])) return null
  const gates = value.gates === undefined ? { paused: [] } : gatesOf(value.gates)
  if (!gates) return null
  const policies = value.policies === undefined ? null : policiesOf(value.policies)
  if (value.policies !== undefined && !policies) return null
  const clientVersions = value.client_versions === undefined ? null : clientVersionsOf(value.client_versions)
  if (value.client_versions !== undefined && !clientVersions) return null
  return { gates, policies, clientVersions }
}

function gatesOf(value: unknown): ParsedConfig['gates'] | null {
  if (!isRecord(value) || !onlyKeys(value, ['paused', 'retry_after_seconds'])) return null
  const paused = value.paused ?? []
  if (!Array.isArray(paused) || !paused.every((scope) => (GATE_SCOPES as readonly unknown[]).includes(scope))) return null
  const retry = value.retry_after_seconds
  if (retry !== undefined && (!Number.isInteger(retry) || (retry as number) < 30 || (retry as number) > 3600)) return null
  return retry === undefined ? { paused: paused as GateScope[] } : { paused: paused as GateScope[], retryAfterSeconds: retry as number }
}

function policiesOf(value: unknown): PolicyVersionDto[] | null {
  return Array.isArray(value) && value.every(isPolicy) ? (value as PolicyVersionDto[]) : null
}

function isPolicy(value: unknown): boolean {
  if (!isRecord(value) || !onlyKeys(value, ['kind', 'version', 'required', 'published_at', 'text'])) return false
  const text = value.text
  return (
    (POLICY_KINDS as readonly unknown[]).includes(value.kind) &&
    Number.isSafeInteger(value.version) &&
    (value.version as number) >= 1 &&
    typeof value.required === 'boolean' &&
    typeof value.published_at === 'string' &&
    isRecord(text) &&
    onlyKeys(text, ['th', 'en']) &&
    typeof text.th === 'string' &&
    typeof text.en === 'string'
  )
}

function clientVersionsOf(value: unknown): MinimumClientVersions | null {
  if (!isRecord(value) || !onlyKeys(value, ['ios', 'android'])) return null
  const { ios, android } = value
  return typeof ios === 'string' && typeof android === 'string' && VERSION.test(ios) && VERSION.test(android) ? { ios, android } : null
}
