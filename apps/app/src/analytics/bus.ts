import type { AppEventName, CleanProps } from './catalog.ts';
import { cleanEvent } from './catalog.ts';
import type { Analytics } from './controller.ts';
import { HELD_LIMIT } from './controller.ts';

let installed: Analytics | null = null;

export function setAnalytics(analytics: Analytics | null): void {
  installed = analytics;
}

export function getAnalytics(): Analytics | null {
  return installed;
}

type TelemetrySink = (event: string, properties: CleanProps) => void;
let consentedSink: TelemetrySink | null = null;

/** Tests-only seam: every event after cleanEvent, whatever the consent. It never reaches PostHog. */
export function setConsentedTelemetrySink(sink: TelemetrySink | null): void {
  consentedSink = sink;
}

export type EarlyEvent = { name: AppEventName; properties: CleanProps };

// Events tracked while no controller is installed: at launch, the first
// screen's (onboarding's first step) can come before the app's install has
// finished, which on a phone with a project key waits for PostHog's module.
// Kept in memory only, cleaned, at most HELD_LIMIT, oldest first out; the app's
// install takes them, and its controller holds them until the answer like any
// other (1D-T6's review, m3). Nothing here is ever sent.
const early: EarlyEvent[] = [];

/** Hands over, once, the events tracked while no controller was installed. */
export function takeEarlyEvents(): EarlyEvent[] {
  return early.splice(0, early.length);
}

export function trackClientEvent(event: string, properties?: Record<string, unknown>): void {
  const cleaned = cleanEvent(event, properties);
  if (cleaned === null) return;
  consentedSink?.(cleaned.name, cleaned.properties);
  const analytics = getAnalytics();
  if (analytics === null) {
    early.push(cleaned);
    while (early.length > HELD_LIMIT) early.shift();
    return;
  }
  try {
    analytics.track(cleaned.name, cleaned.properties);
  } catch {
    // Analytics never breaks the action it counts (1D-T7): a save, a delete or
    // a sync report goes on whatever the client does.
  }
}
