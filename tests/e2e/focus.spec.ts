import { expect, test, type Locator } from '@playwright/test';
import { toCssRgb } from '../../scripts/check-contrast.mjs';
import { readTokens, resolveToken } from '../../scripts/lib/read-tokens.mjs';

/**
 * Keyboard focus is always visible: the first tab stop is the skip link, it appears on
 * screen, and every focused control gets the hi-vis ring inside an ink outline
 * (see docs/decisions.md, "Focus ring").
 */

const tokens = await readTokens();

async function focusStyle(locator: Locator) {
  return locator.evaluate((el) => {
    const style = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      outlineColor: style.outlineColor,
      boxShadow: style.boxShadow,
      width: box.width,
      height: box.height,
      top: box.top,
      left: box.left,
    };
  });
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`${theme} scheme`, () => {
    test.use({ colorScheme: theme });
    const edge = toCssRgb(resolveToken(tokens[theme], '--color-focus-edge'));
    const ring = toCssRgb(resolveToken(tokens[theme], '--color-focus-ring'));
    // Hi-vis controls (the skip link) take their own edge: light ink in dark.
    const hiVisEdge = toCssRgb(resolveToken(tokens[theme], '--color-focus-edge-hi-vis'));

    test('the first tab stop is a visible skip link with the focus ring', async ({ page }) => {
      await page.goto('./');
      const skip = page.getByRole('link', { name: 'Skip to main content' });

      await page.keyboard.press('Tab');
      await expect(skip).toBeFocused();
      await expect(skip).toBeInViewport();

      const style = await focusStyle(skip);
      expect(style.width).toBeGreaterThan(100);
      expect(style.height).toBeGreaterThanOrEqual(24);
      expect(style.top).toBeGreaterThanOrEqual(0);
      expect(style.left).toBeGreaterThanOrEqual(0);
      expect(style.outlineStyle).toBe('solid');
      expect(style.outlineWidth).toBe('2px');
      expect(style.outlineColor).toBe(hiVisEdge);
      expect(style.boxShadow).toContain(ring);
    });

    test('the skip link moves focus to the main content', async ({ page }) => {
      await page.goto('./');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Enter');
      await expect(page.locator('main#main')).toBeFocused();
      await page.keyboard.press('Tab');
      // Next stop after main is the calculator's first input, past the header.
      await expect(page.locator('#calc-area')).toBeFocused();
    });

    test('the home link and nav links show the ring when tabbed to', async ({ page }) => {
      await page.goto('./');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      const home = page.getByRole('banner').getByRole('link', { name: 'House Sums' });
      await expect(home).toBeFocused();
      let style = await focusStyle(home);
      expect(style.outlineStyle).toBe('solid');
      expect(style.outlineColor).toBe(edge);
      expect(style.boxShadow).toContain(ring);

      await page.keyboard.press('Tab');
      const howItWorks = page.getByRole('link', { name: 'How it works' });
      await expect(howItWorks).toBeFocused();
      style = await focusStyle(howItWorks);
      expect(style.outlineStyle).toBe('solid');
      expect(style.boxShadow).toContain(ring);
    });
  });
}
