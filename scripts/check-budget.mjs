// @ts-check
/**
 * JS budget check. Walks the built site and fails if the total size of the client JavaScript
 * files is over budget, or if any island needs more of our own code before it can hydrate than
 * the island limit allows.
 *
 * Usage:
 *   node scripts/check-budget.mjs [--dir dist] [--max-bytes 102400] [--max-island-bytes 46080]
 *
 * The budgets can also be set with the JS_BUDGET_BYTES and ISLAND_BUDGET_BYTES environment
 * variables. Sizes are raw bytes on disk (not gzipped), so the check is strict and predictable.
 * Exits 1 when a budget is exceeded or the build directory is missing.
 *
 * The island (phase 6, perf): for each <astro-island component-url="..."> in the built pages,
 * the component's chunk plus every chunk it imports statically, which is everything the browser
 * must download and run before the island hydrates. Framework chunks are left out and listed
 * apart: Preact (its own `preact` chunk, astro.config.mjs) and Vite's preload helper; Astro's
 * renderer is a separate script (renderer-url), never imported by the island. Chunks the island
 * loads later with import() (its deferred chunk, the area list's validator) are listed as
 * deferred: they count towards the total but not the island limit.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { normaliseBase } from './lib/site.mjs';

const DEFAULT_DIR = 'dist';
const DEFAULT_MAX_BYTES = 100 * 1024;
/** The brief's island aim is 40KB; the limit CI enforces is 45KB (phase 6). */
export const DEFAULT_MAX_ISLAND_BYTES = 45 * 1024;
const JS_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);
/** Chunks that are framework, not island code: Preact and Vite's dynamic-import helper. */
export const FRAMEWORK_CHUNK = /^(?:preact|preload-helper)\.[\w-]+\.js$/;

/**
 * @param {string[]} argv
 * @returns {{ dir: string, maxBytes: number, maxIslandBytes: number }}
 */
function parseArgs(argv) {
  let dir = DEFAULT_DIR;
  let maxRaw = process.env.JS_BUDGET_BYTES;
  let islandRaw = process.env.ISLAND_BUDGET_BYTES;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? '';
    const [flag, inline] = arg.split('=', 2);
    const value = inline ?? argv[i + 1];
    if (flag === '--dir' || flag === '--max-bytes' || flag === '--max-island-bytes') {
      if (value === undefined || value === '') fail(`Missing value for ${flag}.`);
      if (inline === undefined) i += 1;
      if (flag === '--dir') dir = value;
      else if (flag === '--max-bytes') maxRaw = value;
      else islandRaw = value;
    } else {
      fail(`Unknown argument: ${arg}`);
    }
  }
  return {
    dir,
    maxBytes: wholeBytes(maxRaw, DEFAULT_MAX_BYTES, 'the budget'),
    maxIslandBytes: wholeBytes(islandRaw, DEFAULT_MAX_ISLAND_BYTES, 'the island budget'),
  };
}

/**
 * @param {string | undefined} raw
 * @param {number} fallback
 * @param {string} what
 */
function wholeBytes(raw, fallback, what) {
  const bytes = raw === undefined || raw === '' ? fallback : Number(raw);
  if (!Number.isInteger(bytes) || bytes <= 0) {
    fail(`${what} must be a whole number of bytes above 0, got "${raw}".`);
  }
  return bytes;
}

/**
 * @param {string} message
 * @returns {never}
 */
function fail(message) {
  console.error(`JS budget: ${message}`);
  process.exit(1);
}

/**
 * Recursively lists files with one of the extensions under a directory. Symlinks are not
 * followed.
 * @param {string} dir
 * @param {Set<string>} extensions
 * @returns {Promise<string[]>}
 */
async function findFiles(dir, extensions) {
  /** @type {string[]} */
  const found = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await findFiles(full, extensions)));
    } else if (entry.isFile() && extensions.has(path.extname(entry.name).toLowerCase())) {
      found.push(full);
    }
  }
  return found;
}

