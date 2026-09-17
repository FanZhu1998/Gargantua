import { test, expect, chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const electronPath = require('electron');
const root = fileURLToPath(new URL('../..', import.meta.url));
const profile = path.join(root, 'test-results', 'electron-profile');

test.afterAll(async () => {
  await rm(profile, { recursive: true, force: true });
});

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function waitForCdp(port, child, logs) {
  const endpoint = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error(`Electron exited before startup.\n${logs.text}`);
    try {
      const response = await fetch(`${endpoint}/json/version`);
      if (response.ok) return endpoint;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Electron did not expose its debugging endpoint.\n${logs.text}`);
}

async function stopApp(running) {
  const exited = once(running.child, 'exit').catch(() => []);
  try { await running.window.close({ runBeforeUnload: true }); } catch {}
  try { await running.browser.close(); } catch {}
  await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 3000))]);
  if (running.child.exitCode === null) {
    running.child.kill();
    await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 3000))]);
  }
}

async function launchApp({ clean = false } = {}) {
  if (clean) await rm(profile, { recursive: true, force: true });
  await mkdir(profile, { recursive: true });
  const port = await freePort();
  const logs = { text: '' };
  const child = spawn(electronPath, [
    '--no-sandbox',
    '--disable-gpu',
    '--in-process-gpu',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    root,
  ], {
    // Windows' native spellchecker can write helper directories relative to
    // the process working directory on restricted CI hosts. Keep every test
    // artifact under the ignored profile rather than polluting the repo root.
    cwd: profile,
    env: {
      ...process.env,
      // The managed test host blocks Electron's sandbox subprocesses. This
      // bypass is accepted only by an unpackaged development build.
      APPDATA: path.join(profile, 'roaming-app-data'),
      GARGANTUA_TEST_NO_OS_SANDBOX: '1',
      GARGANTUA_TEST_USER_DATA: profile,
      LOCALAPPDATA: path.join(profile, 'local-app-data'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const collect = chunk => { logs.text = `${logs.text}${chunk}`.slice(-12_000); };
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);

  let browser;
  try {
    browser = await chromium.connectOverCDP(await waitForCdp(port, child, logs));
    const context = browser.contexts()[0];
    if (!context) throw new Error('Electron did not expose a browser context.');
    let window = context.pages().find(page => page.url().startsWith('gargantua://'));
    if (!window) window = await context.waitForEvent('page', { timeout: 10_000 });
    await window.waitForFunction(() => window.__GARGANTUA_READY__ === true);
    const welcome = window.locator('[data-dialog="welcome"]');
    if (await welcome.isVisible()) {
      await welcome.locator('[data-hide-tips]').check();
      await welcome.getByRole('button', { name: 'Start exploring' }).click();
    }
    return { browser, child, context, logs, window };
  } catch (error) {
    if (browser) await browser.close().catch(() => {});
    if (child.exitCode === null) child.kill();
    throw new Error(`${error.message}\n${logs.text}`, { cause: error });
  }
}

test('desktop shell is isolated, offline, and blocks scripts, permissions, and navigation', async () => {
  const running = await launchApp({ clean: true });
  try {
    const { browser, context, window } = running;
    expect(window.url()).toBe('gargantua://app/index.html');
    const environment = await window.evaluate(async () => ({
      require: typeof window.require,
      process: typeof window.process,
      bridge: Object.keys(window.gargantuaDesktop || {}).sort(),
      info: await window.gargantuaDesktop.getAppInfo(),
    }));
    expect(environment.require).toBe('undefined');
    expect(environment.process).toBe('undefined');
    expect(environment.bridge).toEqual(['copyPng', 'getAppInfo', 'loadPreferences', 'onFullscreenChanged', 'platform', 'savePng', 'savePreferences', 'toggleFullscreen']);
    expect(environment.info).toMatchObject({ name: 'Gargantua', version: '1.0.0', platform: 'win32' });

    await window.evaluate(() => {
      const script = document.createElement('script');
      script.textContent = 'window.__inlineExecuted = true';
      document.head.append(script);
    });
    expect(await window.evaluate(() => window.__inlineExecuted)).toBeUndefined();
    expect(await window.evaluate(() => fetch('https://example.com').then(() => false, () => true))).toBe(true);
    expect(await window.evaluate(async () => (await navigator.permissions.query({ name: 'geolocation' })).state)).toBe('denied');

    await window.evaluate(() => window.open('https://example.com'));
    await window.waitForTimeout(200);
    expect(context.pages()).toHaveLength(1);
    expect(browser.isConnected()).toBe(true);
    expect(window.url()).toBe('gargantua://app/index.html');
  } finally { await stopApp(running); }
});

test('desktop preferences survive a complete relaunch', async () => {
  let running = await launchApp({ clean: true });
  await running.window.getByRole('button', { name: 'Pause' }).click();
  await running.window.locator('input[name="angle"]').evaluate(input => {
    input.value = '37';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await running.window.waitForTimeout(700);
  await stopApp(running);

  running = await launchApp();
  try {
    await expect(running.window.locator('input[name="angle"]')).toHaveValue('37');
    await expect(running.window.locator('.black-hole-app')).toHaveAttribute('data-paused', 'true');
  } finally { await stopApp(running); }
});
