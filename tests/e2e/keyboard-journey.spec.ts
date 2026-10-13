import { expect, test, type Page } from '@playwright/test';
import { calculator, expectStatus } from './calculator-helpers';
import { THEMES } from './axe-helpers';

/**
 * Keyboard-only journeys (phase 6, a11y-ux), in light and dark at 360 and 1280: skip link, pick
 * an area by typing, then Tab through every stop on the page to the footer. At every stop focus
 * is on a real element (never lost to the body), on screen, with a visible ring. On an area page,
 * picking another area opens its page with focus back in the Area field. No mouse in this file.
 */

const MAX_STOPS = 150;

interface Stop {
  /** Short description of the focused element, for failure messages. */
  name: string;
  lost: boolean;
  /** The element drawing the ring (the element, its pill or its segmented label). */
  ring: boolean;
  onScreen: boolean;
  inFooter: boolean;
  /** A closed <details> summary: the walk opens it, so its contents are walked too. */
  closedSummary: boolean;
}

/** Describe the focused element and whether its focus is visible. */
async function stop(page: Page): Promise<Stop> {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body || el === document.documentElement) {
      return {
        name: 'body',
        lost: true,
        ring: false,
        onScreen: false,
        inFooter: false,
        closedSummary: false,
      };
    }
    const name = `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${
      el.getAttribute('data-testid') ? `[${el.getAttribute('data-testid')}]` : ''
    } "${(el.textContent ?? '').trim().slice(0, 30)}"`;
    const drawsRing = (node: Element | null) => {
      if (!node) return false;
      const style = getComputedStyle(node);
      const outline = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
      return outline || (style.boxShadow !== 'none' && style.boxShadow !== '');
    };
    // The ring is on the element, on the pill round an input, or on a radio's label.
    const candidates = [el, el.closest('.field__control'), el.nextElementSibling];
    const ringEl = candidates.find((node) => drawsRing(node)) ?? null;
    const box = (ringEl ?? el).getBoundingClientRect();
    const onScreen =
      box.width > 4 &&
      box.height > 4 &&
      box.bottom > 0 &&
      box.top < window.innerHeight &&
      box.right > 0 &&
      box.left < window.innerWidth;
    return {
      name,
      lost: false,
      ring: ringEl !== null,
      onScreen,
      inFooter: el.closest('footer') !== null,
      closedSummary: el.tagName === 'SUMMARY' && !(el.parentElement as HTMLDetailsElement).open,
    };
  });
}

/**
 * Tab through the rest of the page, checking every stop, until focus leaves the footer. Every
 * closed disclosure on the way (the advanced panel, the year table) is opened with Enter.
 */
async function tabToTheEnd(page: Page): Promise<number> {
  let reachedFooter = false;
  for (let count = 1; count <= MAX_STOPS; count += 1) {
    await page.keyboard.press('Tab');
    const now = await stop(page);
    if (reachedFooter && !now.inFooter) return count; // wrapped past the last link
    expect(now.lost, `focus lost after ${count} Tab presses`).toBe(false);
    expect(now.ring, `no visible focus ring on ${now.name}`).toBe(true);
    expect(now.onScreen, `${now.name} is focused but off screen`).toBe(true);
    if (now.inFooter) reachedFooter = true;
    if (now.closedSummary) await page.keyboard.press('Enter');
  }
  throw new Error(`Still tabbing after ${MAX_STOPS} stops`);
}

/** Skip link, then into main, then the Area field: the first stops on a calculator page. */
async function skipToArea(page: Page): Promise<void> {
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('main#main')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#calc-area')).toBeFocused();
}

for (const theme of THEMES) {
  test.describe(`${theme} theme`, () => {
    test.use({ colorScheme: theme });

    test('home page: pick an area by keyboard, then every stop to the footer', async ({ page }) => {
      await page.goto('./');
      await expect(calculator(page)).toHaveAttribute('data-hydrated', 'true');
      await skipToArea(page);
      await page.keyboard.type('Leeds');
      await expect(page.getByRole('option', { name: 'Leeds, England' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      await page.keyboard.press('Enter');
      await expectStatus(page, 'ready');
      // Focus never leaves the field when a place is picked.
      await expect(page.locator('#calc-area')).toBeFocused();
      await expect(page.locator('#calc-area')).toHaveValue('Leeds');
      const stops = await tabToTheEnd(page);
      expect(stops).toBeGreaterThan(30);
    });

    test('area page: picking another area opens it with focus in the Area field', async ({
      page,
    }) => {
      await page.goto('rent-vs-buy/leeds/');
      await expect(calculator(page)).toHaveAttribute('data-hydrated', 'true');
      await skipToArea(page);
      await page.keyboard.type('York');
      await expect(page.getByRole('option', { name: 'York, England' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(/\/rent-vs-buy\/york\/$/);
      await expect(page.locator('h1')).toContainText('York');
      await expect(calculator(page)).toHaveAttribute('data-hydrated', 'true');
      await expect(page.locator('#calc-area')).toBeFocused();
      // The new page's answer is announced once, as a pick on the home page would be.
      await expect(page.getByTestId('answer-live')).toContainText('York');
      const stops = await tabToTheEnd(page);
      // The area page adds the summary, the related areas and their links.
      expect(stops).toBeGreaterThan(35);
    });
  });
}

test('"Try again" keeps focus in the Area field when the list loads', async ({ page }) => {
  let fail = true;
  await page.route('**/data/area-list.json', async (route) => {
    if (fail) await route.fulfill({ status: 503, body: '' });
    else await route.continue();
  });
  await page.goto('./');
  await expect(calculator(page)).toHaveAttribute('data-hydrated', 'true');
  await skipToArea(page);
  const retry = page.getByRole('button', { name: 'Try again' });
  await expect(retry).toBeVisible();
  fail = false;
  await page.keyboard.press('Tab');
  await expect(retry).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(retry).toHaveCount(0);
  await expect(page.locator('#calc-area')).toBeFocused();
  await page.keyboard.type('Leeds');
  await page.keyboard.press('Enter');
  await expectStatus(page, 'ready');
});
