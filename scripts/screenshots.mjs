// @ts-check
/**
 * Slop-review screenshots (phase 6). Owner: the docs-acceptance teammate, who implements this
 * file. Contract (do not change without telling the lead):
 *
 *   npm run screenshots -- --out <dir> [--url <site root>]
 *
 * - Without --url it serves the built dist/ with `astro preview` (same BASE_PATH as the build;
 *   run `npm run build` first) and stops it afterwards. With --url it shoots a deployed copy.
 * - Every entry of SHOTS at both widths (360 and 1280) in both themes (light and dark), full
 *   page, saved as `<out>/<name>-<width>-<theme>.png`, e.g. `home-empty-360-light.png`.
 * - Calculator pages wait for `data-hydrated="true"` and a settled status before the shot.
 * - Uses Playwright's Chromium (preinstalled locally at PLAYWRIGHT_BROWSERS_PATH; never run
 *   `playwright install` locally).
 */

/** Page types for the slop review, relative to the site root. */
export const SHOTS = [
  { name: 'home-empty', path: './' },
  { name: 'home-leeds', path: './?a=leeds' },
  { name: 'area-leeds', path: 'rent-vs-buy/leeds/' },
  { name: 'area-glasgow-city', path: 'rent-vs-buy/glasgow-city/' },
  { name: 'area-cardiff', path: 'rent-vs-buy/cardiff/' },
  { name: 'area-belfast', path: 'rent-vs-buy/belfast/' },
  { name: 'area-westminster', path: 'rent-vs-buy/westminster/' },
  { name: 'nation-scotland', path: 'rent-vs-buy/scotland/' },
  { name: 'how-it-works', path: 'how-it-works/' },
  { name: 'sources', path: 'sources/' },
  { name: 'about', path: 'about/' },
  { name: '404', path: 'this-page-does-not-exist/' },
];

export const WIDTHS = [360, 1280];
export const THEMES = ['light', 'dark'];

console.error('scripts/screenshots.mjs is a stub: the docs-acceptance teammate implements it.');
process.exit(1);
