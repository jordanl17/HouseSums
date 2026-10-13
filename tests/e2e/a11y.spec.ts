import { expect, test } from '@playwright/test';
import {
  A11Y_PAGES,
  CALCULATOR_STATES,
  expectNoSeriousViolations,
  THEMES,
  waitForCalculator,
} from './axe-helpers';

/**
 * Automated accessibility (phase 6, a11y-ux): axe-core with the WCAG 2.0, 2.1 and 2.2 A and AA
 * rules on every page type, in light and dark, at 360 and 1280 (the two Playwright projects), and
 * on the calculator states a page load doesn't show: the advanced panel, a source tooltip, the
 * year-by-year table, the area list, the chart's year inspector and the unknown-area message.
 * Serious and critical findings fail; every finding is attached to the test report.
 *
 * Paths are relative to baseURL, so the same scans run against the live site after each deploy.
 */

for (const theme of THEMES) {
  test.describe(`${theme} theme`, () => {
    test.use({ colorScheme: theme });

    for (const entry of A11Y_PAGES) {
      test(`${entry.name}: no serious or critical axe findings`, async ({ page }) => {
        await page.goto(entry.path);
        if (entry.calculator) await waitForCalculator(page);
        // The page really is in this theme (the scan checks contrast against what it sees).
        const dark = await page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches);
        expect(dark).toBe(theme === 'dark');
        await expectNoSeriousViolations(page, { label: `${entry.name} (${theme})` });
      });
    }

    for (const state of CALCULATOR_STATES) {
      test(`${state.name}: no serious or critical axe findings`, async ({ page }) => {
        await page.goto(state.path);
        await waitForCalculator(page);
        const part = await state.open(page);
        // The whole page, with the state showing (contrast of the opened part included).
        await expectNoSeriousViolations(page, { label: `${state.name} (${theme})` });
        // And the opened part on its own, so a finding there is named plainly in the report.
        await expectNoSeriousViolations(page, {
          include: part,
          label: `${state.name}, ${part} (${theme})`,
        });
      });
    }
  });
}
