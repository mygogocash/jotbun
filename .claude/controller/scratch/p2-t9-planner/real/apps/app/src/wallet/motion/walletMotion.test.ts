// The Bun Wallet's motion table (P2-T9, board ax-motion). With Reduce Motion
// on, nothing travels, springs or zooms; feedback moves to fades, instant
// swaps and haptics, and the haptics never change with it.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { motion } from '../../theme/motion.ts';
import { motionFor, WALLET_MOMENTS } from './walletMotion.ts';

test('the reduced-motion table is ax-motion, moment by moment', () => {
  assert.deepEqual(motionFor('trayOpen', true), { motion: { kind: 'fade', durationMs: 150 }, haptic: null });
  assert.deepEqual(motionFor('trayStep', true), { motion: { kind: 'fade', durationMs: 150 }, haptic: 'trayStep' });
  assert.deepEqual(motionFor('walletOpen', true), { motion: { kind: 'instant' }, haptic: 'walletOpen' });
  assert.deepEqual(motionFor('budgetBar', false), { motion: { kind: 'grow', durationMs: 320 }, haptic: null });
  assert.deepEqual(motionFor('recap', true), { motion: { kind: 'instant' }, haptic: 'celebration' });
});

test('with reduced motion nothing travels, springs or zooms, and haptics do not change', () => {
  for (const moment of WALLET_MOMENTS) {
    assert.ok(['fade', 'instant', 'system'].includes(motionFor(moment, true).motion.kind), moment);
    assert.equal(motionFor(moment, true).haptic, motionFor(moment, false).haptic, moment);
  }
});

test('a selection tick per tray step and on opening a wallet; success for a new wallet', () => {
  assert.deepEqual([motion.haptic.trayStep, motion.haptic.walletOpen, motion.haptic.walletAdded], ['selection', 'selection', 'success']);
});

// Every cell of the table, each moment once, in order: full motion, then Reduce Motion.
test('every moment, at full motion and under Reduce Motion, with its haptic', () => {
  assert.deepEqual(WALLET_MOMENTS.map((moment) => [moment, motionFor(moment, false), motionFor(moment, true)]), [
    ['trayOpen', { motion: { kind: 'spring', spring: 'gentle' }, haptic: null }, { motion: { kind: 'fade', durationMs: 150 }, haptic: null }],
    ['trayStep', { motion: { kind: 'morph' }, haptic: 'trayStep' }, { motion: { kind: 'fade', durationMs: 150 }, haptic: 'trayStep' }],
    ['save', { motion: { kind: 'fly' }, haptic: null }, { motion: { kind: 'fade', durationMs: 200 }, haptic: null }],
    ['savedToast', { motion: { kind: 'spring', spring: 'snappy' }, haptic: null }, { motion: { kind: 'fade', durationMs: 150 }, haptic: null }],
    ['walletOpen', { motion: { kind: 'spring', spring: 'gentle' }, haptic: 'walletOpen' }, { motion: { kind: 'instant' }, haptic: 'walletOpen' }],
    ['hideAmounts', { motion: { kind: 'fade', durationMs: 150 }, haptic: null }, { motion: { kind: 'instant' }, haptic: null }],
    ['budgetBar', { motion: { kind: 'grow', durationMs: 320 }, haptic: null }, { motion: { kind: 'instant' }, haptic: null }],
    ['walletAdded', { motion: { kind: 'spring', spring: 'bouncy' }, haptic: 'walletAdded' }, { motion: { kind: 'fade', durationMs: 150 }, haptic: 'walletAdded' }],
    ['recap', { motion: { kind: 'confetti' }, haptic: 'celebration' }, { motion: { kind: 'instant' }, haptic: 'celebration' }],
    ['page', { motion: { kind: 'system' }, haptic: null }, { motion: { kind: 'system' }, haptic: null }],
  ]);
});
