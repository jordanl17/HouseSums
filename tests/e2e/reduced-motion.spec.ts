import { expect, test, type Page } from '@playwright/test';
import { calculator, expectStatus } from './calculator-helpers';
import { openDisclosure } from './axe-helpers';

/**
 * Reduced motion (phase 6, a11y-ux). The site moves nothing on its own: no CSS transitions or
 * animations, no smooth scrolling, and the chart and toggletips appear in place. With
 * `prefers-reduced-motion: reduce` that holds by rule (base.css turns transitions and animations
 * off), and without it the pages still run no animations, so nothing depends on the setting.
 */

/** Every element's transition and animation, and any running Web Animations. */
async function motion(page: Page) {
  return page.evaluate(() => {
    const moving: string[] = [];
    for (const el of Array.from(document.querySelectorAll('*'))) {
      for (const pseudo of [null, '::before', '::after']) {
        const style = getComputedStyle(el, pseudo);
        const durations = [style.transitionDuration, style.animationDuration]
          .join(',')
          .split(',')
          .map((value) => parseFloat(value) * (value.trim().endsWith('ms') ? 1 : 1000));
        const animated = style.animationName !== 'none' && style.animationName !== '';
        if (durations.some((ms) => ms > 1) || (animated && pseudo === null)) {
          moving.push(`${el.tagName.toLowerCase()}.${el.className}${pseudo ?? ''}`);
        }
      }
    }
    return {
      moving: moving.slice(0, 10),
      animations: document.getAnimations().length,
      smooth: getComputedStyle(document.documentElement).scrollBehavior === 'smooth',
    };
  });
}

/** Open everything that opens: the advanced panel, a tooltip, the chart inspector, the year table. */
async function exercise(page: Page): Promise<void> {
  await openDisclosure(page, 'advanced');
  await page.getByTestId('tag-price').click();
  const plot = page.getByRole('slider', { name: 'Year shown on the chart' });
  await plot.focus();
  await plot.press('ArrowRight');
  await openDisclosure(page, 'year-table');
}

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test(`no motion on the area page (prefers-reduced-motion: ${reducedMotion})`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    await page.goto('rent-vs-buy/leeds/');
    await expect(calculator(page)).toHaveAttribute('data-hydrated', 'true');
    await expectStatus(page, 'ready');
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(
      reducedMotion === 'reduce',
    );
    await exercise(page);
    const found = await motion(page);
    expect(found.moving).toEqual([]);
    expect(found.animations).toBe(0);
    expect(found.smooth).toBe(false);
  });
}

test('the reduced-motion rule turns off any transition a later style might add', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('about/');
  const duration = await page.evaluate(() => {
    const probe = document.createElement('div');
    probe.style.transition = 'opacity 2s';
    probe.style.animation = 'none 3s';
    document.body.append(probe);
    const style = getComputedStyle(probe);
    const result = [style.transitionDuration, style.animationDuration];
    probe.remove();
    return result;
  });
  for (const value of duration) expect(parseFloat(value)).toBeLessThan(0.001);
});
