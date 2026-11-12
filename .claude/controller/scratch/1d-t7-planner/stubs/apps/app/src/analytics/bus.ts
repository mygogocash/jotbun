// RED stub (1D-T7): the base bus, with takeEarlyEvents typed and holding nothing yet.
import type { AppEventName, CleanProps } from './catalog.ts';
import { cleanEvent } from './catalog.ts';
import type { Analytics } from './controller.ts';

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

export function takeEarlyEvents(): EarlyEvent[] {
  return [];
}

export function trackClientEvent(event: string, properties?: Record<string, unknown>): void {
  const cleaned = cleanEvent(event, properties);
  if (cleaned === null) return;
  consentedSink?.(cleaned.name, cleaned.properties);
  getAnalytics()?.track(cleaned.name, cleaned.properties);
}
