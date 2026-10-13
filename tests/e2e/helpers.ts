import { expect, type Page } from '@playwright/test';

/**
 * Shared e2e helpers. Paths are relative to baseURL (which ends in the base path and a
 * slash), so the same tests run against `astro preview` and the live site.
 */

/**
 * Every page in the site, with its h1. The unlisted styleguide is included so it gets the
 * shared 200, no-scroll, no-JS and link checks; its layout checks are in styleguide.spec.ts.
 * `island: true` marks a page that hydrates the calculator: it is checked for loading scripts
 * only from our own origin instead of loading none.
 */
export const PAGES: readonly { path: string; title: string; h1: string; island?: boolean }[] = [
  {
    path: './',
    title: 'House Sums',
    h1: 'Rent v buy: how long until buying beats renting?',
    island: true,
  },
  { path: 'how-it-works/', title: 'How it works | House Sums', h1: 'How it works' },
  { path: 'sources/', title: 'Sources | House Sums', h1: 'Sources' },
  { path: 'about/', title: 'About | House Sums', h1: 'About House Sums' },
  { path: 'styleguide/', title: 'Style guide | House Sums', h1: 'Style guide' },
];

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

/**
 * Load a page with the calculator island and assert that every script and fetch it makes is to
 * our own origin (no third-party calls at runtime), and that it has exactly one island.
 */
export async function expectOnlyOwnScripts(page: Page, path: string): Promise<void> {
  const requests: { type: string; url: string }[] = [];
  page.on('request', (request) => {
    const type = request.resourceType();
    if (type === 'script' || type === 'fetch' || type === 'xhr') {
      requests.push({ type, url: request.url() });
    }
  });
  await page.goto(path, { waitUntil: 'networkidle' });
  const origin = new URL(page.url()).origin;
  expect(requests.filter((r) => new URL(r.url).origin !== origin)).toEqual([]);
  expect(requests.filter((r) => r.type === 'script').length).toBeGreaterThan(0);
  await expect(page.locator('astro-island')).toHaveCount(1);
}
