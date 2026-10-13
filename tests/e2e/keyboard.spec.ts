import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectStatus, gotoCalculator, input, params } from './calculator-helpers';

/**
 * The whole calculator works with a keyboard alone (inputs teammate): tab to the area, type
 * "Leeds" and pick it, change the price, open the advanced panel, change a value, reset it and
 * reach the answer. No mouse anywhere in this file.
 */

const MAX_STOPS = 80;

/** Press Tab (or Shift+Tab) until the locator has focus. Fails if it never does. */
async function tabTo(page: Page, target: Locator, backwards = false): Promise<void> {
  for (let stop = 0; stop < MAX_STOPS; stop += 1) {
    if (await target.evaluate((node) => node === document.activeElement)) return;
    await page.keyboard.press(backwards ? 'Shift+Tab' : 'Tab');
  }
  throw new Error(`Never reached ${target.toString()} by keyboard`);
}

/** Press Shift+Tab until focus is inside the container. */
async function tabBackInto(page: Page, container: Locator): Promise<void> {
  for (let stop = 0; stop < MAX_STOPS; stop += 1) {
    if (await container.evaluate((node) => node.contains(document.activeElement))) return;
    await page.keyboard.press('Shift+Tab');
  }
  throw new Error(`Never reached ${container.toString()} by keyboard`);
}

test('keyboard only: pick an area, change values, reset one, reach the answer', async ({
  page,
}) => {
  await gotoCalculator(page);

  // Tab to the area and pick Leeds by typing.
  const area = page.locator('#calc-area');
  await tabTo(page, area);
  await page.keyboard.type('Leeds');
  await expect(page.getByRole('option', { name: 'Leeds, England' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.keyboard.press('Enter');
  await expectStatus(page, 'ready');
  await expect(area).toHaveValue('Leeds');

  // The price is the next stop. Type a new one; Tab moves on to its slider.
  await page.keyboard.press('Tab');
  await expect(input(page, 'price')).toBeFocused();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('300k');
  await page.keyboard.press('Tab');
  await expect(page.locator('#calc-price-slider')).toBeFocused();
  await expect(input(page, 'price')).toHaveValue('300,000');
  await expect.poll(() => params(page).get('p')).toBe('300000');

  // The slider moves the price with the arrow keys.
  await page.keyboard.press('ArrowRight');
  await expect(input(page, 'price')).toHaveValue('301,000');

  // Open the advanced panel and change the mortgage term.
  const summary = page.getByTestId('advanced').locator('summary');
  await tabTo(page, summary);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('advanced')).toHaveAttribute('open', '');
  const term = input(page, 'termYears');
  await tabTo(page, term);
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('25');
  await expect.poll(() => params(page).get('t')).toBe('25');

  // Its Reset link is the next stop; it restores the default and keeps focus in the field.
  await page.keyboard.press('Tab');
  const reset = page.getByTestId('reset-termYears');
  await expect(reset).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(term).toHaveValue('30');
  await expect(term).toBeFocused();
  await expect.poll(() => params(page).get('t')).toBeNull();

  // Back up to the answer.
  await tabBackInto(page, page.locator('.calc-layout__answer'));
  await expect(page.getByTestId('answer-card')).toContainText('Leeds');
  await expect(page.getByTestId('answer-numeral')).toBeVisible();
});

test('keyboard only: the tags open their source and close with Escape', async ({ page }) => {
  await gotoCalculator(page, 'a=leeds');
  await expectStatus(page, 'ready');
  const tag = page.getByTestId('tag-rent');
  await tabTo(page, tag);
  await page.keyboard.press('Enter');
  const bubble = page.locator('#calc-rent-source');
  await expect(bubble).toBeVisible();
  await expect(bubble).toContainText(/[A-Z][a-z]{2} \d{4}/);
  await page.keyboard.press('Escape');
  await expect(bubble).toBeHidden();
});

test('keyboard only: the outlook and buyer use arrow keys', async ({ page }) => {
  await gotoCalculator(page, 'a=leeds');
  await expectStatus(page, 'ready');
  const typical = page.getByTestId('outlook').getByRole('radio', { name: 'Typical' });
  await tabTo(page, typical);
  await page.keyboard.press('ArrowRight');
  await expect(
    page.getByTestId('outlook').getByRole('radio', { name: 'Optimistic' }),
  ).toBeChecked();
  await expect.poll(() => params(page).get('o')).toBe('optimistic');
});
