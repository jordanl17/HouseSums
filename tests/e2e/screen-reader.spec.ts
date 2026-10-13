import { expect, test, type Locator, type Page } from '@playwright/test';
import { calculator, expectStatus, gotoCalculator, pickArea } from './calculator-helpers';

/**
 * What a screen reader gets (phase 6, a11y-ux), checked through the DOM and the accessibility
 * tree since no screen reader runs in CI:
 * - the answer's live region announces once per settled change, and not at page load;
 * - field notes and the source toggletip are standing live regions, present before they fill;
 * - names for the tags, the chart and the picker;
 * - tables keep their table semantics, captions and row headers, also stacked at 360px.
 */

/** Record every text the element takes from now on (the live region's announcements). */
async function recordText(locator: Locator): Promise<() => Promise<string[]>> {
  await locator.evaluate((el) => {
    const log: string[] = [];
    (window as unknown as { __live: string[] }).__live = log;
    new MutationObserver(() => log.push(el.textContent ?? '')).observe(el, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  });
  return () =>
    locator.page().evaluate(() => [...(window as unknown as { __live: string[] }).__live]);
}

/** Let any pending announcement (600ms after the last change) fire. */
async function settle(page: Page): Promise<void> {
  await page.waitForTimeout(1200);
}

test.describe('the answer live region', () => {
  test('a slider drag is announced once, with the settled headline', async ({ page }) => {
    await gotoCalculator(page, 'a=leeds');
    await expectStatus(page, 'ready');
    const live = page.getByTestId('answer-live');
    await settle(page);
    const heard = await recordText(live);

    const rate = page.locator('#calc-mortgageRate-slider');
    await rate.focus();
    for (let i = 0; i < 25; i += 1) await rate.press('ArrowRight');
    await rate.press('End');
    await settle(page);
    const texts = (await heard()).filter((text) => text !== '');
    const headline = ((await page.getByTestId('answer-headline').textContent()) ?? '').trim();
    expect(texts).toHaveLength(1);
    expect(texts[0]).toContain(headline);
  });

  test('a change undone within the delay announces nothing', async ({ page }) => {
    await gotoCalculator(page, 'a=leeds');
    await expectStatus(page, 'ready');
    const live = page.getByTestId('answer-live');
    await settle(page);
    const before = await live.textContent();
    const heard = await recordText(live);
    const rate = page.locator('#calc-mortgageRate-slider');
    await rate.focus();
    for (let i = 0; i < 20; i += 1) await rate.press('ArrowRight');
    for (let i = 0; i < 20; i += 1) await rate.press('ArrowLeft');
    await settle(page);
    expect(await heard()).toEqual([]);
    await expect(live).toHaveText(before ?? '');
  });

  test('an area page does not read its answer out on load', async ({ page }) => {
    await page.goto('rent-vs-buy/leeds/');
    await expect(calculator(page)).toHaveAttribute('data-hydrated', 'true');
    await settle(page);
    await expect(page.getByTestId('answer-live')).toHaveText('');
  });

  test('picking an area on the home page is announced once', async ({ page }) => {
    await gotoCalculator(page);
    const live = page.getByTestId('answer-live');
    const heard = await recordText(live);
    await pickArea(page, 'Leeds');
    await settle(page);
    const texts = (await heard()).filter((text) => text !== '');
    expect(texts).toHaveLength(1);
    expect(texts[0]).toContain('Leeds');
  });
});

test.describe('standing live regions', () => {
  test('field notes exist, empty, before they have anything to say', async ({ page }) => {
    await gotoCalculator(page, 'a=leeds');
    await expectStatus(page, 'ready');
    const note = page.locator('#calc-price-note');
    await expect(note).toHaveAttribute('aria-live', 'polite');
    await expect(note).toBeEmpty();
    await expect(note).not.toHaveAttribute('hidden', /.*/);
    const price = page.locator('#calc-price');
    await price.fill('5');
    await price.blur();
    await expect(note).toHaveText('The lowest this takes is £10,000');
    // And it is joined to the field's description, so it is heard on return to the field.
    await expect(price).toHaveAttribute('aria-describedby', /calc-price-note/);
  });

  test('the source toggletip is a status region that fills when opened', async ({ page }) => {
    await gotoCalculator(page, 'a=leeds');
    await expectStatus(page, 'ready');
    const bubble = page.locator('#calc-rent-source');
    await expect(bubble).toHaveAttribute('role', 'status');
    await expect(bubble).toBeEmpty();
    const tag = page.getByTestId('tag-rent');
    await expect(tag).toHaveAccessibleName(/^Local figure: source for Monthly rent/);
    await expect(tag).toHaveAttribute('aria-controls', 'calc-rent-source');
    await tag.press('Enter');
    await expect(bubble).toContainText('Private Rents');
    await tag.press('Escape');
    await expect(bubble).toBeEmpty();
  });
});

test.describe('names and roles', () => {
  test('the calculator controls are named', async ({ page }) => {
    await gotoCalculator(page, 'a=leeds');
    await expectStatus(page, 'ready');
    await expect(page.getByRole('combobox', { name: 'Area' })).toHaveValue('Leeds');
    await expect(page.getByRole('slider', { name: 'Year shown on the chart' })).toHaveAttribute(
      'aria-valuetext',
      /^(Now|Year \d+): if you buy £[\d,]+, if you rent £[\d,]+$/,
    );
    await expect(
      page.getByRole('table', { name: /walk away with if you sold, by year/ }),
    ).toHaveCount(1);
    await expect(page.getByRole('region', { name: 'Answer', exact: true })).toHaveCount(1);
    await expect(page.getByTestId('answer-live')).toHaveAttribute('role', 'status');
  });

  test('the nation table has a caption and a row header per area', async ({ page }) => {
    await page.goto('rent-vs-buy/scotland/');
    const table = page.getByTestId('nation-areas');
    await expect(table.locator('caption')).toContainText('Every area in Scotland, A to Z');
    await expect(table.getByRole('rowheader')).toHaveCount(32);
    await expect(table.getByRole('rowheader', { name: 'Glasgow City' })).toHaveCount(1);
  });

  test('stacked tables keep their table roles at any width', async ({ page }) => {
    await page.goto('how-it-works/');
    const stacked = page.locator('table.data-table--stack').first();
    await expect(stacked).toBeVisible();
    const snapshot = await stacked.ariaSnapshot();
    expect(snapshot).toMatch(/^- table/);
    expect(snapshot).toContain('- row');
    expect(snapshot).toMatch(/- (rowheader|cell)/);
    expect(snapshot).toContain('- columnheader');
  });
});
