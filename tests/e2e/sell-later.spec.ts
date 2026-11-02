import { expect, test } from '@playwright/test';

/**
 * Sell later (/sell-later/): figures in the link open the calculator with them, changes keep the
 * address bar in step, and the copy button gives a link that reopens the same figures.
 */

test('a link with figures opens with them', async ({ page }) => {
  await page.goto('sell-later/?p=320000&d=64000&mr=4.25&t=25&y=10');
  await expect(page.locator('#sl-price')).toHaveValue('320,000');
  await expect(page.locator('#sl-deposit')).toHaveValue('64,000');
  await expect(page.locator('#sl-mortgageRate')).toHaveValue('4.25');
  await expect(page.locator('#sl-termYears')).toHaveValue('25');
  await expect(page.getByTestId('sell-later-answer')).toContainText('Sell after 10 years');
});

test('changing a figure updates the link, and Reset takes it out again', async ({ page }) => {
  await page.goto('sell-later/');
  await page.locator('#sl-yearsHeld').fill('8');
  await page.keyboard.press('Tab');
  await expect.poll(() => new URL(page.url()).search).toBe('?y=8');
  await page.getByTestId('reset-yearsHeld').click();
  await expect.poll(() => new URL(page.url()).search).toBe('');
});

test('the copy button gives a link to these figures', async ({ page, context, browserName }) => {
  if (browserName === 'chromium') {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  }
  await page.goto('sell-later/?y=12');
  await expect(page.getByTestId('sell-later-answer')).toContainText('Sell after 12 years');
  await page.getByTestId('sl-share-link').click();
  await expect(page.getByTestId('sl-share-status')).toHaveText(/Link copied|didn't let us copy/);
  const copied = await page.evaluate(() => navigator.clipboard.readText()).catch(() => null);
  const link = copied ?? (await page.getByTestId('sl-share-url').inputValue());
  expect(new URL(link).search).toBe('?y=12');
});

test('has its own social card', async ({ page }) => {
  await page.goto('sell-later/');
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    'content',
    /\/og\/sell-later\.png$/,
  );
});

test('a sale year past the term is held to the term, on screen and in the link', async ({
  page,
}) => {
  await page.goto('sell-later/');
  await page.locator('#sl-yearsHeld').fill('35');
  await page.keyboard.press('Tab');
  await expect(page.locator('#sl-yearsHeld')).toHaveValue('30');
  await expect.poll(() => new URL(page.url()).search).toBe('?y=30');
});
