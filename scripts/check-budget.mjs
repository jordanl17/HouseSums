// @ts-check
/**
 * JS budget check. Walks the built site and fails if the total size of the client
 * JavaScript files is over budget.
 *
 * Usage:
 *   node scripts/check-budget.mjs [--dir dist] [--max-bytes 102400]
 *
 * The budget can also be set with the JS_BUDGET_BYTES environment variable.
 * Sizes are raw bytes on disk (not gzipped), so the check is strict and predictable.
 * Exits 1 when the total is over budget or the build directory is missing.
 */
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const DEFAULT_DIR = 'dist';
const DEFAULT_MAX_BYTES = 100 * 1024;
const JS_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);

/**
 * @param {string[]} argv
 * @returns {{ dir: string, maxBytes: number }}
 */
function parseArgs(argv) {
  let dir = DEFAULT_DIR;
  let maxRaw = process.env.JS_BUDGET_BYTES;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? '';
    const [flag, inline] = arg.split('=', 2);
    const value = inline ?? argv[i + 1];
    if (flag === '--dir' || flag === '--max-bytes') {
      if (value === undefined || value === '') fail(`Missing value for ${flag}.`);
      if (inline === undefined) i += 1;
      if (flag === '--dir') dir = value;
      else maxRaw = value;
    } else {
      fail(`Unknown argument: ${arg}`);
    }
  }
  const maxBytes = maxRaw === undefined || maxRaw === '' ? DEFAULT_MAX_BYTES : Number(maxRaw);
  if (!Number.isInteger(maxBytes) || maxBytes <= 0) {
    fail(`the budget must be a whole number of bytes above 0, got "${maxRaw}".`);
  }
  return { dir, maxBytes };
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
 * Recursively lists JS files under a directory. Symlinks are not followed.
 * @param {string} dir
 * @returns {Promise<string[]>}
 */
async function findJsFiles(dir) {
  /** @type {string[]} */
  const found = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await findJsFiles(full)));
    } else if (entry.isFile() && JS_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      found.push(full);
    }
  }
  return found;
}

/** @param {number} bytes */
function kb(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

async function main() {
  const { dir: rawDir, maxBytes } = parseArgs(process.argv.slice(2));
  const dir = rawDir.replace(/\/+$/, '') || rawDir;
  const root = path.resolve(dir);

  const rootStat = await stat(root).catch(() => undefined);
  if (!rootStat?.isDirectory()) {
    fail(`${dir}/ not found. Run "npm run build" first.`);
  }

  const files = await findJsFiles(root);
  const rows = await Promise.all(
    files.map(async (file) => ({
      file: path.relative(root, file).split(path.sep).join('/'),
      bytes: (await stat(file)).size,
    })),
  );
  rows.sort((a, b) => b.bytes - a.bytes || a.file.localeCompare(b.file));
  const total = rows.reduce((sum, row) => sum + row.bytes, 0);

  console.log(`JS budget for ${dir}/ (raw bytes, not gzipped)`);
  if (rows.length === 0) {
    console.log('No client JS files found.');
  } else {
    const totalLabel = `Total (${rows.length} ${rows.length === 1 ? 'file' : 'files'})`;
    const nameWidth = Math.max(totalLabel.length, ...rows.map((row) => row.file.length));
    const bytesWidth = Math.max('Bytes'.length, String(total).length);
    const line = (
      /** @type {string} */ name,
      /** @type {string} */ bytes,
      /** @type {string} */ size,
    ) => `${name.padEnd(nameWidth)}  ${bytes.padStart(bytesWidth)}  ${size.padStart(9)}`;
    console.log(line('File', 'Bytes', 'Size'));
    console.log('-'.repeat(nameWidth + bytesWidth + 13));
    for (const row of rows) console.log(line(row.file, String(row.bytes), kb(row.bytes)));
    console.log('-'.repeat(nameWidth + bytesWidth + 13));
    console.log(line(totalLabel, String(total), kb(total)));
  }

  const percent = ((total / maxBytes) * 100).toFixed(1);
  if (total > maxBytes) {
    fail(
      `total client JS is ${total} bytes (${kb(total)}), over the budget of ${maxBytes} bytes (${kb(maxBytes)}) by ${total - maxBytes} bytes. The brief caps client JS at 100KB, so cut JS rather than raise the limit.`,
    );
  }
  console.log(
    `Within budget: ${total} of ${maxBytes} bytes (${kb(total)} of ${kb(maxBytes)}, ${percent}%).`,
  );
}

await main();
