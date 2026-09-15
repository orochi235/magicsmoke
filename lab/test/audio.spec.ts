import { expect, test } from '@playwright/test';
import type { VoiceName } from '../harness.js';

test.beforeEach(async ({ page }) => {
  await page.goto('/harness.html');
  await page.waitForFunction(() => 'harness' in window);
});

const transients: [VoiceName, number][] = [
  ['pop', 0.3],
  ['crackle', 0.2],
  ['shower', 1],
  ['arc', 0.4],
];

for (const [name, longest] of transients) {
  test(`the ${name} voice sounds, stays under full scale and falls silent`, async ({ page }) => {
    const report = await page.evaluate((voice) => window.harness.renderVoice(voice, 1), name);
    expect(report.peak).toBeGreaterThan(0.01);
    expect(report.peak).toBeLessThanOrEqual(1);
    expect(report.lastAudible).toBeLessThanOrEqual(report.expectedEnd + 0.05);
    expect(report.lastAudible).toBeLessThan(longest);
  });
}

test('the hum sounds steadily at full level', async ({ page }) => {
  const report = await page.evaluate(() => window.harness.renderVoice('hum', 1));
  expect(report.rms).toBeGreaterThan(0.005);
  expect(report.peak).toBeLessThanOrEqual(1);
  expect(report.lastAudible).toBeGreaterThan(1.4);
});

test('nothing unlocks audio until the page is clicked', async ({ page }) => {
  expect(await page.evaluate(() => window.harness.engineUnlocked())).toBe(false);
  await page.mouse.click(10, 10);
  expect(await page.evaluate(() => window.harness.engineUnlocked())).toBe(true);
});
