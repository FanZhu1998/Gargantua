import { chromium } from '@playwright/test';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildAll } from './build.mjs';
import { startServer } from './serve.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const destination = path.join(root, 'docs', 'images', 'gargantua-preview.png');
const browserCandidates = process.platform === 'win32'
  ? [
      path.join(process.env.ProgramFiles || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(process.env['ProgramFiles(x86)'] || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(process.env.ProgramFiles || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    ]
  : [];
const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH || browserCandidates.find(existsSync);

await buildAll();
const server = await startServer({ port: 0 });
let browser;

try {
  browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
    args: ['--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
  });
  const context = await browser.newContext({
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
    reducedMotion: 'no-preference',
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.setItem('gargantua.preferences.v1', JSON.stringify({
      version: 1,
      state: { paused: true, quality: 'cinematic' },
      preset: 'gargantua',
      tipsDismissed: true,
    }));
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 4173;
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__GARGANTUA_READY__ === true);
  await page.locator('.black-hole-app[data-renderer="webgl"]').waitFor();
  await page.waitForTimeout(750);
  await mkdir(path.dirname(destination), { recursive: true });
  await page.screenshot({ path: destination });
  await context.close();
  console.log(`Captured README preview: ${destination}`);
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
