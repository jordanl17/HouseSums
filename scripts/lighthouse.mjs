// @ts-check
/**
 * Lighthouse runner (phase 6). Runs Lighthouse against the built site, served by `astro preview`
 * on the dist/ folder, or against any deployed copy with --url, for each page and form factor,
 * several times, and reports the median run.
 *
 * Usage:
 *   npm run lighthouse                       preview dist/, 3 runs, mobile and desktop, assert
 *   node scripts/lighthouse.mjs --runs 1 --no-assert
 *   node scripts/lighthouse.mjs --url https://jordanl17.github.io/HouseSums/ --report-only
 *
 * Options:
 *   --url <site root>     test a deployed site instead of starting astro preview
 *   --paths a,b           pages relative to the site root (default: PATHS below)
 *   --forms mobile,desktop
 *   --runs N              runs per page and form factor (default 3); the median run is reported
 *   --out <dir>           where to write summary.json, summary.md and the median runs' reports
 *                         (default lighthouse/, gitignored)
 *   --no-assert           print and write the results but never fail on them
 *   --report-only         the same as --no-assert (for the deploy workflow's live job)
 *
 * Chrome: CHROME_PATH if set, else Playwright's Chromium (preinstalled locally at
 * PLAYWRIGHT_BROWSERS_PATH; CI installs it for the e2e tests before this runs).
 *
 * Owner from phase 6: the perf teammate. THRESHOLDS is the contract CI asserts; change it only
 * with a reason recorded in docs/decisions.md ("Lighthouse in CI").
 */
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import * as chromeLauncher from 'chrome-launcher';
import lighthouse from 'lighthouse';
import desktopConfig from 'lighthouse/core/config/desktop-config.js';
import { computeMedianRun } from 'lighthouse/core/lib/median-run.js';
import { ROOT, normaliseBase } from './lib/site.mjs';

/** Pages measured by default: the home page and one area page (brief, acceptance criteria). */
export const PATHS = ['./', 'rent-vs-buy/leeds/'];
export const FORMS = /** @type {const} */ (['mobile', 'desktop']);
export const CATEGORIES = /** @type {const} */ ([
  'performance',
  'accessibility',
  'best-practices',
  'seo',
]);

/**
 * What CI asserts on the median run of each page and form factor. Scores are 0-1.
 * Metrics are in ms except CLS. The perf teammate owns these values.
 */
export const THRESHOLDS = {
  scores: { performance: 0.95, accessibility: 0.95, 'best-practices': 0.95, seo: 0.95 },
  metrics: {
    mobile: {
      'largest-contentful-paint': 2500,
      'total-blocking-time': 200,
      'cumulative-layout-shift': 0.1,
    },
    desktop: {
      'largest-contentful-paint': 1200,
      'total-blocking-time': 100,
      'cumulative-layout-shift': 0.1,
    },
  },
};

const METRICS = [
  'first-contentful-paint',
  'largest-contentful-paint',
  'total-blocking-time',
  'cumulative-layout-shift',
  'speed-index',
];

const PREVIEW_PORT = Number(process.env.LIGHTHOUSE_PORT ?? 4330);
const HOST = '127.0.0.1';

/** @param {string[]} argv */
function parseArgs(argv) {
  /** @type {{ url: string | null, paths: string[], forms: string[], runs: number, out: string, assert: boolean }} */
  const options = {
    url: null,
    paths: [...PATHS],
    forms: [...FORMS],
    runs: 3,
    out: path.join(ROOT, 'lighthouse'),
    assert: true,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? '';
    const next = () => {
      const value = argv[i + 1];
      if (value === undefined) throw new Error(`Missing value for ${arg}`);
      i += 1;
      return value;
    };
    if (arg === '--url') options.url = next().replace(/\/?$/, '/');
    else if (arg === '--paths') options.paths = next().split(',').filter(Boolean);
    else if (arg === '--forms') options.forms = next().split(',').filter(Boolean);
    else if (arg === '--runs') options.runs = Number(next());
    else if (arg === '--out') options.out = path.resolve(next());
    else if (arg === '--no-assert' || arg === '--report-only') options.assert = false;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  for (const form of options.forms) {
    if (!FORMS.includes(/** @type {any} */ (form))) throw new Error(`Unknown form factor: ${form}`);
  }
  if (!Number.isInteger(options.runs) || options.runs < 1)
    throw new Error('--runs must be 1 or more');
  return options;
}

async function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const { chromium } = await import('@playwright/test');
  return chromium.executablePath();
}

