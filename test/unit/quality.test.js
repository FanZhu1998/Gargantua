import test from 'node:test';
import assert from 'node:assert/strict';
import { createQualityController } from '../../src/simulation/quality-controller.js';

test('auto quality lowers after sustained slow frames and recovers after smooth frames', () => {
  const quality = createQualityController('auto');
  assert.equal(quality.effectiveName, 'balanced');
  for (let index = 0; index < 10; index++) quality.recordFrame(90);
  assert.equal(quality.effectiveName, 'performance');
  for (let index = 0; index < 300; index++) quality.recordFrame(32);
  assert.equal(quality.effectiveName, 'balanced');
  for (let index = 0; index < 300; index++) quality.recordFrame(32);
  assert.equal(quality.effectiveName, 'cinematic');
});

test('manual quality never changes from frame timing', () => {
  const quality = createQualityController('cinematic');
  for (let index = 0; index < 100; index++) quality.recordFrame(200);
  assert.equal(quality.effectiveName, 'cinematic');
  quality.setMode('performance');
  assert.equal(quality.profile.scale, 0.55);
});
