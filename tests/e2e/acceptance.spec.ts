import { expect, test, type Page } from '@playwright/test';
import { NUMERIC_INPUT_KEYS } from '../../src/lib/types';
import { expectStatus, gotoCalculator, input, params, pickArea } from './calculator-helpers';

/**
 * Brief acceptance boxes that no other spec covers in full (phase 6, docs-acceptance). Each test
 * is named after the box it proves and is listed in docs/acceptance.md. Paths are relative, so
 * these also run against the live site.
 */

/** Type into a field as a person would (select all, type), then leave it. */
async function enter(page: Page, key: string, text: string): Promise<void> {
  const box = input(page, key);
  await box.click();
  await box.press('ControlOrMeta+a');
  await box.pressSequentially(text);
  await box.blur();
}

async function openAdvanced(page: Page): Promise<void> {
  const advanced = page.getByTestId('advanced');
  if ((await advanced.getAttribute('open')) === null) {
    await advanced.locator('summary').click();
  }
  await expect(advanced).toHaveAttribute('open', '');
}

test('with only area and price entered, the answer card, chart and key numbers render', async ({
  page,
}) => {
  await gotoCalculator(page);
  await pickArea(page, 'Leeds');
  await enter(page, 'price', '250,000');
  await expect.poll(() => params(page).toString()).toBe('a=leeds&p=250000');

  await expect(page.getByTestId('answer-headline')).toContainText('Leeds');
  await expect(page.getByTestId('answer-numeral')).toBeVisible();
  await expect(page.getByTestId('chart')).toBeVisible();
  for (const key of ['key-cash', 'key-first-month', 'key-after']) {
    await expect(page.getByTestId(key)).toBeVisible();
    await expect(page.getByTestId(key)).toContainText('£');
  }
});

for (const path of ['./?a=leeds', 'rent-vs-buy/leeds/']) {
  test(`the first screen holds area, price and the answer, with no scrolling (${path})`, async ({
    page,
  }) => {
    await page.goto(path);
    await expectStatus(page, 'ready');
    const viewport = page.viewportSize();
    if (!viewport) throw new Error('no viewport');
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    const bottom = async (locator: ReturnType<Page['getByTestId']>) => {
      const box = await locator.boundingBox();
      if (!box) throw new Error('not visible');
      return box.y + box.height;
    };
    await expect(input(page, 'price')).toBeVisible();
    expect(await bottom(page.getByTestId('field-calc-area'))).toBeLessThanOrEqual(viewport.height);
    expect(await bottom(page.getByTestId('field-calc-price'))).toBeLessThanOrEqual(viewport.height);
    // Phones (brief, quality bar): the answer is in view once an area is picked. Laptops (slop
    // check 2, 1280x800): the whole answer card, down to the key numbers, is in the first screen.
    const answer = viewport.width < 600 ? 'answer-headline' : 'answer-card';
    expect(await bottom(page.getByTestId(answer))).toBeLessThanOrEqual(viewport.height);
  });
}

/**
 * One value per input, each off its default for City of Edinburgh (Scotland, so the Home Report
 * field is shown too). Odd decimals so no value can equal a derived default by chance.
 */
const CHANGES: Record<string, string> = {
  price: '255,555',
  deposit: '33,333',
  rent: '1,234',
  mortgageRate: '4.55',
  houseGrowth: '1.25',
  termYears: '27',
  fixYears: '3',
  rateAfterFix: '6.05',
  productFee: '1,111',
  legalBuying: '2,222',
  survey: '444',
  moving: '777',
  maintenanceRate: '1.5',
  insurance: '444',
  serviceCharge: '1,212',
  rentGrowth: '2.75',
  investmentReturn: '6.25',
  inflation: '3.25',
  agentFeeRate: '1.25',
  legalSelling: '1,666',
  homeReport: '666',
  years: '17',
};

test('every input in the inputs table is editable and gets a reset link once changed', async ({
  page,
}) => {
  test.setTimeout(90_000);
  // Every numeric input the engine takes is in the list above.
  expect(Object.keys(CHANGES).sort()).toEqual([...NUMERIC_INPUT_KEYS].sort());

  await gotoCalculator(page, 'a=city-of-edinburgh');
  await expectStatus(page, 'ready');
  await openAdvanced(page);

  for (const key of NUMERIC_INPUT_KEYS) {
    const text = CHANGES[key] ?? '';
    const before = await input(page, key).inputValue();
    const reset = page.getByTestId(`reset-${key}`);
    await expect(reset, `${key} has no Reset before it changes`).toHaveCount(0);
    await enter(page, key, text);
    await expect(input(page, key)).toHaveValue(text);
    await expect(reset, `${key} shows Reset once changed`).toBeVisible();
    await reset.click();
    await expect(input(page, key)).toHaveValue(before);
    await expect(reset).toHaveCount(0);
  }

  // Tax rules (the nation override) has a Reset too.
  const nation = page.locator('#calc-nation');
  await expect(nation).toHaveValue('sco');
  await nation.selectOption('eng');
  await page.getByTestId('reset-nation').click();
  await expect(nation).toHaveValue('sco');
  await expect(page.getByTestId('reset-nation')).toHaveCount(0);

  // Buyer type and outlook are segmented controls: the default option is always one press away.
  await page.getByTestId('buyer').getByLabel('Moving').check();
  await page.getByTestId('buyer').getByLabel('First-time').check();
  await page.getByTestId('outlook').getByLabel('Cautious').check();
  await page.getByTestId('outlook').getByLabel('Typical').check();

  // Everything is back at its default, so the link names only the area.
  await expect.poll(() => params(page).toString()).toBe('a=city-of-edinburgh');
});

test('changing an input updates the results by the next animation frame', async ({ page }) => {
  await gotoCalculator(page, 'a=leeds');
  await expectStatus(page, 'ready');
  await openAdvanced(page);

  const result = await page.evaluate(async () => {
    const cash = () => document.querySelector('[data-testid="key-cash"]')?.textContent ?? '';
    const field = document.getElementById('calc-legalBuying') as HTMLInputElement;
    const before = cash();
    field.focus();
    field.value = '5000';
    field.dispatchEvent(new Event('input', { bubbles: true }));
    // The island renders the change, then runs the model in its next requestAnimationFrame.
    // This callback was queued first, so it runs in that same frame just before the model; the
    // one after it sees what that frame painted.
    const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await frame();
    await frame();
    return { before, after: cash() };
  });

  expect(result.after).not.toBe(result.before);
  // Legal fees went from £1,800 to £5,000, so the cash needed is £3,200 more.
  const pounds = (text: string) => Number(text.replace(/[^0-9]/g, ''));
  expect(pounds(result.after) - pounds(result.before)).toBe(3200);
});
