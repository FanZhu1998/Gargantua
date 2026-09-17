import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { sanitizePreferences, sanitizeWindowState } = require('../../src/electron/preferences.cjs');

test('preferences allow only known, bounded data', () => {
  assert.deepEqual(sanitizePreferences({ state: { angle: 500, zoom: -1, quality: 'unknown', paused: true, injected: 'x' }, preset: 'bad', tipsDismissed: true }), {
    version: 1,
    state: { angle: 80, zoom: 0.65, paused: true },
    preset: 'gargantua',
    tipsDismissed: true,
  });
  assert.deepEqual(sanitizePreferences(JSON.parse('{"__proto__":{"polluted":true}}')).state, {});
  assert.equal({}.polluted, undefined);
});

test('window state rejects invalid or implausible geometry', () => {
  assert.deepEqual(sanitizeWindowState({ x: 10, y: 20, width: 1300, height: 800, maximized: true, extra: 1 }), { x: 10, y: 20, width: 1300, height: 800, maximized: true });
  assert.deepEqual(sanitizeWindowState({ x: 1e9, width: 1.2 }), {});
  assert.deepEqual(sanitizeWindowState({ x: -40, y: -20, width: 0, height: -1, maximized: false }), { x: -40, y: -20, maximized: false });
  assert.deepEqual(sanitizeWindowState({ width: 819, height: 639 }), {});
  assert.deepEqual(sanitizeWindowState({ width: 820, height: 640 }), { width: 820, height: 640 });
});