/** @param {number} bytes */
function kb(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

/**
 * Relative chunks a built ES module imports statically (import ... from, export ... from, bare
 * import). Dynamic import() is not included.
 * @param {string} code
 * @returns {string[]}
 */
export function staticImports(code) {
  const found = new Set();
  for (const match of code.matchAll(
    /(?:^|[;}\s])(?:import|export)\s*(?:[^'"`();]*?\bfrom\s*)?["'](\.{1,2}\/[^"']+?\.m?js)["']/g,
  )) {
    if (match[1]) found.add(match[1]);
  }
  return [...found];
}

/**
 * Relative chunks a built ES module loads with import().
 * @param {string} code
 * @returns {string[]}
 */
export function dynamicImports(code) {
  const found = new Set();
  for (const match of code.matchAll(/\bimport\(\s*["'`](\.{1,2}\/[^"'`]+?\.m?js)["'`]\s*\)/g)) {
    if (match[1]) found.add(match[1]);
  }
  return [...found];
}

/**
 * What an island needs before it hydrates, and what it loads later.
 * @param {string} entry chunk path relative to the site root, e.g. "_astro/CalculatorIsland.x.js"
 * @param {(file: string) => string | undefined} read the code of a chunk, by the same kind of path
 * @returns {{ island: string[], framework: string[], deferred: string[] }}
 */
export function islandChunks(entry, read) {
  /** @type {Set<string>} */
  const island = new Set();
  /** @type {Set<string>} */
  const framework = new Set();
  /** @type {Set<string>} */
  const dynamic = new Set();
  const visit = (/** @type {string} */ file) => {
    if (island.has(file) || framework.has(file)) return;
    if (FRAMEWORK_CHUNK.test(path.posix.basename(file))) {
      framework.add(file);
      return;
    }
    island.add(file);
    const code = read(file) ?? '';
    const dir = path.posix.dirname(file);
    for (const spec of staticImports(code)) visit(path.posix.join(dir, spec));
    for (const spec of dynamicImports(code)) dynamic.add(path.posix.join(dir, spec));
  };
  visit(entry);
  // Deferred: loaded with import() and not already part of the island, plus their own imports.
  /** @type {Set<string>} */
  const deferred = new Set();
  const visitDeferred = (/** @type {string} */ file) => {
    if (island.has(file) || framework.has(file) || deferred.has(file)) return;
    if (FRAMEWORK_CHUNK.test(path.posix.basename(file))) return;
    deferred.add(file);
    const code = read(file) ?? '';
    const dir = path.posix.dirname(file);
    for (const spec of [...staticImports(code), ...dynamicImports(code)]) {
      visitDeferred(path.posix.join(dir, spec));
    }
  };
  for (const file of dynamic) visitDeferred(file);
  return { island: [...island], framework: [...framework], deferred: [...deferred] };
}

/**
 * The island component chunks named by <astro-island component-url> in the built HTML, as paths
 * relative to the site root.
 * @param {string} html
 * @param {string} base the base path, e.g. "/HouseSums/"
 * @returns {string[]}
 */
export function islandEntries(html, base) {
  const found = new Set();
  for (const match of html.matchAll(/<astro-island\b[^>]*\bcomponent-url="([^"]+)"/g)) {
    const url = match[1] ?? '';
    const rel = url.startsWith(base) ? url.slice(base.length) : url.replace(/^\//, '');
    found.add(rel);
  }
  return [...found];
}

async function main() {
  const { dir: rawDir, maxBytes, maxIslandBytes } = parseArgs(process.argv.slice(2));
  const dir = rawDir.replace(/\/+$/, '') || rawDir;
  const root = path.resolve(dir);

  const rootStat = await stat(root).catch(() => undefined);
  if (!rootStat?.isDirectory()) {
    fail(`${dir}/ not found. Run "npm run build" first.`);
  }

  const files = await findFiles(root, JS_EXTENSIONS);
  const rows = await Promise.all(
    files.map(async (file) => ({
      file: path.relative(root, file).split(path.sep).join('/'),
      bytes: (await stat(file)).size,
    })),
  );
  rows.sort((a, b) => b.bytes - a.bytes || a.file.localeCompare(b.file));
  const total = rows.reduce((sum, row) => sum + row.bytes, 0);
  const sizes = new Map(rows.map((row) => [row.file, row.bytes]));

  console.log(`JS budget for ${dir}/ (raw bytes, not gzipped)`);
  const nameWidth = Math.max(36, ...rows.map((row) => row.file.length));
  const bytesWidth = Math.max('Bytes'.length, String(total).length);
  const line = (
    /** @type {string} */ name,
    /** @type {string} */ bytes,
    /** @type {string} */ size,
  ) => `${name.padEnd(nameWidth)}  ${bytes.padStart(bytesWidth)}  ${size.padStart(9)}`;
  const rule = '-'.repeat(nameWidth + bytesWidth + 13);
  if (rows.length === 0) {
    console.log('No client JS files found.');
  } else {
    const totalLabel = `Total (${rows.length} ${rows.length === 1 ? 'file' : 'files'})`;
    console.log(line('File', 'Bytes', 'Size'));
    console.log(rule);
    for (const row of rows) console.log(line(row.file, String(row.bytes), kb(row.bytes)));
    console.log(rule);
    console.log(line(totalLabel, String(total), kb(total)));
  }

  // ---- Islands ----
  /** @type {string[]} */
  const problems = [];
  const htmlFiles = await findFiles(root, new Set(['.html']));
  // The same default as astro.config.mjs; component-url carries the base path.
  const base = normaliseBase(process.env.BASE_PATH || '/HouseSums');
  /** @type {Set<string>} */
  const entries = new Set();
  for (const file of htmlFiles) {
    for (const entry of islandEntries(await readFile(file, 'utf8'), base)) entries.add(entry);
  }
  /** @type {Map<string, string>} */
  const code = new Map();
  for (const file of files) {
    code.set(path.relative(root, file).split(path.sep).join('/'), await readFile(file, 'utf8'));
  }
  for (const entry of [...entries].sort()) {
    if (!code.has(entry)) {
      problems.push(`the island ${entry} named in the HTML is not in ${dir}/.`);
      continue;
    }
    const { island, framework, deferred } = islandChunks(entry, (file) => code.get(file));
    const sum = (/** @type {string[]} */ list) =>
      list.reduce((acc, file) => acc + (sizes.get(file) ?? 0), 0);
    const islandBytes = sum(island);
    console.log(`\nIsland ${entry}: code needed before it hydrates`);
    for (const file of island) console.log(line(`  ${file}`, String(sizes.get(file) ?? 0), ''));
    console.log(line('  Island', String(islandBytes), kb(islandBytes)));
    console.log(
      `  Framework, not counted: ${framework.map((f) => `${f} (${kb(sizes.get(f) ?? 0)})`).join(', ') || 'none'}`,
    );
    console.log(
      `  Deferred, loaded with import(): ${deferred.map((f) => `${f} (${kb(sizes.get(f) ?? 0)})`).join(', ') || 'none'}`,
    );
    if (islandBytes > maxIslandBytes) {
      problems.push(
        `the island ${entry} needs ${islandBytes} bytes (${kb(islandBytes)}) of its own code before it hydrates, over the island limit of ${maxIslandBytes} bytes (${kb(maxIslandBytes)}). Defer what the first render does not need (src/components/calculator/later.ts) rather than raise the limit.`,
      );
    } else {
      console.log(
        `  Within the island limit: ${islandBytes} of ${maxIslandBytes} bytes (${((islandBytes / maxIslandBytes) * 100).toFixed(1)}%).`,
      );
    }
  }

  const percent = ((total / maxBytes) * 100).toFixed(1);
  if (total > maxBytes) {
    problems.push(
      `total client JS is ${total} bytes (${kb(total)}), over the budget of ${maxBytes} bytes (${kb(maxBytes)}) by ${total - maxBytes} bytes. The brief caps client JS at 100KB, so cut JS rather than raise the limit.`,
    );
  }
  if (problems.length > 0) fail(problems.join('\n'));
  console.log(
    `\nWithin budget: ${total} of ${maxBytes} bytes (${kb(total)} of ${kb(maxBytes)}, ${percent}%).`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
