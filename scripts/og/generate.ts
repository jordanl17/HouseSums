/**
 * Renders the Open Graph cards to public/og/{default,england,scotland,wales,northern-ireland}.png
 * (1200x630) with Playwright's Chromium, in the light theme. Run it after changing the cards,
 * the logo, the tokens or the tax names, and commit the PNGs:
 *
 *   npm run og
 *
 * Locally it uses the Chromium preinstalled at PLAYWRIGHT_BROWSERS_PATH; elsewhere run
 * `npx playwright install chromium` first. The words and the page are in scripts/og/card.ts.
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import { parseTaxRules } from '../../src/lib/schema';
import { OG_HEIGHT, OG_WIDTH, cardHtml, cards, logoShapes } from './card';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT_DIR = path.join(ROOT, 'public/og');

const STYLESHEETS = [
  'node_modules/@fontsource/b612/latin-400.css',
  'node_modules/@fontsource/b612/latin-700.css',
  'node_modules/@fontsource/b612-mono/latin-400.css',
  'src/styles/fonts.css',
  'src/styles/tokens.css',
  'src/styles/shell.css',
].map((rel) => pathToFileURL(path.join(ROOT, rel)).href);

async function main(): Promise<void> {
  const taxRules = parseTaxRules(
    JSON.parse(await readFile(path.join(ROOT, 'data/taxRules.json'), 'utf8')),
  );
  const logo = logoShapes(await readFile(path.join(ROOT, 'src/components/Logo.astro'), 'utf8'));
  const work = await mkdtemp(path.join(tmpdir(), 'og-'));
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: OG_WIDTH, height: OG_HEIGHT },
      deviceScaleFactor: 1,
      colorScheme: 'light',
    });
    for (const card of cards(taxRules)) {
      const htmlPath = path.join(work, `${card.name}.html`);
      await writeFile(htmlPath, cardHtml(card, STYLESHEETS, logo));
      await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      const families = await page.evaluate(() =>
        [...document.fonts].filter((face) => face.status === 'loaded').map((face) => face.family),
      );
      if (!families.some((family) => family.includes('B612'))) {
        throw new Error(`The B612 fonts did not load for ${card.name}`);
      }
      const out = path.join(OUT_DIR, `${card.name}.png`);
      await page.screenshot({ path: out, type: 'png', fullPage: false });
      console.log(`og: wrote ${path.relative(ROOT, out)}`);
    }
  } finally {
    await browser.close();
    await rm(work, { recursive: true, force: true });
  }
}

await main();
