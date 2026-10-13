import { expect, test } from '@playwright/test';
import { calculator, expectStatus, input, params } from './calculator-helpers';
import { expectNoHorizontalScroll } from './helpers';
import { areas, expectedFor } from './oracle';

/**
 * Area pages, /rent-vs-buy/{slug}/ (phase 5, areas teammate). The answer is in the static HTML
 * (JS disabled), the island hydrates over it and still works, and the local summary is built
 * from the data. Expected answers come from the engine run in the test process (oracle.ts), so
 * these also hold against the live site.
 */

const yearsText = (year: number) => `${year} ${year === 1 ? 'year' : 'years'}`;

/** The summary's sentence for an area at typical assumptions. */
function typicalSentence(slug: string): string {
  const { area, result, derived } = expectedFor(`a=${slug}`);
  if (!area) throw new Error(`no area ${slug}`);
  const year = result.breakEvenYear;
  return year === null
    ? `At typical assumptions, renting in ${area.name} comes out ahead for all ${derived.inputs.years} years.`
    : `At typical assumptions, buying in ${area.name} pulls ahead after ${yearsText(year)}.`;
}

test.describe('with JavaScript disabled', () => {
  test.use({ javaScriptEnabled: false });

  for (const slug of ['leeds', 'glasgow-city', 'cardiff', 'belfast']) {
    test(`${slug}: the answer and the summary are in the static HTML`, async ({ page }) => {
      const { area, result } = expectedFor(`a=${slug}`);
      await page.goto(`rent-vs-buy/${slug}/`);
      await expect(calculator(page)).toHaveAttribute('data-status', 'ready');
      const numeral = page.getByTestId('answer-numeral');
      const headline = page.getByTestId('answer-headline');
      if (result.breakEvenYear !== null) {
        await expect(numeral).toHaveText(String(result.breakEvenYear));
        await expect(headline).toContainText('Buying pulls ahead after');
      } else {
        await expect(headline).toContainText('Renting comes out ahead');
      }
      await expect(headline).toContainText(area!.name);
      await expect(page.getByTestId('area-summary-answer')).toHaveText(typicalSentence(slug));
      await expect(page.getByTestId('area-figures')).toBeVisible();
      await expectNoHorizontalScroll(page);
    });
  }
});

test('the island hydrates over the static answer and the calculator still works', async ({
  page,
}) => {
  const { result } = expectedFor('a=leeds');
  await page.goto('rent-vs-buy/leeds/');
  await expect(calculator(page)).toHaveAttribute('data-hydrated', 'true');
  await expectStatus(page, 'ready');
  await expect(page.getByTestId('answer-numeral')).toHaveText(String(result.breakEvenYear));
  // The area's own page keeps a clean URL: no a= while the area is the page's.
  expect(params(page).get('a')).toBeNull();

  // Change house price growth to 0%: the answer follows the model, and the URL records it.
  const changed = expectedFor('a=leeds&g=0');
  const growth = input(page, 'houseGrowth');
  await growth.fill('0');
  await growth.blur();
  await expect.poll(() => params(page).get('g')).toBe('0');
  if (changed.result.breakEvenYear === null) {
    await expect(page.getByTestId('answer-headline')).toContainText('Renting comes out ahead');
  } else {
    await expect(page.getByTestId('answer-numeral')).toHaveText(
      String(changed.result.breakEvenYear),
    );
  }
  // The page's own summary stays at typical assumptions.
  await expect(page.getByTestId('area-summary-answer')).toHaveText(typicalSentence('leeds'));
});

test('the summary gives the figures with months, beside the nation', async ({ page }) => {
  await page.goto('rent-vs-buy/leeds/');
  const figures = page.getByTestId('area-figures');
  const leeds = areas.areas.find((a) => a.slug === 'leeds')!;
  const price = `£${leeds.price.toLocaleString('en-GB')}`;
  await expect(figures.locator('[data-figure="price"]')).toContainText(price);
  await expect(figures.locator('[data-figure="price"]')).toContainText(/[A-Z][a-z]{2} \d{4}/);
  await expect(figures.locator('thead')).toContainText('England');
  const summary = page.getByTestId('area-summary');
  await expect(summary).toContainText("Across England's");
  await expect(summary).toContainText('That is a first-time buyer with a 10% deposit');
});

test('falling prices are said plainly, with the 0% floor', async ({ page }) => {
  await page.goto('rent-vs-buy/aberdeen-city/');
  const summary = page.getByTestId('area-summary');
  await expect(summary).toContainText('Average prices in Aberdeen City fell by');
  await expect(summary).toContainText('floors house price growth at 0%');
  await expect(summary).toContainText('Broad Rental Market Areas');
});

test("fallback figures are labelled as the nation's figure", async ({ page }) => {
  await page.goto('rent-vs-buy/isles-of-scilly/');
  const figures = page.getByTestId('area-figures');
  await expect(figures.locator('[data-figure="price"]')).toContainText('(England figure)');
  await expect(page.getByTestId('area-summary')).toContainText("England's figure");
});

test('a friendly slug keeps the ONS name in the summary', async ({ page }) => {
  await page.goto('rent-vs-buy/kingston-upon-hull/');
  await expect(page.getByTestId('area-summary')).toContainText(
    'ONS lists Kingston upon Hull as "Kingston upon Hull, City of".',
  );
});

test('related areas link to six places in the same nation, the nation, How it works and Sources', async ({
  page,
}) => {
  await page.goto('rent-vs-buy/leeds/');
  const related = page.getByTestId('related-areas');
  const areaLinks = related.locator('tbody a');
  await expect(areaLinks).toHaveCount(6);
  await expect(related.locator('[aria-current="page"]')).toHaveText('Leeds');
  await expect(related.getByRole('link', { name: 'Every area in England' })).toHaveAttribute(
    'href',
    /\/rent-vs-buy\/england\/$/,
  );
  await expect(related.getByRole('link', { name: 'How it works' })).toBeVisible();
  await expect(related.getByRole('link', { name: 'Sources' })).toBeVisible();

  const english = new Set(areas.areas.filter((a) => a.nation === 'eng').map((a) => a.slug));
  for (const href of await areaLinks.evaluateAll((links) =>
    links.map((link) => link.getAttribute('href') ?? ''),
  )) {
    const slug = /\/rent-vs-buy\/([^/]+)\/$/.exec(href)?.[1] ?? '';
    expect(english.has(slug)).toBe(true);
  }

  const first = areaLinks.first();
  const name = (await first.textContent())?.trim() ?? '';
  await first.click();
  await expect(page.locator('h1')).toHaveText(
    `Rent v buy in ${name}: how long until buying beats renting?`,
  );
});
