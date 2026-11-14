// PostHog's before_send. Consent decides what may leave; an exception is rebuilt
// so a message, a raw stack or a frame's source line cannot carry what the person typed.
import { APP_EVENTS } from './catalog.ts';

export type OutgoingEvent = { event: string; properties?: Record<string, unknown> };
export type GatePolicy = { analytics: boolean; crashReportsWithoutConsent: boolean };

// `$feature_flag_called` is PostHog's flag exposure. The controller reads flags only in
// yes (P6B-T14, B25), and this gate still lets one pass only with consent.
const PASS_THROUGH = new Set(['$screen', '$identify', '$snapshot', '$feature_flag_called']);
// A flag's payload is the owner's free-form JSON: it never leaves on any event.
const FLAG_PAYLOADS = ['$feature_flag_payload', '$feature_flag_bootstrapped_payload'] as const;
const FRAME_KEYS = ['function', 'filename', 'lineno', 'colno', 'in_app', 'platform'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function allowed(name: string): boolean {
  return PASS_THROUGH.has(name) || Object.prototype.hasOwnProperty.call(APP_EVENTS, name);
}

function scrubFrame(frame: Record<string, unknown>): Record<string, unknown> {
  const kept: Record<string, unknown> = {};
  for (const key of FRAME_KEYS) {
    if (key in frame) kept[key] = frame[key];
  }
  return kept;
}

function scrubStack(stack: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  if ('type' in stack) next.type = stack.type;
  if (Array.isArray(stack.frames)) next.frames = stack.frames.filter(isRecord).map(scrubFrame);
  return next;
}

function scrubItem(item: Record<string, unknown>): Record<string, unknown> {
  const type = typeof item.type === 'string' && item.type.length > 0 ? item.type : undefined;
  const next: Record<string, unknown> = { value: type ?? 'Error' };
  if (type !== undefined) next.type = type;
  if ('mechanism' in item) next.mechanism = item.mechanism;
  if (isRecord(item.stacktrace)) next.stacktrace = scrubStack(item.stacktrace);
  return next;
}

function scrubList(list: unknown): Record<string, unknown>[] {
  if (!Array.isArray(list)) return [];
  return list.filter(isRecord).map(scrubItem);
}

function strip<E extends OutgoingEvent>(event: E): E {
  const copy: Record<string, unknown> = { ...event };
  delete copy.$set;
  delete copy.$set_once;
  if (isRecord(copy.properties)) {
    const properties: Record<string, unknown> = { ...copy.properties };
    delete properties.$device_name;
    delete properties.$set;
    delete properties.$set_once;
    for (const key of FLAG_PAYLOADS) delete properties[key];
    copy.properties = properties;
  }
  return copy as E;
}

function scrubException<E extends OutgoingEvent>(event: E, policy: GatePolicy): E | null {
  if (!policy.analytics && !policy.crashReportsWithoutConsent) return null;
  const source = isRecord(event.properties) ? event.properties : {};
  const properties: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (key.startsWith('$exception') || key.startsWith('$issue')) continue;
    // Before yes, no flag rides: after a relaunch the SDK still holds an earlier yes's flags and puts them on
    // every event until the controller's first reset (P6B-T14's second review, M1).
    if (!policy.analytics && (key === '$active_feature_flags' || key.startsWith('$feature/'))) continue;
    properties[key] = value;
  }
  properties.$exception_list = scrubList(source.$exception_list);
  if (!policy.analytics) properties.$process_person_profile = false;
  return strip({ ...event, properties } as E);
}

/** Returns the event PostHog may send, or null when it must not leave the phone. */
export function gateOutgoing<E extends OutgoingEvent>(event: E, policy: GatePolicy): E | null {
  if (event.event === '$exception') return scrubException(event, policy);
  if (!policy.analytics) return null;
  if (!allowed(event.event)) return null;
  return strip(event);
}
