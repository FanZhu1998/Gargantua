import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { APP_IDENTITY } = require('../../src/electron/app-identity.cjs');
const { focusWindow, registerSingleInstance } = require('../../src/electron/app-lifecycle.cjs');
const packageJson = require('../../package.json');

test('immutable Windows identity stays aligned with package metadata', () => {
  assert.equal(packageJson.productName, APP_IDENTITY.productName);
  assert.equal(APP_IDENTITY.appUserModelId, `com.squirrel.${APP_IDENTITY.squirrelName}.${APP_IDENTITY.executableName}`);
  assert.equal(APP_IDENTITY.setupExe, `${APP_IDENTITY.productName}-Setup.exe`);
  assert.match(APP_IDENTITY.installerIconUrl, /^https:\/\//);
});

test('a second launch restores, shows, and focuses the existing window', () => {
  const actions = [];
  const window = {
    isDestroyed: () => false,
    isMinimized: () => true,
    isVisible: () => false,
    restore: () => actions.push('restore'),
    show: () => actions.push('show'),
    focus: () => actions.push('focus'),
  };
  assert.equal(focusWindow(window), true);
  assert.deepEqual(actions, ['restore', 'show', 'focus']);
  assert.equal(focusWindow({ isDestroyed: () => true }), false);
});

test('single-instance registration quits duplicates and focuses the primary app', () => {
  const primary = new EventEmitter();
  primary.requestSingleInstanceLock = () => true;
  primary.quit = () => assert.fail('primary instance should not quit');
  const window = {
    isDestroyed: () => false,
    isMinimized: () => false,
    isVisible: () => true,
    restore: () => assert.fail('visible window should not restore'),
    show: () => assert.fail('visible window should not show again'),
    focusCalled: false,
    focus() { this.focusCalled = true; },
  };
  assert.equal(registerSingleInstance(primary, () => window), true);
  primary.emit('second-instance');
  assert.equal(window.focusCalled, true);

  const duplicate = new EventEmitter();
  duplicate.requestSingleInstanceLock = () => false;
  duplicate.quitCalled = false;
  duplicate.quit = () => { duplicate.quitCalled = true; };
  assert.equal(registerSingleInstance(duplicate, () => null), false);
  assert.equal(duplicate.quitCalled, true);
});
