import {
  SYSTEM_CONSENT_MEDIA_COPY,
  SYSTEM_CONSENT_SHARED_COPY,
} from "@mobile/consent/systemConsentCopy";

/**
 * Spend camera/photos OS-consent copy (#2651 / epic #2646).
 *
 * Reuses T7 (#2654 / #2656) `SYSTEM_CONSENT_*` strings so primer + denied
 * recovery stay one source of truth. English values are `tc()` lookup keys.
 */
export const spendMediaPermissionCopy = {
  primerTitle: SYSTEM_CONSENT_MEDIA_COPY.primerTitle,
  primerBody: SYSTEM_CONSENT_MEDIA_COPY.primerBody,
  deniedTitle: SYSTEM_CONSENT_MEDIA_COPY.deniedTitle,
  deniedBody: SYSTEM_CONSENT_MEDIA_COPY.deniedBody,
  primerContinue: SYSTEM_CONSENT_SHARED_COPY.continue,
  primerNotNow: SYSTEM_CONSENT_SHARED_COPY.notNow,
  openSettings: SYSTEM_CONSENT_SHARED_COPY.openSettings,
} as const;
