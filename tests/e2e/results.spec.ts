import { expect, test, type Page } from '@playwright/test';
import { answerBox, expectStatus, gotoCalculator, input } from './calculator-helpers';

/**
 * The results half of the calculator (phase 4, results teammate): every answer copy case, the
 * key numbers, the chart's inspector and table alternative, what moves the answer and the
 * breakdown. States are set by link, so these tests do not depend on the area picker.
 *
 * Scenarios are the brief's reference scenario (England, first-time buyer, £300k, £30k
 * deposit, £1,250 rent, 4.3% fixed for 5 years then 4.3%, 3.5% rent growth) with one thing
 * changed. Their outcomes come from the model (src/lib/model.test.ts pins the reference ones).
 */
const BASE = 'a=leeds&p=300000&d=30000&r=1250&mr=4.3&ra=4.3&rg=3.5';
const at = (extra: string) => `${BASE}&${extra}`;

async function open(page: Page, query: string) {
  await gotoCalculator(page, query);
  await expectStatus(page, 'ready');
}

test.describe('answer copy', () => {
  test('before an area is picked: the calm empty state and nothing else in the card', async ({
    page,
  }) => {
    await gotoCalculator(page);
    await expect(page.getByTestId('answer-empty')).toHaveText(
      "Pick a place. We'll bring the local numbers.",
    );
    await expect(page.getByTestId('chart')).toHaveCount(0);
    await expect(page.getByTestId('key-numbers')).toHaveCount(0);
    await expect(page.getByTestId('sensitivity')).toHaveCount(0);
    await expect(page.getByTestId('breakdown')).toHaveCount(0);
    await expect(page.getByTestId('how-this-works')).toBeVisible();
  });

  test('break-even: headline, numeral in the buy colour, one explaining sentence', async ({
    page,
  }) => {
    await open(page, at('g=3'));
    await expect(page.getByTestId('answer-headline')).toHaveText(
      'Buying pulls ahead after 2 years in Leeds',
    );
    const numeral = page.getByTestId('answer-numeral');
    await expect(numeral).toHaveText('2');
    const colours = await numeral.evaluate((element) => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--color-buy)';
      element.append(probe);
      const buy = getComputedStyle(probe).color;
      probe.remove();
      return { numeral: getComputedStyle(element).color, buy };
    });
    expect(colours.numeral).toBe(colours.buy);
    await expect(page.getByTestId('answer-note')).toHaveText(
      'If you sold in year 2 or later, buying would leave you with more than renting and investing the difference.',
    );
    await expect(page.getByTestId('answer-overtake')).toHaveCount(0);
    await expect(page.getByTestId('answer-flip')).toHaveCount(0);
  });

  test('break-even in year 1 is singular', async ({ page }) => {
    await open(page, at('g=5'));
    await expect(page.getByTestId('answer-headline')).toHaveText(
      'Buying pulls ahead after 1 year in Leeds',
    );
    await expect(page.getByTestId('answer-note')).toContainText(
      'Even if you sold after the first year',
    );
  });

  test('renting catches up again: the window and the year it happens', async ({ page }) => {
    await open(page, at('g=4&fx=2&ra=12'));
    await expect(page.getByTestId('answer-headline')).toHaveText(
      'Buying pulls ahead after 1 year in Leeds',
    );
    await expect(page.getByTestId('answer-note')).toContainText(
      'If you sold between year 1 and year 3',
    );
    await expect(page.getByTestId('answer-overtake')).toHaveText(
      'Renting catches up again in year 4.',
    );
  });

  test('no break-even: renting comes out ahead, with a hint the model confirms', async ({
    page,
  }) => {
    await open(page, at('g=0&r=600'));
    await expect(page.getByTestId('answer')).toHaveAttribute('data-kind', 'no-break-even');
    await expect(page.getByTestId('answer-headline')).toHaveText(
      'Renting comes out ahead for all 25 years in Leeds',
    );
    const flip = page.getByTestId('answer-flip');
    await expect(flip).toHaveText(
      /^At [\d.]+% house price growth a year, buying would pull ahead after \d+ years?\.$/,
    );
    const text = (await flip.textContent()) ?? '';
    const growth = /At ([\d.]+)%/.exec(text)?.[1];
    const year = /after (\d+) years?/.exec(text)?.[1];
    // Loading that growth gives exactly the break-even year the hint names.
    await open(page, at(`g=${growth}&r=600`));
    await expect(page.getByTestId('answer-numeral')).toHaveText(year ?? 'missing');
  });

  test('deposit equals price: says there is no mortgage, and charges no product fee', async ({
    page,
  }) => {
    await open(page, `a=leeds&p=300000&d=300000&r=1250&mr=4.3&ra=4.3&rg=3.5&g=3`);
    await expect(page.getByTestId('answer-note')).toContainText(
      "The deposit covers the whole price, so there's no mortgage.",
    );
    await expect(page.getByTestId('breakdown-upfront')).toContainText('None: there is no mortgage');
  });

  test('no advice language, em-dashes or exclamation marks in any result', async ({ page }) => {
    for (const query of [at('g=3'), at('g=0&r=600'), at('g=4&fx=2&ra=12')]) {
      await open(page, query);
      const text = await page.getByTestId('calculator').innerText();
      expect(text).not.toMatch(/—|!|you should|we recommend/i);
    }
  });
});

