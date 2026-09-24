import {
  trackSystemPermissionOutcome,
  type SystemPermissionOpenSettingsResult,
} from "@mobile/consent/systemPermissionTelemetry";

/**
 * Spend camera/photos OS-permission telemetry (#2651 hooks + T6 #2653).
 *
 * Emits cross-surface `system_permission_outcome` (no legacy spend_* events).
 */

const PROMPT_CONTEXT = "spend_slip";

export function trackSpendMediaPermissionRequested(_input?: {
  source?: "photos" | "camera";
  isReprompt?: boolean;
}): void {
  // AC covers grant / deny / open_settings — primer Continue is not a funnel
  // outcome. Kept as a call-site hook for future requested insights.
  void _input;
}

export function trackSpendMediaPermissionGranted(input?: {
  source?: "photos" | "camera";
  isReprompt?: boolean;
}): void {
  if (!input?.source) return;
  trackSystemPermissionOutcome({
    permission: input.source,
    outcome: "grant",
    promptContext: PROMPT_CONTEXT,
    ...(input.isReprompt !== undefined
      ? { isReprompt: input.isReprompt }
      : {}),
  });
}

export function trackSpendMediaPermissionDenied(input?: {
  source?: "photos" | "camera";
  isReprompt?: boolean;
}): void {
  if (!input?.source) return;
  trackSystemPermissionOutcome({
    permission: input.source,
    outcome: "deny",
    promptContext: PROMPT_CONTEXT,
    ...(input.isReprompt !== undefined
      ? { isReprompt: input.isReprompt }
      : {}),
  });
}

export type SpendMediaOpenSettingsOutcome =
  SystemPermissionOpenSettingsResult;

/**
 * Call when the member taps Open Settings after a camera/photos deny.
 */
export function trackSpendMediaOpenSettings(input: {
  outcome: SpendMediaOpenSettingsOutcome;
  method?: string;
  /** Which media source was denied when the CTA was shown (optional). */
  source?: "photos" | "camera";
}): void {
  trackSystemPermissionOutcome({
    permission: input.source ?? "photos",
    outcome: "open_settings",
    promptContext: PROMPT_CONTEXT,
    openSettingsResult: input.outcome,
    ...(input.method !== undefined
      ? { openSettingsMethod: input.method }
      : {}),
  });
}
