import { expect, test } from '@playwright/test';
import type {} from '../harness.js';

test('bursts piling onto one spot never burn a white disc', async ({ page }) => {
  await page.goto('/harness.html');
  await page.waitForFunction(() => 'harness' in window);
  const report = await page.evaluate(() => window.harness.renderFlashStack());
  expect(report.supported).toBe(true);
  console.log(`saturated pixels: ${report.saturated}`);
  // 466 before glows relit instead of stacking, 150 after. Streak cores crossing account for most of the rest.
  expect(report.saturated).toBeLessThan(250);
});