test.describe('key numbers', () => {
  test('reference scenario: cash, first month own v rent, signed 10-year difference', async ({
    page,
  }) => {
    await open(page, at('g=3'));
    await expect(page.getByTestId('key-cash')).toContainText('£34,099');
    await expect(page.getByTestId('key-first-month')).toContainText('£1,615 / £1,250');
    await expect(page.getByTestId('key-after')).toContainText('After 10 years');
    await expect(page.getByTestId('key-after')).toContainText('+£93,335');
  });

  test('a shorter horizon and renting ahead: "After N years" with a true minus', async ({
    page,
  }) => {
    await open(page, at('g=0&r=600&y=6'));
    await expect(page.getByTestId('key-after')).toContainText('After 6 years');
    await expect(page.getByTestId('key-after')).toContainText('−£');
    await expect(page.getByTestId('key-after')).toContainText('renting ahead');
  });
});

test.describe('chart', () => {
  test('marks the break-even year and labels both lines directly', async ({ page }) => {
    await open(page, at('g=3'));
    const chart = page.getByTestId('chart');
    await expect(chart.getByTestId('chart-marker')).toHaveText('Year 2');
    await expect(chart.locator('.chart__series-label--buy')).toHaveText('Buy');
    await expect(chart.locator('.chart__series-label--rent')).toHaveText('Rent');
    await expect(chart.locator('.chart__area--buy')).toHaveCount(1);
  });

  test('keyboard: focus shows a year, arrows move it, Escape hides it', async ({ page }) => {
    await open(page, at('g=3'));
    const plot = page.getByRole('slider', { name: 'Year shown on the chart' });
    await plot.focus();
    const tooltip = page.getByTestId('chart-tooltip');
    await expect(tooltip).toContainText('Year 2');
    await page.keyboard.press('ArrowRight');
    await expect(tooltip).toContainText('Year 3');
    await expect(plot).toHaveAttribute('aria-valuenow', '3');
    await expect(plot).toHaveAttribute(
      'aria-valuetext',
      /^Year 3: if you buy £[\d,]+, if you rent £[\d,]+$/,
    );
    await page.keyboard.press('End');
    await expect(tooltip).toContainText('Year 25');
    await page.keyboard.press('Home');
    await expect(tooltip).toContainText('Now');
    await page.keyboard.press('Escape');
    await expect(tooltip).toHaveCount(0);
  });

  test('hover shows the year under the pointer', async ({ page }) => {
    await open(page, at('g=3'));
    const plot = page.locator('.chart__plot');
    await plot.scrollIntoViewIfNeeded();
    const box = await plot.boundingBox();
    if (!box) throw new Error('no plot');
    await page.mouse.move(box.x + box.width * 0.4, box.y + box.height / 2);
    await expect(page.getByTestId('chart-tooltip')).toContainText('Year 10');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height + 200);
    await expect(page.getByTestId('chart-tooltip')).toHaveCount(0);
  });

  test('the table alternative has every year with the same figures as the tooltip', async ({
    page,
  }) => {
    await open(page, at('g=3'));
    const rows = page.getByTestId('chart-table').locator('tbody tr');
    await expect(rows).toHaveCount(26);
    await page.getByRole('slider', { name: 'Year shown on the chart' }).focus();
    await page.keyboard.press('ArrowRight');
    const tooltip = await page.getByTestId('chart-tooltip').innerText();
    const cells = await rows.nth(3).locator('td').allInnerTexts();
    for (const cell of cells) expect(tooltip).toContain(cell);
  });
});

