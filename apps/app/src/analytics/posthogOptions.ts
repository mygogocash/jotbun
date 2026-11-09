// The PostHog client's options (plan 1D-T6), pure: nothing here loads the SDK.
// Consent is the gate's job (L4), so the client is built opted in and every
// event passes `before_send`. Everything the SDK would capture by itself is
// turned off by name: lifecycle events, flags, push, GeoIP, replay's logs,
// network telemetry and tap positions, console errors, and iOS rage taps.
// Every option name and value type is checked against the installed SDK's
// types when the app is typechecked.
import type { PostHogOptions } from 'posthog-react-native';

import type { OutgoingEvent } from './gate.ts';

type ReplayConfig = NonNullable<PostHogOptions['sessionReplayConfig']>;
type ErrorTrackingConfig = NonNullable<PostHogOptions['errorTracking']>;
type RageClickConfig = NonNullable<PostHogOptions['rageClickConfig']>;

/**
 * Whether native replay can keep tap positions out (Q17). posthog-react-native
 * 4.85.1 declares `sessionReplayConfig.captureTouches`, which
 * `@posthog/react-native-plugin` 2.9.0 and later pass to posthog-ios and
 * posthog-android (2.13.0 is installed), so replay may start after a yes.
 * `TOUCHES_OFF` stops the typecheck if an upgrade drops the option.
 */
export const REPLAY_TOUCHES_CAN_BE_OFF: boolean = true;
const TOUCHES_OFF = { captureTouches: false } satisfies ReplayConfig;

/** Drops the phone's name (often the owner's name) from the properties PostHog adds to every event. */
export function dropDeviceName(properties: Record<string, unknown>): Record<string, unknown> {
  const kept = { ...properties };
  delete kept.$device_name;
  return kept;
}

export function posthogOptions(input: {
  host: string;
  beforeSend: (event: OutgoingEvent) => OutgoingEvent | null;
  crashReportsWithoutConsent: boolean;
  replayTouchesCanBeOff: boolean;
}): Record<string, unknown> {
  const sessionReplayConfig = {
    maskAllTextInputs: true,
    maskAllImages: true,
    maskAllSandboxedViews: true,
    captureLog: false,
    captureNetworkTelemetry: false,
    ...(input.replayTouchesCanBeOff ? TOUCHES_OFF : {}),
  } satisfies ReplayConfig;
  // Native crash reports may not pass through before_send, so native capture follows the crash switch.
  const errorTracking = {
    autocapture: {
      uncaughtExceptions: true,
      unhandledRejections: true,
      console: [],
      nativeCrashes: input.crashReportsWithoutConsent,
      androidNdkCrashes: input.crashReportsWithoutConsent,
    },
  } satisfies ErrorTrackingConfig;
  // posthog-ios sends `$rageclick` itself, outside before_send, whenever the native SDK runs
  // (crash reports start it before any yes), and on the keypad a repeated tap is an amount.
  const rageClickConfig = { enabled: false } satisfies RageClickConfig;
  const options = {
    host: input.host,
    defaultOptIn: true,
    captureAppLifecycleEvents: false,
    preloadFeatureFlags: false,
    disableRemoteFeatureFlags: true,
    disableGeoip: true,
    enableSessionReplay: false,
    sessionReplayConfig,
    errorTracking,
    capturePushNotificationSubscriptions: false,
    capturePushNotificationOpened: false,
    rageClickConfig,
    customAppProperties: dropDeviceName,
    before_send: input.beforeSend,
  } satisfies { [K in keyof PostHogOptions]?: unknown };
  return options;
}
