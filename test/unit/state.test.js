import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_STATE, updateState, advanceTime, formatParameter } from '../../src/simulation/state.js';

test('options clamp to supported camera and appearance ranges', () => {
  const state = updateState(DEFAULT_STATE, { angle: -20, roll: 20, glow: 99, zoom: 0, speed: 10 });
  assert.equal(state.angle, 1);
  assert.equal(state.roll, Math.PI);
  assert.equal(state.glow, 2.2);
  assert.equal(state.zoom, 0.65);
  assert.equal(state.speed, 3);
  assert.equal(DEFAULT_STATE.angle, 4);
});

test('invalid patches cannot corrupt state or silently introduce misspellings', () => {
  for (const patch of [{ angle: NaN }, { zoom: Infinity }, { glow: '1' }, { paused: 1 }, { quality: 'ultra' }, { inclination: 5 }, null, []]) {
    assert.throws(() => updateState(DEFAULT_STATE, patch), TypeError);
  }
  const original = { ...DEFAULT_STATE };
  assert.throws(() => updateState(original, { zoom: 1.3, glow: NaN }));
  assert.deepEqual(original, DEFAULT_STATE);
});

test('pause and zero speed stop time while resume is bounded after tab suspension', () => {
  assert.equal(advanceTime(35, 0.05, { paused: true, speed: 1 }), 35);
  assert.equal(advanceTime(35, 0.05, { paused: false, speed: 0 }), 35);
  assert.equal(advanceTime(35, 0.05, { paused: false, speed: 2 }), 35.1);
  assert.equal(advanceTime(35, 300, { paused: false, speed: 1 }), 35.08);
});

test('formatted values include visible and assistive units', () => {
  assert.equal(formatParameter('roll', Math.PI / 2), '90°');
  assert.equal(formatParameter('roll', Math.PI / 2, true), '90 degrees');
  assert.equal(formatParameter('zoom', 1.25, true), '1.25 times');
});
