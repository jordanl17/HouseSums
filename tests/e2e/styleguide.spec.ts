import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * /styleguide/: the unlisted page that shows every UI primitive and a static
 * example of the calculator's first screen. Runs in both projects
 * (mobile-360, desktop-1280) against the built site or the live site.
 */

const PATH = 'styleguide/';

async function box(locator: Locator): Promise<{ x: number; y: number; w: number; h: number }> {
  const b = await locator.boundingBox();
  if (!b) throw new Error('element has no bounding box (not rendered)');
  return { x: b.x, y: b.y, w: b.width, h: b.height };
}

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: (document.scrollingElement ?? document.documentElement).scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
}

/** The example composition and its parts. */
function example(page: Page) {
  const root = page.locator('[data-example="calculator"]');
  return {
    root,
    primary: root.locator('.calc-layout__primary'),
    answer: root.locator('.calc-layout__answer'),
    rest: root.locator('.calc-layout__rest'),
    numeral: root.locator('.answer__numeral'),
    area: root.getByLabel('Area', { exact: true }),
    price: root.getByLabel('Property price', { exact: true }),
    // Top-level inputs only: the fields inside the closed "Adjust every assumption" panel are hidden.
    inputs: root.locator(
      ':is(.calc-layout__primary, .calc-layout__rest) > .fields__grid > :is(.field, .segmented)',
    ),
    controls: root.locator(
      ':is(.calc-layout__primary, .calc-layout__rest) > .fields__grid > :is(.field, .segmented), .calc-layout__rest .disclosure__summary',
    ),
  };
}

test.describe('styleguide page', () => {
  test('loads, is noindex and ships no JavaScript', async ({ page }) => {
    const scripts: string[] = [];
    page.on('request', (request) => {
      if (request.resourceType() === 'script') scripts.push(request.url());
    });

    const response = await page.goto(PATH, { waitUntil: 'networkidle' });
    expect(response?.status()).toBe(200);

    await expect(page.getByRole('heading', { level: 1, name: 'Style guide' })).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await expect(page.locator('script')).toHaveCount(0);
    expect(scripts).toEqual([]);
  });

  test('labels the example as example figures', async ({ page }) => {
    await page.goto(PATH);
    const { root, numeral } = example(page);
    await expect(root.getByText('Example figures, not a real calculation')).toBeVisible();
    await expect(numeral).toHaveText('6');
    await expect(root.locator('.answer__sentence')).toHaveText(
      /Buying pulls ahead after\s*6\s*years/,
    );
  });

  test('shows every primitive', async ({ page }) => {
    await page.goto(PATH);
    for (const selector of [
      '.card',
      '.button--primary',
      '.button--secondary',
      '.field',
      '.field--invalid',
      '.field__affix--prefix',
      '.field__affix--suffix',
      '.field__hint',
      '.field__error',
      '.slider',
      '.segmented',
      '.tag--local',
      '.tag--typical',
      '.disclosure',
      '.key-number',
      '.answer__numeral',
      '.data-table',
      '.chart',
    ]) {
      expect(await page.locator(selector).count(), selector).toBeGreaterThan(0);
    }
    // Each primitive appears in a forced light panel and a forced dark panel.
    await expect(page.locator('.theme-panel--light .segmented')).not.toHaveCount(0);
    await expect(page.locator('.theme-panel--dark .segmented')).not.toHaveCount(0);
  });

  test('has no horizontal scroll in light or dark', async ({ page }) => {
    await page.goto(PATH);
    await expectNoHorizontalScroll(page);
    await page.emulateMedia({ colorScheme: 'dark' });
    await expectNoHorizontalScroll(page);
  });

  test('is not linked from the home page', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('a[href*="styleguide"]')).toHaveCount(0);
  });
});

test.describe('example calculator layout', () => {
  test('at 1280x800 the inputs and the answer numeral are in the first viewport', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1280', 'desktop layout only');
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(PATH);
    const ex = example(page);

    const viewportHeight = 800;
    const controls = await ex.controls.all();
    expect(controls.length).toBeGreaterThanOrEqual(9);
    for (const control of controls) {
      const b = await box(control);
      expect(b.y, 'control starts in view').toBeGreaterThanOrEqual(0);
      expect(b.y + b.h, 'control ends in view').toBeLessThanOrEqual(viewportHeight);
    }
    const numeral = await box(ex.numeral);
    expect(numeral.y + numeral.h).toBeLessThanOrEqual(viewportHeight);

    // Inputs on the left, answer on the right.
    const primary = await box(ex.primary);
    const answer = await box(ex.answer);
    expect(answer.x).toBeGreaterThan(primary.x + primary.w);
  });

  test('at 360px the answer card comes straight after the area and price fields', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-360', 'mobile layout only');
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto(PATH);
    const ex = example(page);

    const area = await box(ex.area);
    const price = await box(ex.price);
    const answer = await box(ex.answer);
    const rest = await box(ex.rest);

    // One column: area, then price, then the answer card, then the other inputs.
    expect(price.y).toBeGreaterThan(area.y);
    expect(answer.y).toBeGreaterThan(price.y + price.h);
    expect(rest.y).toBeGreaterThan(answer.y + answer.h);
    expect(Math.abs(answer.x - area.x)).toBeLessThan(40);

    // No other example input sits between the price field and the answer.
    for (const field of await ex.inputs.all()) {
      const b = await box(field);
      const between = b.y > price.y + price.h && b.y < answer.y;
      expect(between).toBe(false);
    }
  });
});
