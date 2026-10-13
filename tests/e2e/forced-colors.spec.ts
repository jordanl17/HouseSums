import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { openDisclosure, THEMES, waitForCalculator } from './axe-helpers';

/**
 * Forced colours (Windows contrast themes), phase 6, a11y-ux. Chromium emulates the mode: the
 * browser replaces the site's colours with the system palette, so anything drawn only with a
 * background or a brand colour can vanish. These checks keep focus, the source tags, both chart
 * lines (told apart by a dash, not colour), the break-even marker and the slider tracks visible,
 * in a light and a dark system palette, and save screenshots for a person to look at:
 * attached to the report, and copied to $FORCED_COLORS_SHOTS (a directory) when it is set.
 */

const SHOTS_DIR = process.env.FORCED_COLORS_SHOTS;

async function shot(page: Page, name: string, target?: Locator): Promise<void> {
  const info = test.info();
  const file = `${name}-${info.project.name}.png`;
  const path = info.outputPath(file);
  if (target) await target.screenshot({ path });
  else await page.screenshot({ path, fullPage: true });
  await info.attach(file, { path, contentType: 'image/png' });
  if (SHOTS_DIR) {
    await mkdir(SHOTS_DIR, { recursive: true });
    const copy = join(SHOTS_DIR, file);
    if (target) await target.screenshot({ path: copy });
    else await page.screenshot({ path: copy, fullPage: true });
  }
}

/** The system colour a keyword resolves to on this page, as rgb(). */
async function systemColour(page: Page, keyword: string): Promise<string> {
  return page.evaluate((value) => {
    const probe = document.createElement('span');
    probe.style.color = value;
    document.body.append(probe);
    const colour = getComputedStyle(probe).color;
    probe.remove();
    return colour;
  }, keyword);
}

/** Computed outline of the focused element (or of `ring`, the element that draws its ring). */
async function focusOutline(ring: Locator) {
  return ring.evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      style: style.outlineStyle,
      width: parseFloat(style.outlineWidth),
      colour: style.outlineColor,
    };
  });
}

