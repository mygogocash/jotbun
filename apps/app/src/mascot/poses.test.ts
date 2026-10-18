import assert from 'node:assert/strict';
import { test } from 'node:test';

import { bunDark, bunLight } from '../theme/bunPalette.ts';
import type { BunColors } from '../theme/bunPalette.ts';
import { contrastRatio } from '../theme/contrast.ts';
import {
  BUN_ART_WIDTH,
  BUN_OUTLINE_WIDTH,
  BUN_POSE_NAMES,
  BUN_POSES,
  BUN_SIZES,
  bunHeight,
  bunPaints,
  DEFAULT_BUN_POSE,
} from './poses.ts';
import type { BunPart, BunPoseName, BunShape } from './poses.ts';

const parts = (pose: BunPoseName): Set<BunPart> => new Set(BUN_POSES[pose].shapes.map((shape) => shape.part));
const shapesOf = (pose: BunPoseName, part: BunPart): BunShape[] => BUN_POSES[pose].shapes.filter((shape) => shape.part === part);
const body = (pose: BunPoseName) => {
  const [shape] = shapesOf(pose, 'body');
  assert.ok(shape && shape.kind === 'ellipse', `${pose} has an ellipse body`);
  return shape;
};
/** Top edge of a circle or ellipse, in drawing units. */
const top = (shape: BunShape): number => {
  if (shape.kind === 'circle') return shape.cy - shape.r;
  if (shape.kind === 'ellipse') return shape.cy - shape.ry;
  throw new Error(`no top for ${shape.kind}`);
};
const modes: readonly [string, BunColors][] = [['light', bunLight], ['dark', bunDark]];

test('the twelve poses, holding a receipt by default', () => {
  assert.deepEqual([...BUN_POSE_NAMES].sort(), ['box', 'cheer', 'hello', 'holding-receipt', 'lock', 'magnifier', 'oops-kind', 'peek', 'quiet', 'sleepy', 'thinking', 'wave-bye']);
  assert.deepEqual(Object.keys(BUN_POSES).sort(), [...BUN_POSE_NAMES].sort());
  assert.equal(DEFAULT_BUN_POSE, 'holding-receipt');
});

test('sizes are 32, 56, 96 and 160 pt and the outline is 2.5 at 64 pt', () => {
  assert.deepEqual(BUN_SIZES, { s: 32, m: 56, l: 96, xl: 160 });
  assert.equal(BUN_ART_WIDTH, 64);
  assert.equal(BUN_OUTLINE_WIDTH, 2.5);
  for (const pose of BUN_POSE_NAMES) {
    assert.equal(BUN_POSES[pose].viewBox.width, BUN_ART_WIDTH, `${pose} is drawn 64 units wide`);
    assert.equal(body(pose).strokeWidth, BUN_OUTLINE_WIDTH, `${pose} outline`);
  }
  // The outline scales with the bun: 1.25 pt at s, 6.25 pt at xl.
  assert.equal((BUN_OUTLINE_WIDTH * BUN_SIZES.s) / BUN_ART_WIDTH, 1.25);
  assert.equal((BUN_OUTLINE_WIDTH * BUN_SIZES.xl) / BUN_ART_WIDTH, 6.25);
});

test('every pose is plain geometry: known paints and finite numbers', () => {
  const paints = new Set(['body', 'line', 'cheek', 'receipt', 'receiptLine', 'glint', 'none']);
  for (const pose of BUN_POSE_NAMES) {
    const art = BUN_POSES[pose];
    assert.ok(art.shapes.length > 0, `${pose} draws something`);
    for (const value of Object.values(art.viewBox)) assert.ok(Number.isFinite(value), `${pose} viewBox`);
    for (const shape of art.shapes) {
      assert.ok(paints.has(shape.fill), `${pose} fill ${shape.fill}`);
      if (shape.stroke !== undefined) assert.ok(paints.has(shape.stroke), `${pose} stroke ${shape.stroke}`);
      for (const [key, value] of Object.entries(shape)) {
        if (typeof value === 'number') assert.ok(Number.isFinite(value) && value >= 0, `${pose}.${key}`);
        if (key === 'd') assert.match(String(value), /^M[\d\s.MLHVQCZ-]+$/, `${pose} path`);
      }
    }
  }
});

test('every pose has the body and eyes, with cheeks on all but peek and quiet', () => {
  for (const pose of BUN_POSE_NAMES) {
    const has = parts(pose);
    assert.ok(has.has('body'), `${pose} body`);
    assert.ok(has.has('eye') || has.has('eyeClosed'), `${pose} eyes`);
    assert.equal(shapesOf(pose, 'eye').length + shapesOf(pose, 'eyeClosed').length, 2, `${pose} has two eyes`);
    assert.equal(has.has('cheek'), pose !== 'peek' && pose !== 'quiet', `${pose} cheeks`);
  }
});

