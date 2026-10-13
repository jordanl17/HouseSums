import { expect, test } from '@playwright/test';
import { expectNoHorizontalScroll } from './helpers';
import { areas, expectedFor } from './oracle';

/**
 * Nation pages, /rent-vs-buy/{nation}/, the /rent-vs-buy/ index and the home page's line of
 * nation links (phase 5, areas teammate).
 */

const NATIONS = [
  { code: 'eng', slug: 'england', name: 'England', tax: 'Stamp duty (SDLT)' },
  {
    code: 'sco',
    slug: 'scotland',
    name: 'Scotland',
    tax: 'Land and Buildings Transaction Tax (LBTT)',
  },
  { code: 'wal', slug: 'wales', name: 'Wales', tax: 'Land Transaction Tax (LTT)' },
  { code: 'ni', slug: 'northern-ireland', name: 'Northern Ireland', tax: 'Stamp duty (SDLT)' },
] as const;

for (const nation of NATIONS) {
  test(`${nation.name} lists every area A to Z, with price, rent and break-even`, async ({
    page,
  }) => {
    await page.goto(`rent-vs-buy/${nation.slug}/`);
    await expect(page.locator('h1')).toHaveText(`Rent v buy in ${nation.name}`);
    const expected = areas.areas
      .filter((a) => a.nation === nation.code)
      .sort((a, b) => a.name.localeCompare(b.name, 'en-GB') || a.code.localeCompare(b.code));
    const table = page.getByTestId('nation-areas');
    const rows = table.locator('tbody tr');
    await expect(rows).toHaveCount(expected.length);
    await expect(table.locator('tbody th')).toHaveText(expected.map((a) => a.name));
    const hrefs = await table
      .locator('tbody a')
      .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''));
    expect(hrefs.map((href) => /\/rent-vs-buy\/([^/]+)\/$/.exec(href)?.[1])).toEqual(
      expected.map((a) => a.slug),
    );

    // Spot-check the first row against the engine.
    const first = expected[0]!;
    const { result } = expectedFor(`a=${first.slug}`);
    const cells = rows.first().locator('td');
    await expect(cells.nth(0)).toContainText(`£${first.price.toLocaleString('en-GB')}`);
    await expect(cells.nth(1)).toContainText(`£${first.rent.toLocaleString('en-GB')}`);
    await expect(cells.nth(2)).toHaveText(
      result.breakEvenYear === null
        ? /^None in \d+ years$/
        : new RegExp(
            `^${result.breakEvenYear}\\s${result.breakEvenYear === 1 ? 'year' : 'years'}$`,
          ),
    );

    await expect(page.getByTestId('nation-figures')).toContainText('Average price');
    await expect(page.locator('main')).toContainText(nation.tax);
    await expectNoHorizontalScroll(page);
  });
}

test('Scotland explains LBTT and the Home Report; Northern Ireland shares SDLT with England', async ({
  page,
}) => {
  await page.goto('rent-vs-buy/scotland/');
  await expect(page.locator('main')).toContainText('Home Report');
  await expect(page.locator('main')).toContainText('Additional Dwelling Supplement');
  await page.goto('rent-vs-buy/northern-ireland/');
  await expect(page.locator('main')).toContainText('the same tax as in England');
  await expect(page.locator('main')).toContainText('published each quarter');
  await page.goto('rent-vs-buy/wales/');
  await expect(page.locator('main')).toContainText('There is no first-time buyer relief.');
});

test('a nation page links to an area page that opens the calculator for it', async ({ page }) => {
  await page.goto('rent-vs-buy/wales/');
  await page
    .getByTestId('nation-areas')
    .getByRole('link', { name: 'Cardiff', exact: true })
    .click();
  await expect(page.locator('h1')).toHaveText(
    'Rent v buy in Cardiff: how long until buying beats renting?',
  );
  await expect(page.locator('#calc-area')).toHaveValue('Cardiff');
});

test('/rent-vs-buy/ lists the four nations', async ({ page }) => {
  await page.goto('rent-vs-buy/');
  const table = page.getByTestId('nations');
  await expect(table.locator('tbody th')).toHaveText(NATIONS.map((n) => n.name));
  for (const nation of NATIONS) {
    await expect(table.getByRole('link', { name: nation.name })).toHaveAttribute(
      'href',
      new RegExp(`/rent-vs-buy/${nation.slug}/$`),
    );
  }
  const counts = await table.locator('tbody td:first-of-type').allTextContents();
  expect(counts.map(Number).reduce((a, b) => a + b, 0)).toBe(areas.areas.length);
});

test('the home page has one plain line of links to the four nation pages', async ({ page }) => {
  await page.goto('./');
  const line = page.getByTestId('nation-links');
  await expect(line).toHaveText('Rent v buy by nation: England, Scotland, Wales, Northern Ireland');
  await expect(line.getByRole('link')).toHaveCount(4);
  await line.getByRole('link', { name: 'Scotland' }).click();
  await expect(page.locator('h1')).toHaveText('Rent v buy in Scotland');
});