for (const theme of THEMES) {
  test.describe(`forced colours, ${theme} system palette`, () => {
    test.use({ colorScheme: theme });

    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ forcedColors: 'active', colorScheme: theme });
    });

    test('the area page keeps its chart lines, marker, tags and slider tracks', async ({
      page,
    }) => {
      await page.goto('rent-vs-buy/leeds/');
      await waitForCalculator(page);
      expect(await page.evaluate(() => matchMedia('(forced-colors: active)').matches)).toBe(true);
      const text = await systemColour(page, 'CanvasText');
      const canvas = await systemColour(page, 'Canvas');
      const highlight = await systemColour(page, 'Highlight');
      expect(text).not.toBe(canvas);

      // Both lines in the text colour, the rent line dashed so they differ without colour.
      const chart = page.getByTestId('chart');
      const line = (name: string) =>
        chart.locator(`.chart__line--${name}`).evaluate((el) => {
          const style = getComputedStyle(el);
          return { stroke: style.stroke, dash: style.strokeDasharray };
        });
      const buy = await line('buy');
      const rent = await line('rent');
      expect(buy.stroke).toBe(text);
      expect(rent.stroke).toBe(text);
      expect(buy.dash).toBe('none');
      expect(rent.dash).not.toBe('none');

      // The break-even marker: a Highlight dash over a text-coloured edge, and a bordered label.
      const marker = await chart
        .locator('.chart__marker')
        .evaluate((el) => getComputedStyle(el).stroke);
      const edge = await chart
        .locator('.chart__marker-edge')
        .evaluate((el) => getComputedStyle(el).stroke);
      expect(marker).toBe(highlight);
      expect(edge).toBe(text);
      const label = page.getByTestId('chart-marker');
      await expect(label).toBeVisible();
      const labelBorder = await label.evaluate((el) => getComputedStyle(el).borderTopWidth);
      expect(parseFloat(labelBorder)).toBeGreaterThanOrEqual(1);

      // Source tags keep an edge (their fill is gone), and say what they are in words.
      for (const key of ['price', 'rent', 'houseGrowth']) {
        const tag = page.getByTestId(`tag-${key}`);
        const border = await tag.evaluate((el) => ({
          width: parseFloat(getComputedStyle(el).borderTopWidth),
          style: getComputedStyle(el).borderTopStyle,
        }));
        expect(border.width).toBeGreaterThanOrEqual(1);
        expect(border.style).toBe('solid');
        await expect(tag).toHaveText(/figure|Floored|Capped/);
      }

      // Sliders draw their track and thumb in system colours (they opt out of the browser's own
      // adjustment, which would paint the track over with the page colour).
      const slider = page.locator('#calc-price-slider');
      expect(await slider.evaluate((el) => getComputedStyle(el).forcedColorAdjust)).toBe('none');

      await shot(page, `forced-${theme}-area-page`);
      await shot(page, `forced-${theme}-answer-card`, page.getByTestId('answer-card'));
    });

    test('focus stays visible on every kind of control', async ({ page }) => {
      await page.goto('rent-vs-buy/leeds/');
      await waitForCalculator(page);
      const highlight = await systemColour(page, 'Highlight');
      const controls: { name: string; focus: Locator; ring: Locator }[] = [
        {
          name: 'skip link',
          focus: page.getByRole('link', { name: 'Skip to main content' }),
          ring: page.getByRole('link', { name: 'Skip to main content' }),
        },
        {
          name: 'area field',
          focus: page.locator('#calc-area'),
          ring: page.getByTestId('field-calc-area').locator('.field__control'),
        },
        {
          name: 'price slider',
          focus: page.locator('#calc-price-slider'),
          ring: page.locator('#calc-price-slider'),
        },
        {
          name: 'source tag',
          focus: page.getByTestId('tag-rent'),
          ring: page.getByTestId('tag-rent'),
        },
        {
          name: 'chart',
          focus: page.getByRole('slider', { name: 'Year shown on the chart' }),
          ring: page.getByRole('slider', { name: 'Year shown on the chart' }),
        },
        {
          name: 'buyer choice',
          focus: page.getByTestId('buyer').getByRole('radio', { name: 'First-time' }),
          ring: page.getByTestId('buyer').locator('.segmented__label').first(),
        },
        {
          name: 'advanced panel',
          focus: page.getByTestId('advanced').locator('summary'),
          ring: page.getByTestId('advanced').locator('summary'),
        },
      ];
      // Focus from the keyboard, so :focus-visible applies as it would for a keyboard user.
      await page.keyboard.press('Tab');
      for (const control of controls) {
        await control.focus.focus();
        await expect(control.focus).toBeFocused();
        const outline = await focusOutline(control.ring);
        expect(outline.style, control.name).not.toBe('none');
        expect(outline.width, control.name).toBeGreaterThanOrEqual(2);
        expect(outline.colour, control.name).not.toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
        if (control.name !== 'buyer choice' && control.name !== 'area field') {
          expect(outline.colour, control.name).toBe(highlight);
        }
      }
      await page.getByRole('slider', { name: 'Year shown on the chart' }).focus();
      await shot(page, `forced-${theme}-chart-focused`, page.getByTestId('answer-card'));
    });

    test('the advanced panel and the home page read in forced colours', async ({ page }) => {
      await page.goto('rent-vs-buy/aberdeen-city/');
      await waitForCalculator(page);
      await openDisclosure(page, 'advanced');
      await expect(page.locator('#calc-termYears')).toBeVisible();
      await shot(page, `forced-${theme}-advanced-open`, page.getByTestId('advanced'));
      await page.getByTestId('tag-houseGrowth').click();
      await expect(page.locator('#calc-houseGrowth-source')).toContainText('floors it at 0%');
      await shot(
        page,
        `forced-${theme}-floored-tooltip`,
        page.getByTestId('field-calc-houseGrowth'),
      );

      await page.goto('./');
      await waitForCalculator(page);
      await shot(page, `forced-${theme}-home`);
    });
  });
}
