import { expect, test } from '@playwright/test';
import {
  basePathOf,
  expectNoHorizontalScroll,
  expectNoJavaScript,
  expectOnlyOwnScripts,
  NOT_FOUND_PATH,
} from './helpers';

/**
 * Smoke tests for the home page (the calculator island) and the 404 page. They run once per project
 * (mobile-360 and desktop-1280) against the built site under its base path.
 * Paths are relative to baseURL, which ends in the base path and a slash.
 */

test.describe('home page', () => {
  test('is the heading and one card per calculator, each opening it', async ({ page }) => {
    const response = await page.goto('./');
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle('House Sums');
    await expect(
      page.getByRole('heading', { level: 1, name: 'UK home-buying calculators' }),
    ).toBeVisible();
    const cards = page.getByTestId('tools').getByRole('link');
    await expect(cards).toHaveCount(2);
    await expect(cards.getByRole('heading', { level: 2 })).toHaveText(['Rent v buy', 'Sell later']);

    await cards.filter({ hasText: 'Rent v buy' }).click();
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: 'Rent v buy: how long until buying beats renting?',
      }),
    ).toBeVisible();
    await expect(page.getByTestId('calculator')).toHaveAttribute('data-hydrated', 'true');

    await page.goBack();
    await cards.filter({ hasText: 'Sell later' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Sell later: what do you get back?' }),
    ).toBeVisible();
  });

  test('sends links made before the move on to the Rent v buy calculator', async ({ page }) => {
    await page.goto('./?a=leeds&p=320000');
    await expect(page).toHaveURL(/\/rent-vs-buy\/\?a=leeds&p=320000$/);
    await expect(page.getByTestId('calculator')).toHaveAttribute('data-status', 'ready');
  });

  test('has no horizontal scroll', async ({ page }) => {
    await page.goto('./');
    await expectNoHorizontalScroll(page);
  });

  test('the Rent v buy page loads scripts only from our own origin', async ({ page }) => {
    await expectOnlyOwnScripts(page, 'rent-vs-buy/');
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
      page.getByRole('heading', { level: 1, name: 'UK home-buying calculators' }),
    ).toBeVisible();
  });

  test('loads no JavaScript', async ({ page }) => {
    await expectNoJavaScript(page, NOT_FOUND_PATH);
  });
});
