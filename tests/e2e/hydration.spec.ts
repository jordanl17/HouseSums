import { expect, test, type Page, type Route } from '@playwright/test';
import { chartSummary } from '../../src/lib/copy-details';
import { calculator, expectStatus, input, params } from './calculator-helpers';
import { expectedFor } from './oracle';

/**
 * Progressive hydration (phase 6, perf). The island's shared data comes from
 * data/calculator.json and its secondary parts (chart, share row, advanced panel, the sections
 * under the card) from a deferred chunk. Neither may change what the page shows while it loads,
 * and both must leave a fully working calculator once they arrive, however late.
 */

const DATA = '**/data/calculator.json*';
const LATER = '**/_astro/later.*.js';

/** Holds matching requests until release() is called. */
async function hold(page: Page, pattern: string) {
  const waiting: Route[] = [];
  let released = false;
  await page.route(pattern, (route) => {
    if (released) return route.continue();
    waiting.push(route);
    return undefined;
  });
  return {
    async release() {
      released = true;
      for (const route of waiting.splice(0)) await route.continue();
    },
    count: () => waiting.length,
  };
}

const errors = (page: Page) => {
  const seen: string[] = [];
  page.on('pageerror', (error) => seen.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') seen.push(message.text());
  });
  return seen;
};

test('the area page keeps its static answer while the data loads, then hydrates in place', async ({
  page,
}) => {
  const seen = errors(page);
  const { result } = expectedFor('a=leeds');
  const data = await hold(page, DATA);
  await page.goto('rent-vs-buy/leeds/');
  await expect.poll(() => data.count()).toBeGreaterThan(0);

  const numeral = page.getByTestId('answer-numeral');
  await expect(numeral).toHaveText(String(result.breakEvenYear));
  await expect(calculator(page)).toHaveAttribute('data-hydrated', 'false');
  const before = await page.getByTestId('answer-card').boundingBox();

  await data.release();
  await expect(calculator(page)).toHaveAttribute('data-hydrated', 'true');
  await expectStatus(page, 'ready');
  await expect(numeral).toHaveText(String(result.breakEvenYear));
  expect(await page.getByTestId('answer-card').boundingBox()).toEqual(before);
  // Live: the chart's hidden table arrives once the chart hydrates.
  await expect(page.getByTestId('chart-table').locator('tbody tr')).toHaveCount(
    result.series.length,
  );
  expect(seen).toEqual([]);
});

test('a change made before the deferred chunk arrives shows in the chart once it does', async ({
  page,
}) => {
  const seen = errors(page);
  const later = await hold(page, LATER);
  const dataLoaded = page.waitForResponse(/data\/calculator\.json/);
  await page.goto('rent-vs-buy/leeds/');
  await dataLoaded;
  await expect.poll(() => later.count()).toBeGreaterThan(0);
  const summary = page.locator('#calc-chart-summary');
  const typical = expectedFor('a=leeds').result;
  await expect(summary).toHaveText(chartSummary(typical));

  // The answer card is live already: change growth to 0%.
  const changed = expectedFor('a=leeds&g=0').result;
  const growth = input(page, 'houseGrowth');
  await expect(async () => {
    await growth.fill('0');
    await growth.blur();
    expect(params(page).get('g')).toBe('0');
  }).toPass();
  // The chart is still the server's until its code arrives.
  await expect(calculator(page)).toHaveAttribute('data-hydrated', 'false');
  await expect(summary).toHaveText(chartSummary(typical));

  await later.release();
  await expect(calculator(page)).toHaveAttribute('data-hydrated', 'true');
  await expect(summary).toHaveText(chartSummary(changed));
  await expect(page.locator('#calc-chart-summary')).toHaveCount(1);
  await expect(page.getByTestId('chart')).toHaveCount(1);
  expect(seen).toEqual([]);
});

test('if the data never arrives, the static answer stays and nothing breaks', async ({ page }) => {
  const seen = errors(page);
  const { result } = expectedFor('a=leeds');
  let requests = 0;
  await page.route(DATA, (route) => {
    requests += 1;
    return route.abort();
  });
  await page.goto('rent-vs-buy/leeds/');
  // Three tries (the first and two retries, 1 s and 4 s apart), then it gives up quietly.
  await expect.poll(() => requests, { timeout: 15_000 }).toBe(3);
  await expect(page.getByTestId('answer-numeral')).toHaveText(String(result.breakEvenYear));
  await expect(page.getByTestId('area-summary-answer')).toBeVisible();
  await expect(calculator(page)).toHaveAttribute('data-hydrated', 'false');
  expect(
    seen.filter((message) => !/net::ERR_FAILED|Failed to load resource/.test(message)),
  ).toEqual([]);
});

// Polish: on a slow connection the server-rendered fields can be typed in before the island
// hydrates. What was typed counts once it does, instead of snapping back.
test('a value typed before hydration is kept and used once the island hydrates', async ({
  page,
}) => {
  const seen = errors(page);
  const data = await hold(page, DATA);
  await page.goto('rent-vs-buy/leeds/');
  await expect.poll(() => data.count()).toBeGreaterThan(0);
  await expect(calculator(page)).toHaveAttribute('data-hydrated', 'false');

  // Price typed and left; rent typed and still being typed in when the data arrives.
  const price = input(page, 'price');
  await price.fill('300000');
  const rent = input(page, 'rent');
  await rent.fill('1500');
  await expect(rent).toBeFocused();

  await data.release();
  await expect(calculator(page)).toHaveAttribute('data-hydrated', 'true');
  const { result } = expectedFor('a=leeds&p=300000&r=1500');
  await expect(page.getByTestId('answer-numeral')).toHaveText(String(result.breakEvenYear));
  await expect.poll(() => params(page).get('p')).toBe('300000');
  expect(params(page).get('r')).toBe('1500');
  // The field left before hydration shows its tidied value; the one still in use, as typed.
  await expect(price).toHaveValue('300,000');
  await expect(rent).toHaveValue('1500');
  await expect(page.getByTestId('reset-price')).toBeVisible();
  await rent.blur();
  await expect(rent).toHaveValue('1,500');
  expect(seen).toEqual([]);
});
