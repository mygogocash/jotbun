// P6b: the backup-age alert fires past 26 hours or with no backup at all,
// and prints only ages and flags.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { backupAge, backupAgeLines } from './backup-age.mjs';

const NOW = new Date('2026-10-17T03:00:00.000Z');
const copy = (kind, hoursAgo, id = 'bk_20261016T030000Z_abcdef') => ({
  id,
  kind,
  source: 'recovery-store',
  environment: 'production',
  synthetic: false,
  created_at: new Date(NOW.getTime() - hoursAgo * 3_600_000).toISOString(),
  expires_at: new Date(NOW.getTime() + 24 * 3_600_000).toISOString(),
});

test('the newest logical backup decides the age; 26 hours is the limit', () => {
  const fresh = backupAge({ complete: true, copies: [copy('logical_backup', 30), copy('logical_backup', 2), copy('object_backup', 0.5)] }, NOW);
  assert.deepEqual(fresh, { age_hours: 2, threshold_hours: 26, inventory_complete: true, alert: false, reason: null });
  assert.equal(backupAge({ complete: true, copies: [copy('logical_backup', 26)] }, NOW).alert, false);
  assert.deepEqual(backupAge({ complete: false, copies: [copy('logical_backup', 26.5)] }, NOW), { age_hours: 26.5, threshold_hours: 26, inventory_complete: false, alert: true, reason: 'too_old' });
});

test('no backup at all, an unreadable report, or only other copies alert', () => {
  assert.equal(backupAge({ complete: true, copies: [] }, NOW).reason, 'no_backup');
  assert.equal(backupAge(null, NOW).reason, 'no_backup');
  assert.equal(backupAge({ complete: true, copies: [copy('manual_snapshot', 1), copy('restore_copy', 1)] }, NOW).alert, true);
});

test('lines carry ages and flags only, never copy ids', () => {
  const lines = backupAgeLines(backupAge({ complete: true, copies: [copy('logical_backup', 30, 'bk_20261015T210000Z_123abc')] }, NOW));
  assert.equal(lines.info, 'recovery: backup_age_hours=30 threshold_hours=26 inventory_complete=true');
  assert.equal(lines.alert, 'recovery: alert backup_age reason=too_old backup_age_hours=30 threshold_hours=26');
  assert.ok(!JSON.stringify(lines).includes('bk_'));
});

test('the CLI reads a report on stdin and exits 1 on an alert', () => {
  const script = fileURLToPath(new URL('./backup-age.mjs', import.meta.url));
  const stale = spawnSync(process.execPath, [script], { input: JSON.stringify({ complete: true, copies: [copy('logical_backup', 400)] }), encoding: 'utf8' });
  assert.equal(stale.status, 1);
  assert.match(stale.stderr, /^recovery: alert backup_age reason=too_old/);
  const garbage = spawnSync(process.execPath, [script], { input: 'not json', encoding: 'utf8' });
  assert.equal(garbage.status, 1);
  assert.match(garbage.stdout, /backup_age_hours=none/);
});
