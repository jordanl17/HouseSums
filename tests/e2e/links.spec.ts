import { expect, test } from '@playwright/test';
import { NOT_FOUND_PATH, PAGES } from './helpers';

/**
 * Header and footer links resolve on every page (no 404s from the nav), the current
 * page is marked with aria-current, and clicking a nav link lands on that page.
 */

for (const { path } of [...PAGES, { path: NOT_FOUND_PATH }]) {
  test(`header and footer links on ${path} all resolve`, async ({ page, request }) => {
    await page.goto(path);
    const hrefs = await page
      .locator('header a[href], footer a[href]')
      .evaluateAll((links) => links.map((a) => (a as HTMLAnchorElement).href));
    expect(hrefs.length).toBeGreaterThanOrEqual(5);

    for (const href of new Set(hrefs)) {
      const response = await request.get(href);
      expect(response.status(), href).toBe(200);
    }
  });
}

test('the nav takes you to each page and marks it as current', async ({ page }) => {
  await page.goto('./');
  const nav = page.getByRole('navigation', { name: 'Main' });

  await nav.getByRole('link', { name: 'How it works' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'How it works' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'How it works' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(nav.getByRole('link', { name: 'Sources' })).not.toHaveAttribute('aria-current');

  await nav.getByRole('link', { name: 'Sources' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Sources' })).toBeVisible();

  await page.getByRole('contentinfo').getByRole('link', { name: 'About' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'About House Sums' })).toBeVisible();

  await page.getByRole('banner').getByRole('link', { name: 'House Sums' }).click();
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Rent v buy: how long until buying beats renting?',
    }),
  ).toBeVisible();
});
