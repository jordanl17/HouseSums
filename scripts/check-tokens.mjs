// @ts-check
/**
 * Colour-literal guard. Colours live in src/styles/tokens.css and nowhere else;
 * every other file must use var(--color-...). Run as part of `npm run lint`.
 *
 * Usage:
 *   node scripts/check-tokens.mjs
 *
 * Scans every .css, .astro, .tsx and .jsx file in the repo, plus .ts/.js/.mjs under src/,
 * except src/styles/tokens.css and generated or vendored folders. Flags:
 *   - hex colours (#rgb, #rgba, #rrggbb, #rrggbbaa)
 *   - colour functions: rgb(), rgba(), hsl(), hsla(), hwb(), lab(), lch(), oklab(), oklch(), color()
 *   - named colours (red, white, black, ...) in CSS declarations, style attributes,
 *     SVG colour attributes (fill, stroke, stop-color, ...) and colour-ish style object keys.
 * Allowed: transparent, currentColor, inherit, initial, unset, none and CSS system colours
 * (Canvas, CanvasText, Highlight...) for forced-colours mode.
 *
 * Escape hatch: a line containing `check-tokens-ignore` is skipped. Use it only with a comment
 * saying why (for example a fragment link that happens to look like hex).
 * Exits 1 and lists file:line:column for every literal found.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOKENS_FILE = 'src/styles/tokens.css';
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  '.astro',
  '.git',
  'test-results',
  'playwright-report',
  'blob-report',
  'coverage',
  '.claude',
  'raw',
]);
const MARKUP_EXT = new Set(['.css', '.astro', '.tsx', '.jsx']);
const SRC_SCRIPT_EXT = new Set(['.ts', '.js', '.mjs', '.mts']);

/** CSS named colours (CSS Color 4), lower case. transparent and currentcolor are allowed. */
export const NAMED_COLOURS = new Set(
  (
    'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue ' +
    'blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk ' +
    'crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki ' +
    'darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen ' +
    'darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue ' +
    'dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite ' +
    'gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki ' +
    'lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan ' +
    'lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen ' +
    'lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen ' +
    'magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen ' +
    'mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream ' +
    'mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid ' +
    'palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum ' +
    'powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown ' +
    'seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen ' +
    'steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen'
  ).split(' '),
);

/** CSS properties whose values are names, not colours, so words like "tan" are fine there. */
const NON_COLOUR_PROPERTIES = new Set([
  'font-family',
  'font',
  'grid-template-areas',
  'grid-area',
  'grid-row',
  'grid-column',
  'content',
  'quotes',
  'animation-name',
  'animation',
  'transition-property',
  'transition',
  'counter-reset',
  'counter-increment',
  'will-change',
  'view-transition-name',
  'container-name',
  'container',
]);

