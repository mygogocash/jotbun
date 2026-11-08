import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { OutgoingEvent } from './gate.ts';
import { REPLAY_TOUCHES_CAN_BE_OFF, dropDeviceName, posthogOptions } from './posthogOptions.ts';

const beforeSend = (event: OutgoingEvent): OutgoingEvent | null => event;

const expected = (crash: boolean, touches: boolean) => ({
  host: 'https://edge.test/ingest',
  defaultOptIn: true,
  captureAppLifecycleEvents: false,
  preloadFeatureFlags: false,
  disableRemoteFeatureFlags: true,
  disableGeoip: true,
  enableSessionReplay: false,
  sessionReplayConfig: {
    maskAllTextInputs: true,
    maskAllImages: true,
    maskAllSandboxedViews: true,
    captureLog: false,
    captureNetworkTelemetry: false,
    ...(touches ? { captureTouches: false } : {}),
  },
  errorTracking: { autocapture: { uncaughtExceptions: true, unhandledRejections: true, console: [], nativeCrashes: crash, androidNdkCrashes: crash } },
  capturePushNotificationSubscriptions: false,
  capturePushNotificationOpened: false,
  rageClickConfig: { enabled: false },
  customAppProperties: dropDeviceName,
  before_send: beforeSend,
});

test('the client is built with replay masked, logs and network capture off, no lifecycle, flag, push or GeoIP traffic, and console errors not captured', () => {
  const options = posthogOptions({ host: 'https://edge.test/ingest', beforeSend, crashReportsWithoutConsent: true, replayTouchesCanBeOff: true });
  // The two functions are compared by identity.
  assert.deepEqual(options, expected(true, true));
  assert.equal(options.customAppProperties, dropDeviceName);
  assert.equal(options.before_send, beforeSend);

  const touchesKept = posthogOptions({ host: 'https://edge.test/ingest', beforeSend, crashReportsWithoutConsent: true, replayTouchesCanBeOff: false });
  assert.deepEqual(touchesKept, expected(true, false));
  assert.equal('captureTouches' in (touchesKept.sessionReplayConfig as Record<string, unknown>), false);

  const consentOnly = posthogOptions({ host: 'https://edge.test/ingest', beforeSend, crashReportsWithoutConsent: false, replayTouchesCanBeOff: true });
  assert.deepEqual(consentOnly, expected(false, true));

  assert.deepEqual(dropDeviceName({ $device_name: "Kan's iPhone", $os_name: 'iOS' }), { $os_name: 'iOS' });
});

test('replay can start after a yes: the installed SDK lets native replay keep tap positions out', () => {
  assert.equal(REPLAY_TOUCHES_CAN_BE_OFF, true);
});
