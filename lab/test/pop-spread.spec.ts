import { expect, test } from '@playwright/test';
import type {} from '../harness.js';

const spread = (values: number[]) => {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return (Math.max(...values) - Math.min(...values)) / mean;
};

test('pops at one energy differ in length and brightness', async ({ page }) => {
  await page.goto('/harness.html');
  await page.waitForFunction(() => 'harness' in window);
  const { lengths, brightness } = await page.evaluate(() => window.harness.renderPopSpread());
  console.log(
    `length spread ${spread(lengths).toFixed(2)}, brightness spread ${spread(brightness).toFixed(2)}`,
  );
  expect(spread(lengths)).toBeGreaterThan(0.3);
  expect(spread(brightness)).toBeGreaterThan(0.3);
});
