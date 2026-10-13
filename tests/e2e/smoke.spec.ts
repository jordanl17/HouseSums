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
  test('is the heading and the calculator, with nothing else above it', async ({ page }) => {
    const response = await page.goto('./');
    expect(response?.status()).toBe(200);

    await expect(page).toHaveTitle('House Sums');
    const heading = page.getByRole('heading', {
      level: 1,
      name: 'Rent v buy: how long until buying beats renting?',
    });
    await expect(heading).toBeVisible();

    const calculator = page.getByTestId('calculator');
    await expect(calculator).toHaveAttribute('data-hydrated', 'true');
    // Before an area is picked, the answer panel is a calm empty state.
    await expect(calculator).toHaveAttribute('data-status', 'empty');
    await expect(page.getByTestId('answer-card')).toContainText(
      "Pick a place. We'll bring the local numbers.",
    );

    // Nothing but the heading sits between the header and the calculator: no hero, no CTA.
    const between = await page.evaluate(() => {
      const main = document.querySelector('main');
      if (!main) return [];
      return [...main.children]
        .map((el) => el.tagName.toLowerCase())
        .filter((tag) => tag !== 'script' && tag !== 'style');
    });
    expect(between).toEqual(['h1', 'astro-island']);
    await expect(page.getByRole('contentinfo')).toContainText(
      'This is a model, not financial advice.',
    );
  });

  test('has no horizontal scroll', async ({ page }) => {
    await page.goto('./');
    await expectNoHorizontalScroll(page);
  });

  test('loads scripts only from our own origin', async ({ page }) => {
    await expectOnlyOwnScripts(page, './');
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