/**
 * Start `astro preview` on dist/ with the same BASE_PATH as the build, and wait until it serves
 * the home page. Returns the site root URL and a stop function.
 */
async function startPreview() {
  const base = normaliseBase(process.env.BASE_PATH || '/HouseSums');
  const root = `http://${HOST}:${PREVIEW_PORT}${base}`;
  // Node runs Astro's CLI directly (not through npx), so killing the child stops the server.
  const astroCli = path.join(ROOT, 'node_modules', 'astro', 'bin', 'astro.mjs');
  const child = spawn(
    process.execPath,
    [astroCli, 'preview', '--port', String(PREVIEW_PORT), '--host', HOST, '--ignore-lock'],
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
 * @param {import('lighthouse').RunnerResult['lhr']} lhr
 */
function summarise(lhr) {
  /** @type {Record<string, number | null>} */
  const scores = {};
  for (const id of CATEGORIES) scores[id] = lhr.categories[id]?.score ?? null;
  /** @type {Record<string, number | null>} */
  const metrics = {};
  for (const id of METRICS) metrics[id] = lhr.audits[id]?.numericValue ?? null;
  const opportunities = Object.values(lhr.audits)
    .filter(
      (audit) =>
        audit.details?.type === 'opportunity' &&
        audit.score !== null &&
        audit.score < 1 &&
        (audit.numericValue ?? 0) > 0,
    )
    .map((audit) => ({
      id: audit.id,
      title: audit.title,
      savingsMs: Math.round(audit.numericValue ?? 0),
      display: audit.displayValue ?? '',
    }))
    .sort((a, b) => b.savingsMs - a.savingsMs);
  const failing = Object.values(lhr.audits)
    .filter(
      (audit) =>
        audit.score !== null &&
        audit.score < 0.9 &&
        audit.scoreDisplayMode !== 'informative' &&
        audit.scoreDisplayMode !== 'manual' &&
        audit.scoreDisplayMode !== 'notApplicable',
    )
    .map((audit) => ({
      id: audit.id,
      title: audit.title,
      score: audit.score,
      display: audit.displayValue ?? '',
    }));
  return { scores, metrics, opportunities, failing };
}

/** @param {number[]} values */
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? /** @type {number} */ (sorted[mid])
    : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const preview = options.url ? null : await startPreview();
  const root = options.url ?? preview?.root ?? '';
  const chrome = await chromeLauncher.launch({
    chromePath: await chromePath(),
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });
  /**
   * @type {(ReturnType<typeof summarise> & { path: string, url: string, form: string, runs: number,
   *   medianScores: Record<string, number | null> })[]}
   */
  const results = [];
  try {
    await mkdir(options.out, { recursive: true });
    for (const pagePath of options.paths) {
      const url = new URL(pagePath, root).href;
      for (const form of options.forms) {
        /** @type {any[]} */
        const runs = [];
        for (let run = 0; run < options.runs; run += 1) {
          const result = await lighthouse(
            url,
            { port: chrome.port, output: 'html', logLevel: 'error' },
            form === 'desktop' ? desktopConfig : undefined,
          );
          if (!result) throw new Error(`Lighthouse returned nothing for ${url}`);
          runs.push(result);
          const score = result.lhr.categories['performance']?.score;
          console.log(
            `${form.padEnd(7)} ${url} run ${run + 1}: performance ${Math.round((score ?? 0) * 100)}`,
          );
        }
        const medianLhr = computeMedianRun(runs.map((r) => r.lhr));
        const medianRun = runs.find((r) => r.lhr === medianLhr) ?? runs[0];
        const summary = summarise(medianLhr);
        /** @type {Record<string, number | null>} */
        const medianScores = {};
        for (const id of CATEGORIES) {
          const values = runs
            .map((r) => r.lhr.categories[id]?.score)
            .filter((v) => typeof v === 'number');
          medianScores[id] = values.length ? median(values) : null;
        }
        const slug = `${pagePath === './' ? 'home' : pagePath.replace(/\/$/, '').replace(/\//g, '-')}-${form}`;
        const report = Array.isArray(medianRun.report) ? medianRun.report[0] : medianRun.report;
        await writeFile(path.join(options.out, `${slug}.html`), report ?? '');
        results.push({ path: pagePath, url, form, runs: options.runs, medianScores, ...summary });
      }
    }
  } finally {
    chrome.kill();
    preview?.stop();
  }

  const problems = [];
  for (const result of results) {
    for (const [id, min] of Object.entries(THRESHOLDS.scores)) {
      const score = result.medianScores[id];
      if (score === null || score === undefined || score < min)
        problems.push(
          `${result.form} ${result.path}: ${id} ${Math.round((score ?? 0) * 100)} < ${min * 100}`,
        );
    }
    const limits = THRESHOLDS.metrics[/** @type {'mobile' | 'desktop'} */ (result.form)];
    for (const [id, max] of Object.entries(limits)) {
      const value = result.metrics[id];
      if (value === null || value === undefined || value > max)
        problems.push(`${result.form} ${result.path}: ${id} ${value} > ${max}`);
    }
  }

  const pct = (/** @type {number | null | undefined} */ v) =>
    v === null || v === undefined ? 'n/a' : String(Math.round(v * 100));
  const lines = [
    `Lighthouse ${results[0] ? '' : '(no results) '}against ${root}, median of ${options.runs} run(s)`,
    '',
    '| Page | Form | Performance | Accessibility | Best practices | SEO | LCP ms | TBT ms | CLS |',
    '|---|---|---|---|---|---|---|---|---|',
    ...results.map(
      (r) =>
        `| ${r.path} | ${r.form} | ${pct(r.medianScores.performance)} | ${pct(r.medianScores.accessibility)} | ${pct(r.medianScores['best-practices'])} | ${pct(r.medianScores.seo)} | ${Math.round(r.metrics['largest-contentful-paint'] ?? 0)} | ${Math.round(r.metrics['total-blocking-time'] ?? 0)} | ${(r.metrics['cumulative-layout-shift'] ?? 0).toFixed(3)} |`,
    ),
    '',
    ...results.flatMap((r) => [
      `${r.form} ${r.path} opportunities: ${r.opportunities.map((o) => `${o.title} (${o.savingsMs} ms)`).join('; ') || 'none'}`,
      `${r.form} ${r.path} audits under 0.9: ${r.failing.map((f) => `${f.id} (${f.display || f.score})`).join('; ') || 'none'}`,
    ]),
  ];
  const markdown = lines.join('\n');
  await writeFile(
    path.join(options.out, 'summary.json'),
    `${JSON.stringify({ root, runs: options.runs, results, problems }, null, 2)}\n`,
  );
  await writeFile(path.join(options.out, 'summary.md'), `${markdown}\n`);
  console.log(`\n${markdown}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    await writeFile(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`, { flag: 'a' });
  }
  if (problems.length > 0) {
    console.log(
      `\n${options.assert ? 'Failed' : 'Report only, not failing'}:\n${problems.map((p) => `  ${p}`).join('\n')}`,
    );
    if (options.assert) process.exit(1);
  } else {
    console.log('\nAll Lighthouse thresholds met.');
  }
}

await main();
