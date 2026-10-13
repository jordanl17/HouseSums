import { expect, test, type Page } from '@playwright/test';
import { calculator, expectStatus, input, params } from './calculator-helpers';

/**
 * Phase 6 UX fixes (a11y-ux): on an area page, picking another area opens that area's own page
 * (heading, summary and title included), carrying the person's own figures in the query, with
 * focus back in the Area field; old links that named another area on an area page go to that
 * area's page; a growth figure held by the brief's range is tagged as such, not "Local figure".
 */

async function openArea(page: Page, slug: string, query = ''): Promise<void> {
  await page.goto(`rent-vs-buy/${slug}/${query === '' ? '' : `?${query}`}`);
  await expect(calculator(page)).toHaveAttribute('data-hydrated', 'true');
  await expectStatus(page, 'ready');
}

const h1 = (page: Page) => page.locator('h1');

test('picking another area on an area page opens its page, keeping my own figures', async ({
  page,
}) => {
  await openArea(page, 'leeds');
  // My own figures: a buyer type and a deposit (kept), and a price (belongs to Leeds, dropped).
  await page.getByTestId('buyer').getByRole('radio', { name: 'Moving' }).check();
  const deposit = input(page, 'deposit');
  await deposit.fill('40000');
  await deposit.blur();
  const price = input(page, 'price');
  await price.fill('260000');
  await price.blur();
  await expect.poll(() => params(page).get('d')).toBe('40000');

  const area = page.locator('#calc-area');
  await area.click();
  await area.fill('York');
  await page.getByRole('option', { name: /^York,/ }).click();

  await expect(page).toHaveURL(/\/rent-vs-buy\/york\/\?/);
  await expect(h1(page)).toHaveText('Rent v buy in York: how long until buying beats renting?');
  await expect(page).toHaveTitle(/^Rent or buy in York\? /);
  await expect(page.getByTestId('area-summary')).toContainText('York');
  await expect(calculator(page)).toHaveAttribute('data-hydrated', 'true');
  await expectStatus(page, 'ready');
  expect(params(page).get('b')).toBe('moving');
  expect(params(page).get('d')).toBe('40000');
  expect(params(page).get('p')).toBeNull();
  expect(params(page).get('a')).toBeNull();
  await expect(deposit).toHaveValue('40,000');
  await expect(page.getByTestId('answer-headline')).toContainText('York');
  // Focus is back where it was: in the Area field, showing the new area.
  await expect(area).toBeFocused();
  await expect(area).toHaveValue('York');

  // Back returns to Leeds as it was left: its own heading, area and figures.
  await page.goBack();
  await expect(h1(page)).toHaveText('Rent v buy in Leeds: how long until buying beats renting?');
  await expect(calculator(page)).toHaveAttribute('data-hydrated', 'true');
  await expect(area).toHaveValue('Leeds');
  await expect(page.getByTestId('answer-headline')).toContainText('Leeds');
});

test('an area page with no changes opens the next area with a clean address', async ({ page }) => {
  await openArea(page, 'leeds');
  const area = page.locator('#calc-area');
  await area.click();
  await area.fill('Glasgow City');
  await area.press('Enter');
  await expect(page).toHaveURL(/\/rent-vs-buy\/glasgow-city\/$/);
  await expect(h1(page)).toContainText('Glasgow City');
});

test('an old link naming another area on an area page goes to that area', async ({ page }) => {
  await page.goto('rent-vs-buy/leeds/?a=york&p=300000');
  await expect(page).toHaveURL(/\/rent-vs-buy\/york\/\?p=300000$/);
  await expect(h1(page)).toContainText('York');
  await expect(calculator(page)).toHaveAttribute('data-hydrated', 'true');
  await expect(input(page, 'price')).toHaveValue('300,000');
});

test('the home page keeps picking in place', async ({ page }) => {
  await page.goto('./?a=leeds');
  await expectStatus(page, 'ready');
  const area = page.locator('#calc-area');
  await area.click();
  await area.fill('York');
  await page.getByRole('option', { name: /^York,/ }).click();
  await expect.poll(() => params(page).get('a')).toBe('york');
  expect(new URL(page.url()).pathname).not.toContain('rent-vs-buy');
  await expect(area).toBeFocused();
});

test('a floored growth figure says so, with the real 10-year average', async ({ page }) => {
  await openArea(page, 'aberdeen-city');
  const tag = page.getByTestId('tag-houseGrowth');
  await expect(tag).toHaveText(/^Floored at 0%/);
  await expect(tag).not.toHaveClass(/tag--local/);
  await tag.click();
  const tip = page.locator('#calc-houseGrowth-source');
  await expect(tip).toContainText('UK House Price Index, 10-year average');
  await expect(tip).toContainText(/The actual figure is −\d+(\.\d+)?% a year/);
  await expect(tip).toContainText('the calculator floors it at 0%');
  // A figure used as published is still "Local figure".
  await expect(page.getByTestId('tag-price')).toHaveText(/^Local figure/);
});

test('a capped growth figure says so too', async ({ page }) => {
  await openArea(page, 'oldham');
  const tag = page.getByTestId('tag-houseGrowth');
  await expect(tag).toHaveText(/^Capped at 6%/);
  await tag.click();
  await expect(page.locator('#calc-houseGrowth-source')).toContainText(
    'the calculator caps it at 6%',
  );
});