test.describe('chart on touch', () => {
  test.use({ hasTouch: true });

  test('a tap shows that year', async ({ page }) => {
    await open(page, at('g=3'));
    const plot = page.locator('.chart__plot');
    await plot.scrollIntoViewIfNeeded();
    const box = await plot.boundingBox();
    if (!box) throw new Error('no plot');
    await page.touchscreen.tap(box.x + box.width * 0.8, box.y + box.height / 2);
    await expect(page.getByTestId('chart-tooltip')).toContainText('Year 20');
  });
});

test.describe('what moves the answer', () => {
  test('break-even at 0-5% growth and at the rate 1 point either side, current row marked', async ({
    page,
  }) => {
    await open(page, at('g=3'));
    const growth = page.getByTestId('sensitivity-growth');
    const answers = await growth.locator('tbody td').allInnerTexts();
    expect(answers).toEqual(['11 years', '5 years', '3 years', '2 years', '1 year', '1 year']);
    const current = growth.locator('tbody tr[aria-current="true"]');
    await expect(current).toHaveCount(1);
    await expect(current.locator('th')).toHaveText('3.00% a year');
    // Marked by weight and a text marker, not colour alone.
    const marker = await current
      .locator('th')
      .evaluate((cell) => getComputedStyle(cell, '::after').content);
    expect(marker).toContain('now');
    expect(
      Number(await current.locator('td').evaluate((cell) => getComputedStyle(cell).fontWeight)),
    ).toBeGreaterThanOrEqual(700);

    const rate = page.getByTestId('sensitivity-rate');
    await expect(rate.locator('tbody th')).toHaveText([
      '3.30% (1 point lower)',
      '4.30%',
      '5.30% (1 point higher)',
    ]);
    await expect(rate.locator('tbody tr[aria-current="true"] th')).toHaveText('4.30%');
  });
});

test.describe('breakdown', () => {
  test('England: stamp duty by name with first-time buyer relief, year table collapsed', async ({
    page,
  }) => {
    await open(page, at('g=3'));
    await expect(page.getByTestId('breakdown-tax')).toContainText('Stamp duty (SDLT)');
    await expect(page.getByTestId('breakdown-tax')).toContainText(
      'First-time buyer relief applied',
    );
    await expect(page.getByTestId('breakdown-upfront')).toContainText('£4,099');
    await expect(page.getByTestId('breakdown-selling')).not.toContainText('Home Report');
    const years = page.getByTestId('year-table');
    await expect(years).not.toHaveAttribute('open', /.*/);
    await years.locator('summary').click();
    await expect(years.locator('tbody tr')).toHaveCount(26);
    await expect(years.locator('thead th')).toHaveText([
      'Year',
      'Home value',
      'Mortgage balance',
      'If you buy',
      'If you rent',
      'Difference',
    ]);
  });

  test('Scotland: LBTT, the ADS on an additional property, and the Home Report', async ({
    page,
  }) => {
    await open(page, 'a=city-of-edinburgh&b=additional');
    await expect(page.getByTestId('breakdown-tax')).toContainText(
      'Land and Buildings Transaction Tax (LBTT)',
    );
    await expect(page.getByTestId('breakdown-tax')).toContainText(
      'Additional Dwelling Supplement (ADS)',
    );
    await expect(page.getByTestId('breakdown-selling')).toContainText('Home Report');
  });

  test('Wales: LTT, with no first-time buyer relief', async ({ page }) => {
    await open(page, 'a=cardiff');
    await expect(page.getByTestId('breakdown-tax')).toContainText('Land Transaction Tax (LTT)');
    await expect(page.getByTestId('breakdown-tax')).toContainText(
      'No first-time buyer relief on LTT',
    );
  });

  test('how this works links to the method page', async ({ page }) => {
    await open(page, at('g=3'));
    const link = page.getByTestId('how-this-works').getByRole('link');
    await expect(link).toHaveAttribute('href', /how-it-works\/$/);
  });
});

test.describe('layout', () => {
  test('the answer card keeps its place and size when the answer changes case', async ({
    page,
  }) => {
    await open(page, at('g=3'));
    const before = await answerBox(page);
    const price = input(page, 'price');
    await price.fill('900000');
    await price.blur();
    await expect(page.getByTestId('answer')).toHaveAttribute('data-kind', 'no-break-even');
    expect(await answerBox(page)).toEqual(before);
    await price.fill('320000');
    await price.blur();
    await expect(page.getByTestId('answer')).toHaveAttribute('data-kind', 'break-even');
    expect(await answerBox(page)).toEqual(before);
  });

  test('no horizontal scroll with every results section open', async ({ page }) => {
    await open(page, 'a=city-of-edinburgh&b=additional');
    await page.getByTestId('year-table').locator('summary').click();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
