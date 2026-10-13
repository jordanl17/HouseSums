// @ts-check
import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';

/**
 * Site and base path come from the environment so moving from GitHub Pages
 * to a custom domain is a config change, not a code change.
 *
 *   SITE_URL   default https://jordanl17.github.io
 *   BASE_PATH  default /HouseSums (set BASE_PATH=/ for a custom domain)
 *
 * The same defaults apply to dev, build and preview so local URLs match production.
 * Never hard-code the base path in pages; use url() from src/lib/url.ts.
 */
const site = process.env.SITE_URL || 'https://jordanl17.github.io';
const base = process.env.BASE_PATH || '/HouseSums';

export default defineConfig({
  site,
  base,
  output: 'static',
  // Pages build to folder/index.html, so canonical URLs end in a slash.
  // GitHub Pages redirects /foo to /foo/ anyway; 'always' keeps dev, preview and production consistent.
  trailingSlash: 'always',
  build: {
    format: 'directory',
  },
  integrations: [preact()],
});
