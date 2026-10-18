type TelemetrySink = (event: string, properties: Record<string, unknown>) => void;
let consentedSink: TelemetrySink | null = null;
/** No analytics leave this app until an integration has obtained consent. */
export function setConsentedTelemetrySink(sink: TelemetrySink | null): void { consentedSink = sink; }
export function trackClientEvent(event: string, properties: Record<string, unknown> = {}): void {
  consentedSink?.(event, properties);
}
