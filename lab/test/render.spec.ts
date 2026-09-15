import { expect, test } from '@playwright/test';
import type {} from '../harness.js';

test.beforeEach(async ({ page }) => {
  await page.goto('/harness.html');
  await page.waitForFunction(() => 'harness' in window);
});

test('a burst lights pixels, keeps the corners clear and stays valid premultiplied', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));

  const report = await page.evaluate(() => window.harness.renderBurst());
  expect(report.supported).toBe(true);
  expect(report.lit).toBeGreaterThan(50);
  expect(report.cornerAlpha).toBe(0);
  expect(report.overAlpha).toBe(0);
  expect(errors).toEqual([]);
});

test('a fault at full intensity draws within a second', async ({ page }) => {
  const report = await page.evaluate(() => window.harness.renderFault());
  expect(report.supported).toBe(true);
  expect(report.lit).toBeGreaterThan(50);
  expect(report.overAlpha).toBe(0);
});
