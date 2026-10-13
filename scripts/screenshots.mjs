// @ts-check
/**
 * Slop-review screenshots (phase 6). Owner: the docs-acceptance teammate.
 *
 *   npm run screenshots -- --out <dir> [--url <site root>] [--only <name,name>]
 *
 * - Without --url it serves the built dist/ with `astro preview` (same BASE_PATH as the build;
 *   run `npm run build` first) on SCREENSHOTS_PORT (default 4340) and stops it afterwards. With
 *   --url it shoots a deployed copy, e.g. --url https://jordanl17.github.io/HouseSums/.
 * - Every entry of SHOTS at both widths (360 and 1280) in both themes (light and dark), full
 *   page, saved as `<out>/<name>-<width>-<theme>.png`, e.g. `home-empty-360-light.png`.
 *   --only limits the run to some SHOTS names (for a quick look at one page).
 * - Calculator pages wait for `data-hydrated="true"` and a settled status (`ready` when the page
 *   names an area, otherwise anything but `loading`) before the shot. Every page waits for its
 *   fonts. Animations are disabled and reduced motion is on, so shots are repeatable.
 * - Uses Playwright's Chromium (preinstalled locally at PLAYWRIGHT_BROWSERS_PATH; never run
 *   `playwright install` locally).
 *
 * The brief's slop check (docs/brief.md) is run by a person on these images: cover the logo,
 * check the 1280 first screen, look for anything that doesn't help get or understand the answer,
 * units and aligned columns, and whether it reads in black and white.
 */
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { ROOT, normaliseBase } from './lib/site.mjs';

/**
 * Page types for the slop review, relative to the site root. `area` is set when the page shows
 * an answer for a named area, so the shot waits for `ready`.
 * @type {readonly { name: string, path: string, area?: boolean }[]}
 */
export const SHOTS = [
  { name: 'home-empty', path: './' },
  { name: 'home-leeds', path: './?a=leeds', area: true },
  { name: 'area-leeds', path: 'rent-vs-buy/leeds/', area: true },
  { name: 'area-glasgow-city', path: 'rent-vs-buy/glasgow-city/', area: true },
  { name: 'area-cardiff', path: 'rent-vs-buy/cardiff/', area: true },
  { name: 'area-belfast', path: 'rent-vs-buy/belfast/', area: true },
  { name: 'area-westminster', path: 'rent-vs-buy/westminster/', area: true },
  { name: 'nation-scotland', path: 'rent-vs-buy/scotland/' },
  { name: 'how-it-works', path: 'how-it-works/' },
  { name: 'sources', path: 'sources/' },
  { name: 'about', path: 'about/' },
  { name: '404', path: 'this-page-does-not-exist/' },
];

export const WIDTHS = [360, 1280];
export const THEMES = /** @type {const} */ (['light', 'dark']);

/** Viewport height for each width: a phone and the brief's 1280x800 laptop. */
export const HEIGHTS = /** @type {Record<number, number>} */ ({ 360: 780, 1280: 800 });

const HOST = '127.0.0.1';

/**
 * @typedef {{ out: string, url: string | null, only: string[] | null }} Options
 */

/**
 * Read the command line. Throws on a missing --out, an unknown flag or an unknown --only name.
 * @param {string[]} argv
 * @param {string} [cwd]
 * @returns {Options}
 */
