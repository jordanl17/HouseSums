import { expect, test, type Page } from '@playwright/test';

/**
 * Smoke tests for the phase 1 placeholder site. They run once per project
 * (mobile-360 and desktop-1280) against the built site under its base path.
 * Paths are relative to baseURL, which ends in the base path and a slash.
 */

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: (document.scrollingElement ?? document.documentElement).scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
}

/** The base path the site is served under, e.g. '/HouseSums/'. */
function basePathOf(baseURL: string | undefined): string {
  if (!baseURL) {
    throw new Error('baseURL is not set in playwright.config.ts');
  }
  return new URL(baseURL).pathname;
}

test.describe('home page', () => {
  test('loads with the heading, the placeholder line and the footer', async ({ page }) => {
    const response = await page.goto('./');
    expect(response?.status()).toBe(200);

    await expect(page).toHaveTitle('House Sums');
    await expect(page.getByRole('heading', { level: 1, name: 'House Sums' })).toBeVisible();
    await expect(
      page.getByText('Rent v buy calculator. Coming soon.', { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('contentinfo')).toContainText(
      'This is a model, not financial advice.',
    );
  });

  test('has no horizontal scroll', async ({ page }) => {
    await page.goto('./');
    await expectNoHorizontalScroll(page);
  });

  test('loads no JavaScript', async ({ page }) => {
    const scriptRequests: string[] = [];
    page.on('request', (request) => {
      if (request.resourceType() === 'script') {
        scriptRequests.push(request.url());
      }
    });

    await page.goto('./', { waitUntil: 'networkidle' });

    expect(scriptRequests).toEqual([]);
    await expect(page.locator('script')).toHaveCount(0);
  });
});

test.describe('404 page', () => {
  test('returns 404 with the brief copy and links home under the base path', async ({
    page,
    baseURL,
  }) => {
    const basePath = basePathOf(baseURL);

    const response = await page.goto('this-page-does-not-exist/');
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
    await expect(page.getByRole('heading', { level: 1, name: 'House Sums' })).toBeVisible();
  });
});