/** SVG presentation attributes and HTML attributes that take a colour. */
const COLOUR_ATTRIBUTE =
  /(?<![\w-])(fill|stroke|color|stop-color|flood-color|lighting-color|bgcolor)\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\s*["'`]([^"'`]*)["'`]\s*\})/g;
/** Colour-ish keys in JS style objects: { color: 'red', backgroundColor: 'white' }. */
const STYLE_OBJECT_KEY =
  /(?<![\w-])([a-zA-Z]*(?:[cC]olor|[fF]ill|[sS]troke|[bB]ackground|[bB]order|[oO]utline|[sS]hadow)[a-zA-Z]*)\s*:\s*["'`]([^"'`]*)["'`]/g;
const HEX = /(?<![\w&#./-])#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![\w-])/gi;
const COLOUR_FUNCTION = /(?<![\w.-])(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\s*\(/gi;

/**
 * @typedef {{ line: number, column: number, match: string, kind: 'hex' | 'function' | 'named' }} Finding
 */

/**
 * Blank out a regex's matches with spaces, keeping offsets and newlines.
 * @param {string} text
 * @param {RegExp} pattern
 */
function blank(text, pattern) {
  return text.replace(pattern, (m) => m.replace(/[^\n]/g, ' '));
}

/**
 * Remove comments so commented-out examples and notes are not flagged.
 * @param {string} source
 * @param {string} ext
 */
function stripComments(source, ext) {
  let out = blank(source, /\/\*[\s\S]*?\*\//g);
  if (ext !== '.css') {
    out = blank(out, /<!--[\s\S]*?-->/g);
    // Line comments, but not the "//" in "https://".
    out = blank(out, /(?<![:"'`\w])\/\/[^\n]*/g);
  }
  return out;
}

/**
 * Named colours among the words of a CSS value.
 * @param {string} value
 * @returns {{ word: string, index: number }[]}
 */
function namedColoursIn(value) {
  /** @type {{ word: string, index: number }[]} */
  const found = [];
  for (const m of value.matchAll(/(?<![\w-])[a-zA-Z]+(?![\w(-])/g)) {
    if (NAMED_COLOURS.has(m[0].toLowerCase())) found.push({ word: m[0], index: m.index ?? 0 });
  }
  return found;
}

/**
 * Named colours in CSS declarations within `css`, reported at absolute offsets.
 * @param {string} css
 * @param {number} baseOffset
 * @param {(offset: number, match: string, kind: Finding['kind']) => void} report
 */
function scanCssDeclarations(css, baseOffset, report) {
  // A declaration ends with ';' or '}' (a selector such as "a:hover {" ends with '{' and is skipped).
  for (const m of css.matchAll(/([\w-]+)\s*:\s*([^;{}]*)(?=[;}]|$)/g)) {
    const property = (m[1] ?? '').toLowerCase();
    const value = m[2] ?? '';
    if (NON_COLOUR_PROPERTIES.has(property)) continue;
    const valueStart = (m.index ?? 0) + m[0].length - value.length;
    for (const { word, index } of namedColoursIn(value)) {
      report(baseOffset + valueStart + index, word, 'named');
    }
  }
}

/**
 * Find colour literals in one file's source.
 * @param {string} source
 * @param {string} filename used only for its extension
 * @returns {Finding[]}
 */
export function findColourLiterals(source, filename) {
  const ext = path.extname(filename).toLowerCase();
  const text = stripComments(source, ext);
  const lineStarts = [0];
  for (let i = 0; i < source.length; i += 1) if (source[i] === '\n') lineStarts.push(i + 1);
  const lines = source.split('\n');

  /** @type {Finding[]} */
  const findings = [];
  const seen = new Set();
  /** @type {(offset: number, match: string, kind: Finding['kind']) => void} */
  const report = (offset, match, kind) => {
    let line = 0;
    while (line + 1 < lineStarts.length && (lineStarts[line + 1] ?? Infinity) <= offset) line += 1;
    if ((lines[line] ?? '').includes('check-tokens-ignore')) return;
    const key = `${offset}:${match}`;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push({ line: line + 1, column: offset - (lineStarts[line] ?? 0) + 1, match, kind });
  };

  for (const m of text.matchAll(HEX)) {
    const before = text.slice(Math.max(0, (m.index ?? 0) - 12), m.index);
    // Fragment links and SVG references: href="#abc", url(#abc).
    if (/(?:href=["']?|url\(\s*["']?)$/i.test(before)) continue;
    report(m.index ?? 0, m[0], 'hex');
  }
  for (const m of text.matchAll(COLOUR_FUNCTION)) {
    report(m.index ?? 0, m[0].replace(/\s*\($/, '()'), 'function');
  }

  if (ext === '.css') {
    scanCssDeclarations(text, 0, report);
  } else {
    // <style> blocks in Astro/HTML.
    for (const m of text.matchAll(/(<style\b[^>]*>)([\s\S]*?)<\/style>/gi)) {
      scanCssDeclarations(m[2] ?? '', (m.index ?? 0) + (m[1] ?? '').length, report);
    }
    // style="..." attributes.
    for (const m of text.matchAll(/(?<![\w-])style\s*=\s*(["'])([\s\S]*?)\1/g)) {
      const start = (m.index ?? 0) + m[0].indexOf(m[2] ?? '');
      scanCssDeclarations(`${m[2] ?? ''};`, start, report);
    }
    // fill="red", stroke={'white'} ...
    for (const m of text.matchAll(COLOUR_ATTRIBUTE)) {
      const value = m[2] ?? m[3] ?? m[4] ?? '';
      const start = (m.index ?? 0) + m[0].lastIndexOf(value);
      for (const { word, index } of namedColoursIn(value)) report(start + index, word, 'named');
    }
    // { color: 'red' } in style objects.
    for (const m of text.matchAll(STYLE_OBJECT_KEY)) {
      const value = m[2] ?? '';
      const start = (m.index ?? 0) + m[0].lastIndexOf(value);
      for (const { word, index } of namedColoursIn(value)) report(start + index, word, 'named');
    }
  }

  return findings.sort((a, b) => a.line - b.line || a.column - b.column);
}

/**
 * Whether a repo-relative path is in scope for the check.
 * @param {string} relPath forward-slash path relative to the repo root
 */
export function isChecked(relPath) {
  if (relPath === TOKENS_FILE) return false;
  const ext = path.extname(relPath).toLowerCase();
  if (MARKUP_EXT.has(ext)) return true;
  return relPath.startsWith('src/') && SRC_SCRIPT_EXT.has(ext) && !relPath.endsWith('.d.ts');
}

/**
 * @param {string} dir absolute
 * @returns {AsyncGenerator<string>} repo-relative paths
 */
async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      yield* walk(path.join(dir, entry.name));
    } else if (entry.isFile()) {
      yield path.relative(ROOT, path.join(dir, entry.name)).split(path.sep).join('/');
    }
  }
}

async function main() {
  let files = 0;
  let total = 0;
  for await (const rel of walk(ROOT)) {
    if (!isChecked(rel)) continue;
    files += 1;
    const source = await readFile(path.join(ROOT, rel), 'utf8');
    for (const f of findColourLiterals(source, rel)) {
      total += 1;
      console.error(`${rel}:${f.line}:${f.column}  ${f.kind} colour literal "${f.match}"`);
    }
  }
  if (total > 0) {
    console.error(
      `\ncheck-tokens: ${total} colour literal(s) found. Use a token from ${TOKENS_FILE} instead.`,
    );
    process.exit(1);
  }
  console.log(`check-tokens: ${files} files clean (colours only in ${TOKENS_FILE}).`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
