import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
import path from 'node:path';

const windowsChrome = process.platform === 'win32'
  ? [path.join(process.env.ProgramFiles || '', 'Google/Chrome/Application/chrome.exe'), path.join(process.env['ProgramFiles(x86)'] || '', 'Microsoft/Edge/Application/msedge.exe')].find(existsSync)
  : undefined;
const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH || windowsChrome;

export default defineConfig({
  testDir: './test',
  globalSetup: './test/global-setup.js',
  timeout: 45_000,
  workers: 1,
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 1280, height: 820 },
    reducedMotion: 'reduce',
    launchOptions: { ...(executablePath ? { executablePath } : {}), args: ['--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] },
  },
});
