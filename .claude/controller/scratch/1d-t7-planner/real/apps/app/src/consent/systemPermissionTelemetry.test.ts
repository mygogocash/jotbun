// The phone's permission answers as permission_denied (1D-T7): a denial only.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { recordAnalytics } from '../analytics/testing/recordAnalytics.ts';
import { trackSystemPermissionOutcome } from './systemPermissionTelemetry.ts';

test('a camera or photos denial records permission_denied with its class name; a grant or Open Settings records nothing', async () => {
  const recorded = await recordAnalytics();
  try {
    trackSystemPermissionOutcome({ permission: 'camera', outcome: 'deny', promptContext: 'spend_slip', isReprompt: false });
    assert.deepEqual(recorded.sent, [{ kind: 'capture', name: 'permission_denied', properties: { reason_code: 'CAMERA_DENIED', origin: 'app' } }]);
    trackSystemPermissionOutcome({ permission: 'photos', outcome: 'deny', promptContext: 'spend_slip', isReprompt: true });
    assert.deepEqual(recorded.sent.at(-1), { kind: 'capture', name: 'permission_denied', properties: { reason_code: 'PHOTOS_DENIED', origin: 'app' } });
    recorded.sent.length = 0;
    trackSystemPermissionOutcome({ permission: 'camera', outcome: 'grant', promptContext: 'spend_slip' });
    trackSystemPermissionOutcome({ permission: 'photos', outcome: 'open_settings', promptContext: 'spend_slip', openSettingsResult: 'opened', openSettingsMethod: 'app-settings:' });
    assert.deepEqual(recorded.sent, []);
  } finally {
    recorded.restore();
  }
});
