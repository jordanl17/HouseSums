import { expect, test, type Page } from '@playwright/test';
import { toCssRgb } from '../../scripts/check-contrast.mjs';
import { readTokens, resolveToken } from '../../scripts/lib/read-tokens.mjs';

/**
 * Light and dark themes follow the system setting. The expected colours are read
 * from src/styles/tokens.css, not copied here.
 */

const tokens = await readTokens();
const colour = (theme: 'light' | 'dark', name: string) =>
  toCssRgb(resolveToken(tokens[theme], name));

async function bodyStyle(page: Page) {
  return page.evaluate(() => {
    const style = getComputedStyle(document.body);
    return {
      backgroundColor: style.backgroundColor,
      backgroundImage: style.backgroundImage,
      backgroundAttachment: style.backgroundAttachment,
      color: style.color,
    };
  });
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`${theme} scheme`, () => {
    test.use({ colorScheme: theme });

    test('uses the concrete background, ink text and fixed contour circles', async ({ page }) => {
      await page.goto('./');
      const style = await bodyStyle(page);
      expect(style.backgroundColor).toBe(colour(theme, '--color-concrete'));
      expect(style.color).toBe(colour(theme, '--color-ink'));
      expect(style.backgroundImage).toMatch(/^repeating-radial-gradient\(circle at 85% 12%/);
      expect(style.backgroundImage).not.toContain('ellipse');
      expect(style.backgroundAttachment).toBe('fixed');
    });

    test('draws the logo with hi-vis sun and ink horizon', async ({ page }) => {
      await page.goto('./');
      const logo = page.getByRole('banner').locator('.logo__mark');
      await expect(logo).toBeVisible();
      const fills = await logo.evaluate((svg) => ({
        sun: getComputedStyle(svg.querySelector('.logo__sun') as Element).fill,
        horizon: getComputedStyle(svg.querySelector('.logo__horizon') as Element).fill,
      }));
      expect(fills.sun).toBe(colour(theme, '--color-hi-vis'));
      expect(fills.horizon).toBe(colour(theme, '--color-ink'));
    });
  });
}

test.describe('dark scheme', () => {
  test.use({ colorScheme: 'dark' });

  test('body background equals the dark concrete token', async ({ page }) => {
    await page.goto('./');
    expect((await bodyStyle(page)).backgroundColor).toBe('rgb(28, 28, 27)');
    expect(colour('dark', '--color-concrete')).toBe('rgb(28, 28, 27)');
  });
});