test('the default pose holds the blue receipt, with two lines, in front of the body', () => {
  const shapes = BUN_POSES['holding-receipt'].shapes;
  const receipt = shapes.filter((shape) => shape.part === 'receipt');
  assert.ok(receipt.some((shape) => shape.fill === 'receipt'), 'blue receipt');
  assert.equal(receipt.filter((shape) => shape.fill === 'receiptLine' && shape.kind === 'rect').length, 2, 'two lines');
  assert.ok(shapes.findIndex((shape) => shape.part === 'receipt') > shapes.findIndex((shape) => shape.part === 'body'), 'drawn after the body');
  assert.equal(shapesOf('holding-receipt', 'hand').length, 2, 'held in two hands');
});

test('peek shows only the eyes and the top of the bun', () => {
  const has = parts('peek');
  assert.deepEqual([...has].sort(), ['body', 'eye', 'glint']);
  const { viewBox } = BUN_POSES.peek;
  const eyeBottom = Math.max(...shapesOf('peek', 'eye').map((eye) => (eye.kind === 'circle' ? eye.cy + eye.r : Infinity)));
  const bodyShape = body('peek');
  assert.ok(viewBox.y + viewBox.height > eyeBottom, 'the eyes stay in view');
  assert.ok(viewBox.y + viewBox.height < bodyShape.cy + bodyShape.ry, 'the bottom of the bun is cut off by the edge');
  assert.ok(viewBox.y <= top(bodyShape) - BUN_OUTLINE_WIDTH / 2, 'the top outline stays in view');
});

test('arms go up for cheer, one arm waves for hello and wave-bye', () => {
  const raised = (pose: BunPoseName) => shapesOf(pose, 'hand').filter((hand) => top(hand) < top(body(pose))).length;
  assert.equal(raised('cheer'), 2);
  assert.equal(raised('hello'), 1);
  assert.equal(raised('wave-bye'), 1);
  assert.equal(raised('holding-receipt'), 0);
});

test('sleepy closes its eyes, oops-kind stays kind, quiet stays small and neutral', () => {
  assert.equal(shapesOf('sleepy', 'eye').length, 0, 'no open eyes when sleepy');
  assert.equal(shapesOf('sleepy', 'eyeClosed').length, 2);
  // Kind, never sad or scolding: it keeps its cheeks, worries with its brows,
  // and its mouth does not turn down at both ends.
  assert.ok(parts('oops-kind').has('cheek'));
  assert.equal(shapesOf('oops-kind', 'brow').length, 2);
  const mouths = shapesOf('oops-kind', 'mouth');
  assert.equal(mouths.length, 1);
  for (const mouth of mouths) {
    assert.ok(mouth.kind === 'path');
    // y grows downwards. A frown arches up: every point between the corners sits above both corners.
    const ys = mouth.d.match(/-?\d+(\.\d+)?/g)!.map(Number).filter((_, index) => index % 2 === 1);
    const corners = Math.min(ys[0], ys[ys.length - 1]);
    const between = ys.slice(1, -1);
    assert.ok(!(between.length > 0 && between.every((y) => y < corners)), 'no frown');
  }
  const quiet = parts('quiet');
  for (const loud of ['cheek', 'arm', 'hand', 'prop', 'receipt', 'detail', 'brow'] as const) assert.ok(!quiet.has(loud), `quiet has no ${loud}`);
  const eyeRadius = (pose: BunPoseName) => Math.max(...shapesOf(pose, 'eye').map((eye) => (eye.kind === 'circle' ? eye.r : 0)));
  assert.ok(eyeRadius('quiet') < eyeRadius('holding-receipt'), 'quiet has smaller eyes');
});

test('each moment carries its prop', () => {
  for (const pose of ['lock', 'box', 'magnifier'] as const) assert.ok(parts(pose).has('prop'), `${pose} prop`);
  assert.ok(parts('thinking').has('detail'), 'thought bubbles');
  assert.ok(parts('sleepy').has('detail'), 'zz');
});

test('mascot colours come from the palette, and the face reads in light and dark', () => {
  for (const [mode, colors] of modes) {
    const paints = bunPaints(colors);
    const palette = new Set(Object.values(colors).filter((value) => typeof value === 'string'));
    for (const [paint, value] of Object.entries(paints)) {
      if (paint === 'none') assert.equal(value, 'none');
      else assert.ok(palette.has(value), `${mode} ${paint} ${value} is a palette colour`);
    }
    assert.equal(paints.body, colors.bun, `${mode} body is the bun cream`);
    assert.equal(paints.cheek, colors.cheek);
    assert.equal(paints.receipt, colors.paperBlue);
    // The bun stays cream at night, so its face and lines must stay dark.
    assert.ok(contrastRatio(paints.line, paints.body) >= 4.5, `${mode} face on body`);
    // The figure separates from the page and the stage by its outline or its body (1.4.11).
    for (const ground of [colors.background, colors.stage, colors.card]) {
      const best = Math.max(contrastRatio(paints.line, ground), contrastRatio(paints.body, ground));
      assert.ok(best >= 3, `${mode} silhouette on ${ground}`);
    }
  }
});

test('height follows the pose box', () => {
  assert.equal(bunHeight(BUN_POSES['holding-receipt'], 64), 64);
  const peek = BUN_POSES.peek.viewBox;
  assert.equal(bunHeight(BUN_POSES.peek, 128), (128 * peek.height) / peek.width);
  assert.ok(bunHeight(BUN_POSES.peek, 64) < 64);
});
