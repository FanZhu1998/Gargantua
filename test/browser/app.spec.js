import { test, expect } from '@playwright/test';
import sharp from 'sharp';

async function dismissTips(page) {
  const dialog = page.locator('[data-dialog="welcome"]');
  if (await dialog.isVisible()) await dialog.getByRole('button', { name: 'Start exploring' }).click();
}

async function openApp(page) {
  await page.addInitScript(() => localStorage.setItem('gargantua.preferences.v1', JSON.stringify({ version: 1, state: { paused: true }, preset: 'gargantua', tipsDismissed: true })));
  await page.goto('/');
  await page.waitForFunction(() => window.__GARGANTUA_READY__ === true);
  await dismissTips(page);
  await expect(page.locator('.black-hole-app canvas')).toBeVisible();
}

async function setRange(page, name, value) {
  await page.locator(`input[name="${name}"]`).evaluate((input, next) => { input.value = String(next); input.dispatchEvent(new Event('input', { bubbles: true })); }, value);
  await page.waitForTimeout(80);
}

test('renders a luminous black hole locally with no external requests', async ({ page }) => {
  const external = [], errors = [];
  page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:4173/')) external.push(request.url()); });
  page.on('pageerror', error => errors.push(error.message));
  await openApp(page);
  await expect(page.locator('.black-hole-app')).toHaveAttribute('data-renderer', 'webgl');
  const screenshot = await page.locator('.scene-frame').screenshot();
  const { channels } = await sharp(screenshot).stats();
  expect(channels[0].min).toBeLessThan(20);
  expect(channels[0].max).toBeGreaterThan(220);
  expect(channels[0].mean).toBeGreaterThan(25);
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

test('presets, sliders, reset, pause, and keyboard controls stay synchronized', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Top view' }).click();
  await expect(page.locator('input[name="angle"]')).toHaveValue('68');
  await expect(page.getByRole('button', { name: 'Top view' })).toHaveAttribute('aria-pressed', 'true');
  await setRange(page, 'roll', 1);
  await expect(page.getByRole('button', { name: 'Top view' })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Reset view' }).click();
  await expect(page.locator('input[name="angle"]')).toHaveValue('4');
  await expect(page.locator('input[name="zoom"]')).toHaveValue('1');
  await expect(page.locator('.black-hole-app')).toHaveAttribute('data-paused', 'true');
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(page.locator('.black-hole-app')).toHaveAttribute('data-paused', 'false');
  await page.keyboard.press('Space');
  await expect(page.locator('.black-hole-app')).toHaveAttribute('data-paused', 'true');
  const canvas = page.locator('canvas');
  await canvas.focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('input[name="angle"]')).toHaveValue('5');
  await page.keyboard.press('+');
  await expect(page.locator('input[name="zoom"]')).toHaveValue('1.02');
  await page.keyboard.press('3');
  await expect(page.locator('input[name="angle"]')).toHaveValue('15');
});

test('save PNG captures the scene and responsive layout has no horizontal overflow', async ({ page }) => {
  await openApp(page);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save PNG' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^gargantua-\d{4}-\d{2}-\d{2}-\d{4}\.png$/);
  await page.setViewportSize({ width: 360, height: 760 });
  await expect(page.locator('.inspector')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('input[name="roll"]')).toBeVisible();
});

test('fallback renderer remains interactive when WebGL 2 is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) { return type === 'webgl2' ? null : original.call(this, type, ...args); };
    localStorage.setItem('gargantua.preferences.v1', JSON.stringify({ state: { paused: true }, tipsDismissed: true }));
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__GARGANTUA_READY__ === true);
  await expect(page.locator('.black-hole-app')).toHaveAttribute('data-renderer', 'illustration');
  await expect(page.locator('.live-status')).toContainText('Simplified mode');
  await setRange(page, 'zoom', 1.4);
  await expect(page.locator('input[name="zoom"]')).toHaveValue('1.4');
});

test('reusable module supports isolated instances and complete disposal', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { createSimulator } = await import('/library/index.js');
    const first = document.createElement('div');
    const second = document.createElement('div');
    for (const element of [first, second]) { element.style.cssText = 'width:320px;height:240px'; document.body.append(element); }
    const a = createSimulator(first, { paused: true });
    const b = createSimulator(second, { paused: true });
    let updates = 0;
    const unsubscribe = a.subscribe(() => updates++);
    a.setOptions({ zoom: 1.4 });
    const independent = b.getState().zoom === 1;
    const copy = a.getState();
    copy.zoom = 0.65;
    const isolated = a.getState().zoom === 1.4;
    unsubscribe();
    a.setOptions({ angle: 12 });
    a.dispose();
    a.dispose();
    const remaining = document.querySelectorAll('canvas').length;
    let rejected = false;
    try { a.setOptions({ zoom: 1 }); } catch { rejected = true; }
    b.dispose();
    first.remove(); second.remove();
    return { independent, isolated, updates, remaining, rejected };
  });
  // One canvas belongs to the app itself after both reusable instances are disposed.
  expect(result).toEqual({ independent: true, isolated: true, updates: 2, remaining: 2, rejected: true });
});
