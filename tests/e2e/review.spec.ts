import { expect, test, type Page } from '@playwright/test';
import { expectStatus, gotoCalculator, input, pickArea } from './calculator-helpers';

/**
 * Phase 4 review fixes (integration): the answer's live region, the chart's direct labels near
 * the axis, the data months for areas with their own month, the "(now)" sensitivity row
 * matching the field, and no placeholder figures in the home page's HTML.
 */

type Box = { x: number; y: number; width: number; height: number };
const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width - 0.5 &&
  b.x < a.x + a.width - 0.5 &&
  a.y < b.y + b.height - 0.5 &&
  b.y < a.y + a.height - 0.5;

async function open(page: Page, query: string) {
  await gotoCalculator(page, query);
  await expectStatus(page, 'ready');
}

test('the answer is announced once, in a polite region that is always there', async ({ page }) => {
  await gotoCalculator(page);
  const live = page.getByTestId('answer-live');
  await expect(live).toHaveAttribute('role', 'status');
  await expect(live).toHaveAttribute('aria-atomic', 'true');
  await expect(live).toHaveText('');

  await pickArea(page, 'Leeds');
  const headline = page.getByTestId('answer-headline');
  await expect(live).toHaveText(((await headline.textContent()) ?? '').trim());

  // A burst of slider steps: the region follows the settled headline.
  const rate = page.locator('#calc-mortgageRate-slider');
  await rate.focus();
  for (let i = 0; i < 30; i += 1) await rate.press('ArrowRight');
  await expect(live).toHaveText(((await headline.textContent()) ?? '').trim());
  await expect(live).toContainText('Leeds');
  // The chart, note and key numbers are not read out with it.
  await expect(live).not.toContainText('£');
});

for (const slug of ['glasgow-city', 'belfast', 'leeds']) {
  test(`a direct label never sits on the x axis or past the plot (${slug})`, async ({ page }) => {
    // Glasgow City and Belfast: buying pulls ahead early and rent wealth stays small next to the
    // axis top.
    await open(page, `a=${slug}`);
    const chart = page.getByTestId('chart');
    const axis = await chart.locator('.chart__x-axis').boundingBox();
    const plot = await chart.locator('.chart__plot').boundingBox();
    if (!axis || !plot) throw new Error('chart missing');
    for (const label of await chart.locator('.chart__series-label').all()) {
      const box = await label.boundingBox();
      if (!box) throw new Error('label missing');
      // Inside the plot, above the axis row and its year labels.
      expect(box.y + box.height).toBeLessThanOrEqual(plot.y + plot.height + 0.5);
      expect(box.y + box.height).toBeLessThanOrEqual(axis.y + 0.5);
      expect(box.x).toBeGreaterThanOrEqual(plot.x - 0.5);
      expect(box.x + box.width).toBeLessThanOrEqual(plot.x + plot.width + 0.5);
    }
  });
}

// Polish: at 360 Cardiff's "Rent" label sat on the buy line where the lines cross. No direct
// label may sit on either line (each line sampled along its segments, in page pixels).
for (const slug of ['cardiff', 'leeds', 'belfast', 'westminster', 'glasgow-city']) {
  test(`direct labels keep off both lines (${slug})`, async ({ page }) => {
    await page.goto(`rent-vs-buy/${slug}/`);
    const chart = page.getByTestId('chart');
    await expect(page.getByTestId('calculator')).toHaveAttribute('data-hydrated', 'true');
    await page.evaluate(() => document.fonts.ready);
    const plot = await chart.locator('.chart__plot').boundingBox();
    if (!plot) throw new Error('chart missing');
    const lines: { x: number; y: number }[][] = [];
    for (const name of ['buy', 'rent']) {
      const points = (await chart.locator(`.chart__line--${name}`).getAttribute('points')) ?? '';
      lines.push(
        points.split(' ').map((pair) => {
          const [x = 0, y = 0] = pair.split(',').map(Number);
          return { x: plot.x + (x / 100) * plot.width, y: plot.y + (y / 100) * plot.height };
        }),
      );
    }
    for (const label of await chart.locator('.chart__series-label').all()) {
      const box = await label.boundingBox();
      const text = (await label.textContent())?.trim();
      if (!box) throw new Error('label missing');
      for (const line of lines) {
        for (let i = 1; i < line.length; i += 1) {
          const a = line[i - 1]!;
          const b = line[i]!;
          for (let step = 0; step <= 20; step += 1) {
            const x = a.x + ((b.x - a.x) * step) / 20;
            const y = a.y + ((b.y - a.y) * step) / 20;
            const inside =
              x > box.x - 1 &&
              x < box.x + box.width + 1 &&
              y > box.y - 1 &&
              y < box.y + box.height + 1;
            expect(inside, `${text} label sits on a line`).toBe(false);
          }
        }
      }
    }
  });
}

