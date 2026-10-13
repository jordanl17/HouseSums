import { expect, type Page } from '@playwright/test';

/**
 * Shared e2e helpers. Paths are relative to baseURL (which ends in the base path and a
 * slash), so the same tests run against `astro preview` and the live site.
 */

/** Every page in the site shell, with its h1. The styleguide has its own spec. */
export const PAGES = [
  { path: './', title: 'House Sums', h1: 'Rent v buy: how long until buying beats renting?' },
  { path: 'how-it-works/', title: 'How it works | House Sums', h1: 'How it works' },
  { path: 'sources/', title: 'Sources | House Sums', h1: 'Sources' },
  { path: 'about/', title: 'About | House Sums', h1: 'About House Sums' },
] as const;

export const NOT_FOUND_PATH = 'this-page-does-not-exist/';

export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: (document.scrollingElement ?? document.documentElement).scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
}

/** Load a page and assert it requested no scripts and contains no script tags. */
export async function expectNoJavaScript(page: Page, path: string): Promise<void> {
  const scriptRequests: string[] = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'script') {
      scriptRequests.push(request.url());
    }
  });
  await page.goto(path, { waitUntil: 'networkidle' });
  expect(scriptRequests).toEqual([]);
  await expect(page.locator('script')).toHaveCount(0);
}

/** The base path the site is served under, e.g. '/HouseSums/'. */
export function basePathOf(baseURL: string | undefined): string {
  if (!baseURL) {
    throw new Error('baseURL is not set in playwright.config.ts');
  }
  return new URL(baseURL).pathname;
}
