import { expect, test } from '@playwright/test';
import {
  basePathOf,
  expectNoHorizontalScroll,
  expectNoJavaScript,
  NOT_FOUND_PATH,
} from './helpers';

/**
 * Smoke tests for the home page and the 404 page. They run once per project
 * (mobile-360 and desktop-1280) against the built site under its base path.
 * Paths are relative to baseURL, which ends in the base path and a slash.
 */

test.describe('home page', () => {
  test('is a branded placeholder: the real heading, one plain line, no hero', async ({ page }) => {
    const response = await page.goto('./');
    expect(response?.status()).toBe(200);

    await expect(page).toHaveTitle('House Sums');
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: 'Rent v buy: how long until buying beats renting?',
      }),
    ).toBeVisible();
    await expect(
      page.getByText(
        'The calculator for this question is being built and will appear on this page.',
        { exact: true },
      ),
    ).toBeVisible();
    // No call to action and no fake calculator in production.
    await expect(page.getByRole('main').getByRole('button')).toHaveCount(0);
    await expect(page.getByRole('main').getByRole('link')).toHaveCount(0);
    await expect(page.getByRole('main').locator('input, form')).toHaveCount(0);
    await expect(page.getByRole('contentinfo')).toContainText(
      'This is a model, not financial advice.',
    );
  });

  test('has no horizontal scroll', async ({ page }) => {
    await page.goto('./');
    await expectNoHorizontalScroll(page);
  });

  test('loads no JavaScript', async ({ page }) => {
    await expectNoJavaScript(page, './');
  });
});

test.describe('404 page', () => {
  test('returns 404 with the brief copy and links home under the base path', async ({
    page,
    baseURL,
  }) => {
    const basePath = basePathOf(baseURL);

    const response = await page.goto(NOT_FOUND_PATH);
    expect(response?.status()).toBe(404);

    await expect(
      page.getByRole('heading', {
        level: 1,
        name: 'This page has moved out. No deposit returned.',
      }),
    ).toBeVisible();
    await expectNoHorizontalScroll(page);

    const homeLink = page.getByRole('main').getByRole('link', { name: /home/i });
    await expect(homeLink).toHaveAttribute('href', basePath);

    await homeLink.click();
    await expect(page).toHaveURL(new URL(basePath, baseURL).href);
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: 'Rent v buy: how long until buying beats renting?',
      }),
    ).toBeVisible();
  });

  test('loads no JavaScript', async ({ page }) => {
    await expectNoJavaScript(page, NOT_FOUND_PATH);
  });
});
