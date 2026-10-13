import { expect, test } from '@playwright/test';

/**
 * Font preloads (polish). Every font file a page preloads must be one the page uses, read from
 * document.fonts once the page has settled: a preload nobody uses is a wasted download that
 * competes with the stylesheet. B612 Mono 700 (bold figures) is preloaded only where the first
 * screen shows it (the answer numeral on area pages, the refresh date on Sources), and the
 * pages must not shift as the fonts arrive (CLS 0, from the browser's own layout-shift entries).
 */

const PAGES = [
  { path: './', boldFigures: false },
  { path: 'rent-vs-buy/leeds/', boldFigures: true },
  { path: 'about/', boldFigures: false },
  { path: 'sources/', boldFigures: true },
  { path: 'rent-vs-buy/scotland/', boldFigures: false },
] as const;

/** The woff2 file a loaded FontFace comes from (see src/styles/fonts.css). */
function fileOf(family: string, weight: string): string {
  const name = family.replace(/^["']|["']$/g, '');
  // 'B612 Mono Punctuation' borrows B612's own files for the comma and full stop.
  const file = name === 'B612 Mono' ? 'b612-mono-latin' : 'b612-latin';
  return `${file}-${weight}-normal`;
}

for (const { path, boldFigures } of PAGES) {
  test(`${path} preloads only fonts it uses, and does not shift`, async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __cls: number }).__cls = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as (PerformanceEntry & {
          value: number;
          hadRecentInput: boolean;
        })[]) {
          if (!entry.hadRecentInput) (window as unknown as { __cls: number }).__cls += entry.value;
        }
      }).observe({ type: 'layout-shift', buffered: true });
    });
    await page.goto(path);
    const island = page.getByTestId('calculator');
    if ((await island.count()) > 0) await expect(island).toHaveAttribute('data-hydrated', 'true');
    await page.evaluate(() => document.fonts.ready);

    const preloaded = await page
      .locator('link[rel="preload"][as="font"]')
      .evaluateAll((links) => links.map((link) => (link as HTMLLinkElement).href));
    const used = await page.evaluate(() =>
      [...document.fonts]
        .filter((face) => face.status === 'loaded')
        .map((face) => ({ family: face.family, weight: face.weight })),
    );
    const usedFiles = new Set(used.map((face) => fileOf(face.family, face.weight)));

    expect(preloaded.length).toBe(boldFigures ? 4 : 3);
    expect(preloaded.some((href) => href.includes('b612-mono-latin-700'))).toBe(boldFigures);
    for (const href of preloaded) {
      const file = /(b612(?:-mono)?-latin-\d+-normal)/.exec(href)?.[1] ?? href;
      expect(usedFiles, `${href} is preloaded but unused`).toContain(file);
    }

    // Two frames after the fonts settle, nothing has moved.
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    expect(await page.evaluate(() => (window as unknown as { __cls: number }).__cls)).toBe(0);
  });
}
