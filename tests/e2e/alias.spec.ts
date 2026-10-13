import { expect, test } from '@playwright/test';
import { calculator, expectStatus, params } from './calculator-helpers';

/**
 * Old slugs from the ONS "X, City of" names (bristol-city-of and friends) keep working in shared
 * links: ?a=old-slug opens the area under its new slug, and the island rewrites the link
 * (data/area-names.json aliases; phase 5). No page was ever published at an old slug path.
 */

const ALIASES = [
  { old: 'bristol-city-of', slug: 'bristol', name: 'Bristol' },
  { old: 'kingston-upon-hull-city-of', slug: 'kingston-upon-hull', name: 'Kingston upon Hull' },
  { old: 'herefordshire-county-of', slug: 'herefordshire', name: 'Herefordshire' },
] as const;

for (const alias of ALIASES) {
  test(`?a=${alias.old} opens ${alias.name} and rewrites the link`, async ({ page }) => {
    await page.goto(`./?a=${alias.old}&p=300000`);
    await expect(calculator(page)).toHaveAttribute('data-hydrated', 'true');
    await expectStatus(page, 'ready');
    await expect(page.locator('#calc-area')).toHaveValue(alias.name);
    await expect(page.getByTestId('answer-headline')).toContainText(alias.name);
    await expect.poll(() => params(page).get('a')).toBe(alias.slug);
    expect(params(page).get('p')).toBe('300000');
  });
}

test('the area page lives at the new slug', async ({ page }) => {
  const response = await page.goto('rent-vs-buy/bristol/');
  expect(response?.status()).toBe(200);
  await expect(page.locator('h1')).toHaveText(
    'Rent v buy in Bristol: how long until buying beats renting?',
  );
});
