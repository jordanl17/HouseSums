import { expect, test } from '@playwright/test';
import { calculator, expectStatus, gotoCalculator, params, pickArea } from './calculator-helpers';

/**
 * Island-level checks owned by the phase lead: hydration, the empty state, the area list coming
 * from our own origin, URL state and the unknown-area link. Inputs, answer copy, chart and the
 * other behaviours have their own specs.
 */

test('before an area is picked the answer panel is the calm empty state', async ({ page }) => {
  await gotoCalculator(page);
  await expectStatus(page, 'empty');
  await expect(page.getByTestId('answer-card')).toContainText(
    "Pick a place. We'll bring the local numbers.",
  );
  await expect(page.getByTestId('share-link')).toHaveCount(0);
});

test('the area list is fetched as JSON from our own origin, not bundled', async ({ page }) => {
  const listRequest = page.waitForRequest((request) =>
    request.url().endsWith('data/area-list.json'),
  );
  await gotoCalculator(page);
  await page.locator('#calc-area').focus();
  const request = await listRequest;
  expect(new URL(request.url()).origin).toBe(new URL(page.url()).origin);
  const response = await request.response();
  expect(response?.headers()['content-type']).toContain('application/json');
  const json = (await response?.json()) as { v: number; areas: unknown[] };
  expect(json.v).toBe(1);
  expect(json.areas).toHaveLength(361);
});

test('picking an area shows an answer and writes only the area to the URL', async ({ page }) => {
  await gotoCalculator(page);
  await pickArea(page, 'Leeds');
  await expect(page.getByTestId('answer-numeral')).toBeVisible();
  await expect.poll(() => params(page).toString()).toBe('a=leeds');
});

test('a link to an unknown area falls back to the empty state and drops the area', async ({
  page,
}) => {
  await gotoCalculator(page, 'a=not-a-real-place');
  await expectStatus(page, 'error');
  await expect.poll(() => params(page).get('a')).toBeNull();
  await expect(calculator(page)).toBeVisible();
});

test('changing inputs never adds history entries', async ({ page }) => {
  await gotoCalculator(page, 'a=leeds');
  await expectStatus(page, 'ready');
  const before = await page.evaluate(() => history.length);
  const price = page.locator('#calc-price');
  await price.fill('250000');
  await price.blur();
  await expect.poll(() => params(page).get('p')).toBe('250000');
  expect(await page.evaluate(() => history.length)).toBe(before);
});