// Review round 2: on a 1 or 2-year horizon the labels used to sit at the last year, at the
// right edge, and hang off the card (horizontal scroll at 360) or onto the "Year 1" marker.
for (const query of [
  'a=glasgow-city&y=1',
  'a=leeds&y=1&g=6',
  'a=leeds&y=1&g=0',
  'a=belfast&y=1',
  'a=westminster&y=1',
  'a=leeds&y=2&g=0',
  'a=leeds&y=2&g=6',
  'a=glasgow-city&y=2',
  'a=city-of-edinburgh&y=2',
  'a=leeds&y=3',
  'a=leeds&y=6',
]) {
  test(`direct labels stay inside the plot and off the marker (${query})`, async ({ page }) => {
    await open(page, query);
    const chart = page.getByTestId('chart');
    const plot = await chart.locator('.chart__plot').boundingBox();
    if (!plot) throw new Error('chart missing');
    const marker = page.getByTestId('chart-marker');
    const markerBox = (await marker.count()) > 0 ? await marker.boundingBox() : null;
    // The "Year N" label stays over the plot, clear of the y-axis labels beside it (phase 6:
    // a year 1 or 2 marker at 360 used to cover the top "£800k").
    if (markerBox) {
      expect(markerBox.x).toBeGreaterThanOrEqual(plot.x - 1.5);
      expect(markerBox.x + markerBox.width).toBeLessThanOrEqual(plot.x + plot.width + 1.5);
    }
    const labels = await chart.locator('.chart__series-label').all();
    expect(labels).toHaveLength(2);
    const boxes = [];
    for (const label of labels) {
      await expect(label).toBeVisible();
      const box = await label.boundingBox();
      if (!box) throw new Error('label missing');
      boxes.push(box);
      expect(box.x).toBeGreaterThanOrEqual(plot.x - 0.5);
      expect(box.x + box.width).toBeLessThanOrEqual(plot.x + plot.width + 0.5);
      expect(box.y).toBeGreaterThanOrEqual(plot.y - 0.5);
      expect(box.y + box.height).toBeLessThanOrEqual(plot.y + plot.height + 0.5);
      if (markerBox) expect(overlaps(box, markerBox)).toBe(false);
    }
    expect(overlaps(boxes[0]!, boxes[1]!)).toBe(false);
    const scroll = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(scroll.scroll).toBeLessThanOrEqual(scroll.client);
  });
}

test("'How this works' gives the area's own data months", async ({ page }) => {
  await open(page, 'a=belfast');
  const tip = async (key: string) => {
    const tag = page.getByTestId(`tag-${key}`);
    await tag.click();
    const text = (await page.locator(`#calc-${key}-source`).textContent()) ?? '';
    await tag.click();
    return text.match(/[A-Z][a-z]{2} \d{4}$/)?.[0] ?? '';
  };
  const priceMonth = await tip('price');
  const rentMonth = await tip('rent');
  expect(priceMonth).not.toBe('');
  const small = page.getByTestId('how-this-works');
  await expect(small).toContainText(`UK House Price Index (${priceMonth})`);
  await expect(small).toContainText(`Private Rents (${rentMonth})`);
});

// Polish: one precision per field, so the row reads exactly as the field (Belfast "5.10", not
// "5.1"; Westminster "0.00").
for (const slug of ['leeds', 'belfast', 'westminster']) {
  test(`the '(now)' growth row shows the same figure as the field (${slug})`, async ({ page }) => {
    await open(page, `a=${slug}`);
    const field = await input(page, 'houseGrowth').inputValue();
    expect(field).toMatch(/^\d+\.\d{2}$/);
    const current = page.getByTestId('sensitivity-growth').locator('tr[aria-current="true"]');
    await expect(current).toContainText(`${field}% a year`);
  });
}

test('the home page HTML holds no made-up answer or figures in the card', async ({ request }) => {
  const html = await (await request.get('./')).text();
  const start = html.indexOf('data-testid="answer-card"');
  expect(start).toBeGreaterThan(0);
  const end = html.indexOf('class="share-link', start);
  expect(end).toBeGreaterThan(start);
  const card = html.slice(start, end);
  expect(card).not.toMatch(/£\s?\d/);
  expect(card).not.toMatch(/pulls ahead after \d/);
  expect(card).not.toMatch(/Leeds/);
});
