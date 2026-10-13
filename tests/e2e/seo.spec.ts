import { expect, test, type Page } from '@playwright/test';
import { basePathOf } from './helpers';

/**
 * SEO files and tags as served (astro preview locally, GitHub Pages live): sitemap.xml and
 * robots.txt, the Open Graph images, and the canonical, Open Graph, Twitter and JSON-LD tags on
 * a calculator page, a nation page and a content page.
 *
 * Canonical and sitemap URLs carry the production origin (SITE_URL), which differs from a local
 * preview's, so they are compared by path under the base path. The full checks over every page
 * run on dist/ in npm run check:pages; these confirm the server delivers them.
 */

// Request-only checks do not depend on the viewport, so they run once.
const notThisProject = (projectName: string) => projectName !== 'desktop-1280';

/** "https://jordanl17.github.io/HouseSums/rent-vs-buy/leeds/" -> "rent-vs-buy/leeds/". */
function routeOf(href: string, basePath: string): string {
  const { pathname } = new URL(href);
  expect(pathname.startsWith(basePath), href).toBe(true);
  return pathname.slice(basePath.length);
}

async function metaContent(page: Page, key: string): Promise<string | null> {
  return page
    .locator(`head meta[property="${key}"], head meta[name="${key}"]`)
    .first()
    .getAttribute('content');
}

test.describe('sitemap.xml and robots.txt', () => {
  test('sitemap.xml lists the indexable pages and leaves out the style guide', async ({
    request,
    baseURL,
  }, testInfo) => {
    test.skip(notThisProject(testInfo.project.name), 'request-only, runs in one project');
    const basePath = basePathOf(baseURL);
    const response = await request.get('sitemap.xml');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toMatch(/xml/);
    const xml = await response.text();
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');

    const routes = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) =>
      routeOf(m[1] ?? '', basePath),
    );
    expect(routes.length).toBeGreaterThan(360);
    for (const route of [
      '',
      'how-it-works/',
      'sources/',
      'about/',
      'rent-vs-buy/',
      'rent-vs-buy/scotland/',
      'rent-vs-buy/leeds/',
      'rent-vs-buy/kingston-upon-hull/',
    ]) {
      expect(routes).toContain(route);
    }
    expect(routes.filter((r) => r.includes('styleguide') || r.includes('404'))).toEqual([]);
    expect(routes.filter((r) => r.includes('bristol-city-of'))).toEqual([]);

    // A spread of listed pages is served (all of them are checked on dist/ by check:links).
    const sample = routes.filter((_, index) => index % 60 === 0);
    for (const route of sample) {
      const page = await request.get(route === '' ? './' : route);
      expect(page.status(), route).toBe(200);
    }
  });

  test('robots.txt allows crawling and points at the sitemap', async ({
    request,
    baseURL,
  }, testInfo) => {
    test.skip(notThisProject(testInfo.project.name), 'request-only, runs in one project');
    const response = await request.get('robots.txt');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toMatch(/text\/plain/);
    const text = await response.text();
    expect(text).toMatch(/^User-agent: \*$/m);
    const sitemap = /^Sitemap: (\S+)$/m.exec(text)?.[1] ?? '';
    expect(routeOf(sitemap, basePathOf(baseURL))).toBe('sitemap.xml');
  });

  test('serves one Open Graph image per nation plus the site card', async ({
    request,
  }, testInfo) => {
    test.skip(notThisProject(testInfo.project.name), 'request-only, runs in one project');
    for (const name of ['default', 'england', 'scotland', 'wales', 'northern-ireland']) {
      const response = await request.get(`og/${name}.png`);
      expect(response.status(), name).toBe(200);
      expect(response.headers()['content-type'], name).toBe('image/png');
    }
  });
});

const TAGGED = [
  {
    path: 'rent-vs-buy/leeds/',
    image: 'og/england.png',
    ld: ['WebApplication', 'BreadcrumbList'],
  },
  { path: 'rent-vs-buy/scotland/', image: 'og/scotland.png', ld: ['BreadcrumbList'] },
  { path: 'how-it-works/', image: 'og/default.png', ld: [] as string[] },
];

for (const { path, image, ld } of TAGGED) {
  test(`${path} has canonical, Open Graph, Twitter and JSON-LD tags`, async ({
    page,
    request,
    baseURL,
  }) => {
    const basePath = basePathOf(baseURL);
    await page.goto(path);

    const canonical = await page.locator('head link[rel="canonical"]').getAttribute('href');
    expect(routeOf(canonical ?? '', basePath)).toBe(path);
    expect(await metaContent(page, 'og:url')).toBe(canonical);

    const title = await page.title();
    const description = await metaContent(page, 'description');
    expect(description).toBeTruthy();
    expect(await metaContent(page, 'og:title')).toBe(title);
    expect(await metaContent(page, 'og:description')).toBe(description);
    expect(await metaContent(page, 'twitter:card')).toBe('summary_large_image');
    expect(await metaContent(page, 'og:locale')).toBe('en_GB');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en-GB');

    const ogImage = (await metaContent(page, 'og:image')) ?? '';
    expect(routeOf(ogImage, basePath)).toBe(image);
    expect(await metaContent(page, 'twitter:image')).toBe(ogImage);
    const imageResponse = await request.get(image);
    expect(imageResponse.status()).toBe(200);

    const blocks = await page
      .locator('script[type="application/ld+json"]')
      .evaluateAll((scripts) => scripts.map((s) => JSON.parse(s.textContent ?? 'null')));
    expect(blocks.map((b: { '@type': string }) => b['@type'])).toEqual(ld);
    for (const block of blocks as Record<string, unknown>[]) {
      expect(block['@context']).toBe('https://schema.org');
      if (block['@type'] === 'WebApplication') {
        expect(block).toMatchObject({
          applicationCategory: 'FinanceApplication',
          operatingSystem: 'Any',
          offers: { '@type': 'Offer', price: '0', priceCurrency: 'GBP' },
          url: canonical,
        });
      }
      if (block['@type'] === 'BreadcrumbList') {
        const items = block['itemListElement'] as { position: number; item: string }[];
        expect(items.map((i) => i.position)).toEqual(items.map((_, index) => index + 1));
        expect(items.at(-1)?.item).toBe(canonical);
      }
    }
  });
}

test('the 404 page is noindex with no canonical link', async ({ page }) => {
  await page.goto('this-page-does-not-exist/');
  await expect(page.locator('head meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  await expect(page.locator('head link[rel="canonical"]')).toHaveCount(0);
});
