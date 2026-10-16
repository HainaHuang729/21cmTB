import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_POINTS, addPoint, createTransferLUT, evaluateTransfer, movePoint, normalizePoints, removePoint, samplePreset } from '../transfer.js';
import { visibility } from '../data.js';

test('normalization clamps imported curves, rejects invalid coordinates and fixes endpoints', () => {
  const source = [{ x: .6, y: 2 }, { x: .2, y: -.4 }, { x: .6, y: .75 }, { x: NaN, y: .5 }, { x: .4, y: Infinity }];
  assert.deepEqual(normalizePoints(source), [{ x: 0, y: 0 }, { x: .2, y: 0 }, { x: .6, y: .75 }, { x: 1, y: .75 }]);
  assert.equal(source[0].y, 2, 'import does not mutate its input');
  assert.deepEqual(normalizePoints([]), [{ x: 0, y: 0 }, { x: 1, y: 1 }]);
  const large = normalizePoints(Array.from({ length: 40 }, (_, i) => ({ x: i / 39, y: i % 2 })));
  assert.equal(large.length, MAX_POINTS); assert.equal(large[0].x, 0); assert.equal(large.at(-1).x, 1);
  assert.ok(large.every((p, i) => i === 0 || p.x > large[i - 1].x));
});

test('interpolation and LUT preserve peaks and endpoint weights', () => {
  const points = [{ x: 0, y: .2 }, { x: .25, y: 1 }, { x: .75, y: 0 }, { x: 1, y: .6 }];
  assert.equal(evaluateTransfer(-1, points), .2);
  assert.equal(evaluateTransfer(2, points), .6);
  assert.equal(evaluateTransfer(.25, points), 1);
  assert.ok(Math.abs(evaluateTransfer(.125, points) - .6) < 1e-12);
  assert.equal(evaluateTransfer(.5, points), .5);
  assert.equal(evaluateTransfer(NaN, points), 0);
  const lut = createTransferLUT(points, 5);
  assert.ok(lut instanceof Float32Array);
  assert.deepEqual([...lut], [Math.fround(.2), 1, .5, 0, Math.fround(.6)]);
  assert.throws(() => createTransferLUT(points, 1), RangeError);
});

test('dragging cannot cross neighbouring points or move endpoint x positions', () => {
  const points = normalizePoints([{ x: 0, y: 0 }, { x: .3, y: .4 }, { x: .6, y: .7 }, { x: 1, y: 1 }]);
  const right = movePoint(points, 1, { x: .9, y: 2 });
  assert.equal(right[1].x, .599); assert.equal(right[1].y, 1);
  const left = movePoint(points, 2, { x: .1, y: -.5 });
  assert.equal(left[2].x, .301); assert.equal(left[2].y, 0);
  assert.deepEqual(movePoint(points, 0, { x: .5, y: .4 })[0], { x: 0, y: .4 });
  assert.deepEqual(movePoint(points, 3, { x: .5, y: .6 })[3], { x: 1, y: .6 });
  assert.equal(points[1].x, .3, 'editing produces a new curve');
});

test('insertion handles collisions and deletion preserves both endpoints', () => {
  const start = samplePreset('neutral');
  const added = addPoint(start, { x: .4, y: .9 });
  assert.equal(added.length, 3);
  const collision = addPoint(added, { x: .4001, y: .5 });
  assert.equal(collision.length, 3); assert.deepEqual(collision[1], { x: .4, y: .5 });
  assert.deepEqual(removePoint(collision, 0), collision);
  assert.deepEqual(removePoint(collision, 2), collision);
  assert.deepEqual(removePoint(collision, 1), start);
  const full = normalizePoints(Array.from({ length: 16 }, (_, i) => ({ x: i / 15, y: .5 })));
  assert.equal(addPoint(full, { x: .02, y: 1 }).length, MAX_POINTS);
});

test('editable presets retain neutral/ionized mappings and resolve narrow Gaussian bands', () => {
  for (const v of [0, .2, .5, .8, 1]) {
    assert.equal(evaluateTransfer(v, samplePreset('neutral')), v);
    assert.equal(evaluateTransfer(v, samplePreset('ionized')), 1 - v);
  }
  for (const center of [0, .05, .5, .93, 1]) for (const width of [.04, .3, 1]) {
    const points = samplePreset('band', center, width);
    assert.ok(points.length <= MAX_POINTS);
    assert.equal(evaluateTransfer(center, points), 1);
    for (let i = 0; i <= 1000; i++) {
      const x = i / 1000, expected = Math.exp(-.5 * ((x - center) / (width * .5)) ** 2);
      assert.ok(Math.abs(evaluateTransfer(x, points) - expected) < .04, `band conversion error at x=${x}, center=${center}, width=${width}`);
    }
  }
});

test('display visibility routes custom curves without altering source values or retained points', () => {
  const points = Object.freeze([
    Object.freeze({ x: 0, y: .1 }), Object.freeze({ x: .2, y: .9 }),
    Object.freeze({ x: .6, y: .5 }), Object.freeze({ x: 1, y: .1 }),
  ]);
  const values = Object.freeze([0, .1, .2, .4, .6, .8, 1]);
  const settings = { points, region: 'custom', center: .45, width: .12 };
  const expected = [.1, .5, .9, .7, .5, .3, .1];
  values.forEach((v, i) => {
    assert.ok(Math.abs(visibility(v, settings) - expected[i]) < 1e-12);
    assert.equal(visibility(v, settings), evaluateTransfer(v, points));
  });
  // Preset rendering remains analytic rather than silently using the stored
  // custom curve, and returning to custom mode restores that same curve.
  for (const region of ['neutral', 'ionized', 'band']) {
    settings.region = region;
    for (const value of values) {
      const exact = region === 'neutral' ? value : region === 'ionized' ? 1 - value : Math.exp(-.5 * ((value - .45) / .06) ** 2);
      assert.equal(visibility(value, settings), exact);
    }
  }
  settings.region = 'custom';
  assert.ok(Math.abs(visibility(.4, settings) - .7) < 1e-12);
  assert.equal(settings.points, points);
  assert.deepEqual(values, [0, .1, .2, .4, .6, .8, 1]);
});
