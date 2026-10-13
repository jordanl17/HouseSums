import { expect, test } from '@playwright/test';
import {
  expectNoHorizontalScroll,
  expectNoJavaScript,
  expectOnlyOwnScripts,
  NOT_FOUND_PATH,
  PAGES,
} from './helpers';

/**
 * Every page in the shell: loads with 200, has its heading, the shared header and
 * footer, no horizontal scroll at this project's width, and no JavaScript (pages with the
 * calculator island load scripts from our own origin only).
 * Runs at 360 and 1280 (the two Playwright projects).
 */

for (const { path, title, h1, island } of PAGES) {
  test.describe(`page ${path}`, () => {
    test('loads with its heading, header and footer', async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page).toHaveTitle(title);
      await expect(page.locator('html')).toHaveAttribute('lang', 'en-GB');
      await expect(page.getByRole('heading', { level: 1, name: h1, exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);

      const header = page.getByRole('banner');
      await expect(header.getByRole('link', { name: 'House Sums' })).toBeVisible();
      const nav = page.getByRole('navigation', { name: 'Main' });
      await expect(nav.getByRole('link')).toHaveText(['How it works', 'Sources']);

      const footer = page.getByRole('contentinfo');
      await expect(footer).toContainText('This is a model, not financial advice.');
      await expect(footer).toContainText('The maths of moving in.');
      await expect(footer.getByRole('link')).toHaveText(['About', 'Sources']);
    });

    test('has no horizontal scroll', async ({ page }) => {
      await page.goto(path);
      await expectNoHorizontalScroll(page);
    });

    if (island) {
      test('loads JavaScript only for the calculator, only from our own origin', async ({
        page,
      }) => {
        await expectOnlyOwnScripts(page, path);
      });
    } else {
      test('loads no JavaScript', async ({ page }) => {
        await expectNoJavaScript(page, path);
      });
    }

    test('copy has no em-dashes or exclamation marks', async ({ page }) => {
      await page.goto(path);
      const text = await page.locator('body').innerText();
      expect(text).not.toMatch(/—/);
      expect(text).not.toContain('!');
    });
  });
}

test('the 404 page carries the same header and footer', async ({ page }) => {
  await page.goto(NOT_FOUND_PATH);
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link')).toHaveText([
    'How it works',
    'Sources',
  ]);
  await expect(page.getByRole('contentinfo')).toContainText('The maths of moving in.');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
});
