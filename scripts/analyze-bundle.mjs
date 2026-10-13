// @ts-check
/**
 * Bundle analysis (phase 6). Builds the site with ANALYZE=1 (astro.config.mjs then adds
 * rollup-plugin-visualizer to the client build) into a temporary folder, and prints what each
 * client chunk is made of, biggest module first.
 *
 * Usage:
 *   npm run analyze                 build, then print the table
 *   node scripts/analyze-bundle.mjs --no-build   print from the last stats/client.json
 *
 * Outputs (gitignored): stats/client.html (treemap, open in a browser) and stats/client.json
 * (raw module sizes). Sizes are rollup's rendered length per module before minification, plus
 * gzip; the minified size of each chunk on disk is what `npm run budget` counts.
 */
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { ROOT } from './lib/site.mjs';

const STATS = path.join(ROOT, 'stats', 'client.json');

if (!process.argv.includes('--no-build')) {
  const outDir = path.join(os.tmpdir(), `house-sums-analyze-${process.pid}`);
  const build = spawnSync('npx', ['astro', 'build', '--outDir', outDir], {
    cwd: ROOT,
    stdio: ['ignore', 'ignore', 'inherit'],
    env: { ...process.env, ANALYZE: '1', ASTRO_TELEMETRY_DISABLED: '1' },
  });
  if (build.status !== 0) {
    console.error('analyze: the build failed.');
    process.exit(build.status ?? 1);
  }
}

/**
 * @typedef {{ renderedLength: number, gzipLength: number }} Part
 * @typedef {{ id: string, moduleParts: Record<string, string> }} Meta
 * @type {{ nodeParts: Record<string, Part>, nodeMetas: Record<string, Meta> }}
 */
const stats = JSON.parse(await readFile(STATS, 'utf8'));

/** @type {Map<string, { id: string, rendered: number, gzip: number }[]>} */
const chunks = new Map();
for (const meta of Object.values(stats.nodeMetas)) {
  for (const [chunk, partId] of Object.entries(meta.moduleParts)) {
    const part = stats.nodeParts[partId];
    if (!part) continue;
    const list = chunks.get(chunk) ?? [];
    list.push({ id: meta.id, rendered: part.renderedLength, gzip: part.gzipLength });
    chunks.set(chunk, list);
  }
}

const name = (/** @type {string} */ id) =>
  id.startsWith(ROOT)
    ? path.relative(ROOT, id)
    : id.replace(/^.*node_modules\//, 'node_modules/').replace(/^\/(?=src\/)/, '');
const kb = (/** @type {number} */ n) => `${(n / 1024).toFixed(1)} KB`.padStart(9);

const ordered = [...chunks.entries()].sort(
  ([, a], [, b]) => b.reduce((s, m) => s + m.rendered, 0) - a.reduce((s, m) => s + m.rendered, 0),
);
for (const [chunk, modules] of ordered) {
  const rendered = modules.reduce((s, m) => s + m.rendered, 0);
  const gzip = modules.reduce((s, m) => s + m.gzip, 0);
  console.log(`\n${chunk}  rendered ${kb(rendered).trim()}, gzip ${kb(gzip).trim()}`);
  modules.sort((a, b) => b.rendered - a.rendered);
  for (const m of modules) {
    if (m.rendered === 0) continue;
    const share = ((m.rendered / rendered) * 100).toFixed(1).padStart(5);
    console.log(`${kb(m.rendered)} ${kb(m.gzip)} ${share}%  ${name(m.id)}`);
  }
}
console.log(
  '\nTreemap: stats/client.html. Minified sizes on disk: npm run build && npm run budget.',
);
