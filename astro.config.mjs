// @ts-check
import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';

/**
 * Site and base path come from the environment so moving from GitHub Pages
 * to a custom domain is a config change, not a code change.
 *
 *   SITE_URL   default https://jordanl17.github.io
 *   BASE_PATH  default /HouseSums (set BASE_PATH=/ for a custom domain)
 *   ANALYZE    set to 1 (npm run analyze) to write a bundle report to stats/ (phase 6)
 *
 * The same defaults apply to dev, build and preview so local URLs match production.
 * Never hard-code the base path in pages; use url() from src/lib/url.ts.
 */
const site = process.env.SITE_URL || 'https://jordanl17.github.io';
const base = process.env.BASE_PATH || '/HouseSums';
const analyze = process.env.ANALYZE === '1';

/**
 * Bundle analysis (devDependency, loaded only when ANALYZE=1): rollup-plugin-visualizer writes
 * a treemap and raw module sizes for the client build, which scripts/analyze-bundle.mjs
 * summarises. Never part of a normal build.
 * @returns {Promise<import('vite').PluginOption[]>}
 */
async function analyzePlugins() {
  if (!analyze) return [];
  const { visualizer } = await import('rollup-plugin-visualizer');
  return [
    {
      ...visualizer({ filename: 'stats/client.html', template: 'treemap', gzipSize: true }),
      applyToEnvironment: (environment) => environment.name === 'client',
    },
    {
      ...visualizer({ filename: 'stats/client.json', template: 'raw-data', gzipSize: true }),
      applyToEnvironment: (environment) => environment.name === 'client',
    },
  ];
}

/**
 * Phase 6 (perf): @astrojs/preact's client renderer lazy-loads @preact/signals for islands given
 * signal props. We never pass any (the island's props are plain data), so that code never runs,
 * but the build still emitted it as a 7.8 KB chunk that counts towards the JS budget. In the
 * client build only, the import resolves to this stub instead, which fails loudly if a signal
 * prop is ever added. The server render does not use @preact/signals.
 * @returns {import('vite').Plugin}
 */
function noSignalProps() {
  const id = '\0house-sums:no-signals';
  return {
    name: 'house-sums:no-signal-props',
    enforce: 'pre',
    applyToEnvironment: (environment) => environment.name === 'client',
    resolveId(source) {
      return source === '@preact/signals' ? id : null;
    },
    load(loaded) {
      if (loaded !== id) return null;
      return "export function signal() { throw new Error('House Sums: signal props are not supported (astro.config.mjs).'); }";
    },
  };
}

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
  vite: {
    plugins: [noSignalProps(), ...(await analyzePlugins())],
    environments: {
      client: {
        build: {
          rolldownOptions: {
            output: {
              // Phase 6 (perf): Preact (core, hooks, JSX runtime) in a chunk of its own, so the
              // island's chunks hold only our code and scripts/check-budget.mjs can hold the
              // island to its own limit. Same bytes as before, just not mixed into the island.
              codeSplitting: {
                groups: [{ name: 'preact', test: /[\\/]node_modules[\\/]preact[\\/]/ }],
              },
            },
          },
        },
      },
    },
  },
});