export function parseArgs(argv, cwd = process.cwd()) {
  /** @type {Options} */
  const options = { out: '', url: null, only: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? '';
    const next = () => {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--'))
        throw new Error(`Missing value for ${arg}`);
      i += 1;
      return value;
    };
    if (arg === '--out') options.out = path.resolve(cwd, next());
    else if (arg === '--url') options.url = next().replace(/\/?$/, '/');
    else if (arg === '--only') options.only = next().split(',').filter(Boolean);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (options.out === '') throw new Error('Give a folder for the images: --out <dir>');
  const names = new Set(SHOTS.map((shot) => shot.name));
  for (const name of options.only ?? []) {
    if (!names.has(name)) throw new Error(`Unknown shot: ${name}`);
  }
  return options;
}

/**
 * The file name of one shot: `<name>-<width>-<theme>.png`.
 * @param {string} name
 * @param {number} width
 * @param {string} theme
 */
export function shotFile(name, width, theme) {
  return `${name}-${width}-${theme}.png`;
}

/**
 * Every shot to take, in order: by width, then theme, then page.
 * @param {string[] | null} [only]
 * @returns {{ name: string, path: string, area: boolean, width: number, theme: 'light' | 'dark', file: string }[]}
 */
export function plan(only = null) {
  const shots = only ? SHOTS.filter((shot) => only.includes(shot.name)) : SHOTS;
  return WIDTHS.flatMap((width) =>
    THEMES.flatMap((theme) =>
      shots.map((shot) => ({
        name: shot.name,
        path: shot.path,
        area: shot.area === true,
        width,
        theme,
        file: shotFile(shot.name, width, theme),
      })),
    ),
  );
}

/**
 * Start `astro preview` on dist/ with the same BASE_PATH as the build and wait for the home page.
 * @returns {Promise<{ root: string, stop: () => void }>}
 */
async function startPreview() {
  const port = Number(process.env.SCREENSHOTS_PORT ?? 4340);
  const base = normaliseBase(process.env.BASE_PATH || '/HouseSums');
  const root = `http://${HOST}:${port}${base}`;
  // Node runs Astro's CLI directly (not through npx), so killing the child stops the server.
  // --ignore-lock keeps it in the foreground when Astro detects a coding agent.
  const astroCli = path.join(ROOT, 'node_modules', 'astro', 'bin', 'astro.mjs');
  const child = spawn(
    process.execPath,
    [astroCli, 'preview', '--port', String(port), '--host', HOST, '--ignore-lock'],
    {
      cwd: ROOT,
      stdio: ['ignore', 'ignore', 'inherit'],
      env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' },
    },
  );
  const deadline = Date.now() + 60_000;
  for (;;) {
    try {
      const response = await fetch(root);
      if (response.ok) break;
    } catch {
      // Not up yet.
    }
    if (Date.now() > deadline) {
      child.kill();
      throw new Error(`astro preview did not start at ${root}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return { root, stop: () => child.kill() };
}

/**
 * Wait until the page is ready to shoot: fonts loaded and, on calculator pages, hydrated and
 * settled.
 * @param {import('@playwright/test').Page} page
 * @param {boolean} area
 */
async function settle(page, area) {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const calculator = page.locator('[data-testid="calculator"]');
  if ((await calculator.count()) > 0) {
    await calculator.waitFor({ state: 'attached' });
    await page.waitForFunction(
      (needsAnswer) => {
        const el = document.querySelector('[data-testid="calculator"]');
        if (!el || el.getAttribute('data-hydrated') !== 'true') return false;
        const status = el.getAttribute('data-status');
        return needsAnswer ? status === 'ready' : status !== 'loading';
      },
      area,
      { timeout: 30_000 },
    );
  }
  // Two frames, so the last render is painted.
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
}

/** @param {Options} options */
async function main(options) {
  const { chromium } = await import('@playwright/test');
  await mkdir(options.out, { recursive: true });
  const preview = options.url ? null : await startPreview();
  const root = options.url ?? preview?.root ?? '';
  const browser = await chromium.launch();
  const shots = plan(options.only);
  /** @type {string[]} */
  const failures = [];
  try {
    for (const width of WIDTHS) {
      for (const theme of THEMES) {
        const context = await browser.newContext({
          viewport: { width, height: HEIGHTS[width] ?? 800 },
          colorScheme: theme,
          reducedMotion: 'reduce',
          deviceScaleFactor: 1,
        });
        const page = await context.newPage();
        for (const shot of shots.filter((s) => s.width === width && s.theme === theme)) {
          const target = new URL(shot.path, root).toString();
          try {
            await page.goto(target, { waitUntil: 'load' });
            await settle(page, shot.area);
            const file = path.join(options.out, shot.file);
            await page.screenshot({ path: file, fullPage: true, animations: 'disabled' });
            console.log(`${shot.file}  ${target}`);
          } catch (error) {
            failures.push(`${shot.file}: ${error instanceof Error ? error.message : error}`);
          }
        }
        await context.close();
      }
    }
  } finally {
    await browser.close();
    preview?.stop();
  }
  console.log(`\n${shots.length - failures.length} of ${shots.length} shots in ${options.out}`);
  if (failures.length > 0) {
    console.error(`Failed:\n${failures.join('\n')}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    console.error('Usage: npm run screenshots -- --out <dir> [--url <site root>] [--only a,b]');
    process.exit(2);
  }
  main(options).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
