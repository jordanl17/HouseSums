// @ts-check
/**
 * Contrast guard for the design tokens (WCAG 2.2 AA). Run by `npm test` through
 * scripts/check-contrast.test.ts, or directly:
 *
 *   node scripts/check-contrast.mjs
 *
 * 1. Every foreground/background token pair the site actually uses is measured in
 *    both themes, with values read from src/styles/tokens.css (never copied here):
 *    body text 4.5:1, the answer numeral (large text) and graphics 3:1, and the
 *    focus indicator 3:1 against what sits next to it (WCAG 2.4.13 / 1.4.11).
 * 2. Colours that fail as text are never used as a text colour anywhere in the CSS:
 *    rent (below 3:1 on light surfaces, so it is graphics only and always labelled
 *    directly) and hi-vis (about 1.2:1 on light concrete; it is a background with ink
 *    text, never text itself). Hi-vis text is banned in dark mode too, to keep one rule.
 *
 * Exits 1 listing every failure.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { isChecked } from './check-tokens.mjs';
import { readTokens, resolveToken } from './lib/read-tokens.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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

/** @typedef {'light' | 'dark'} Theme */
/** @typedef {{ r: number, g: number, b: number, a: number }} Rgba */
/**
 * @typedef {object} ContrastPair
 * @property {string} fg token name of the foreground (text, graphic or focus edge)
 * @property {string} bg token name of what it sits on or next to
 * @property {number} min minimum ratio: 4.5 body text, 3 large text, graphics and focus
 * @property {Theme[]} themes themes the pair is used in
 * @property {string} use where the pair appears, for the report
 */

/**
 * The pairs the site uses. Add a row whenever a new text/background combination ships.
 * @type {ContrastPair[]}
 */
export const CONTRAST_PAIRS = [
  // Text, 4.5:1 (WCAG 1.4.3).
  .../** @type {Theme[]} */ (['light', 'dark']).flatMap((theme) => [
    {
      fg: '--color-ink',
      bg: '--color-concrete',
      min: 4.5,
      themes: [theme],
      use: 'body text on the page',
    },
    {
      fg: '--color-ink',
      bg: '--color-surface',
      min: 4.5,
      themes: [theme],
      use: 'text in cards and inputs',
    },
    {
      fg: '--color-muted',
      bg: '--color-concrete',
      min: 4.5,
      themes: [theme],
      use: 'footer, hints on the page',
    },
    {
      fg: '--color-muted',
      bg: '--color-surface',
      min: 4.5,
      themes: [theme],
      use: 'hints and labels in cards',
    },
    {
      fg: '--color-on-hi-vis',
      bg: '--color-hi-vis',
      min: 4.5,
      themes: [theme],
      use: 'primary button, Local figure tag, skip link',
    },
    {
      fg: '--color-ink',
      bg: '--color-tag-alt',
      min: 4.5,
      themes: [theme],
      use: 'Typical figure tag',
    },
    // Large text and graphics, 3:1 (WCAG 1.4.3 large, 1.4.11).
    {
      fg: '--color-buy',
      bg: '--color-surface',
      min: 3,
      themes: [theme],
      use: 'answer numeral and buy line in the answer card',
    },
    {
      fg: '--color-buy',
      bg: '--color-concrete',
      min: 3,
      themes: [theme],
      use: 'answer numeral and buy line on the page',
    },
    {
      fg: '--color-focus-ring',
      bg: '--color-focus-edge',
      min: 3,
      themes: [theme],
      use: 'focus ring: hi-vis against its ink outline',
    },
  ]),
  // Focus indicator against the page, 3:1 (WCAG 2.4.13). Light: the ink outline carries it.
  {
    fg: '--color-focus-edge',
    bg: '--color-concrete',
    min: 3,
    themes: ['light'],
    use: 'focus outline on the page',
  },
  {
    fg: '--color-focus-edge',
    bg: '--color-surface',
    min: 3,
    themes: ['light'],
    use: 'focus outline in cards',
  },
  // Dark: the ink outline is near the dark concrete, so the hi-vis ring carries it.
  {
    fg: '--color-focus-ring',
    bg: '--color-concrete',
    min: 3,
    themes: ['dark'],
    use: 'focus ring on the page',
  },
  {
    fg: '--color-focus-ring',
    bg: '--color-surface',
    min: 3,
    themes: ['dark'],
    use: 'focus ring in cards',
  },
];

/**
 * Tokens that must never be a text colour. Rent fails on light surfaces; hi-vis fails on
 * light concrete; the others are translucent decoration.
 */
export const NEVER_TEXT = [
  '--color-rent',
  '--color-hi-vis',
  '--color-focus-ring',
  '--color-contour',
  '--color-buy-fill',
];

/**
 * Parse a hex or rgb() colour.
 * @param {string} value
 * @returns {Rgba}
 */
export function parseColour(value) {
  const v = value.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(v);
  if (hex) {
    let digits = hex[1] ?? '';
    if (digits.length <= 4) digits = [...digits].map((d) => d + d).join('');
    const n = (/** @type {number} */ i) => parseInt(digits.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: digits.length === 8 ? n(6) / 255 : 1 };
  }
  const fn = /^rgba?\(([^)]*)\)$/.exec(v);
  if (fn) {
    const parts = (fn[1] ?? '')
      .replace(/\//g, ' ')
      .split(/[\s,]+/)
      .filter(Boolean);
    if (parts.length === 3 || parts.length === 4) {
      const num = (/** @type {string} */ p, /** @type {number} */ scale) =>
        p.endsWith('%') ? (parseFloat(p) / 100) * scale : parseFloat(p);
      const [r, g, b, a = '1'] = parts;
      const out = {
        r: num(r ?? '', 255),
        g: num(g ?? '', 255),
        b: num(b ?? '', 255),
        a: num(a, 1),
      };
      if (Object.values(out).every(Number.isFinite)) return out;
    }
  }
  throw new Error(`check-contrast: cannot measure colour "${value}"`);
}

/**
 * Format as getComputedStyle does for an opaque colour: "rgb(28, 28, 27)".
 * @param {string} value
 */
export function toCssRgb(value) {
  const { r, g, b, a } = parseColour(value);
  return a === 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${a})`;
}

/**
 * Paint a possibly translucent colour over an opaque one.
 * @param {Rgba} fg
 * @param {Rgba} bg
 * @returns {Rgba}
 */
function over(fg, bg) {
  const mix = (/** @type {number} */ f, /** @type {number} */ b) => f * fg.a + b * (1 - fg.a);
  return { r: mix(fg.r, bg.r), g: mix(fg.g, bg.g), b: mix(fg.b, bg.b), a: 1 };
}

/**
 * WCAG relative luminance.
 * @param {Rgba} c
 */
function luminance(c) {
  const lin = (/** @type {number} */ channel) => {
    const s = channel / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
}

/**
 * WCAG contrast ratio between two colours. A translucent foreground is painted over the
 * background first; the background is treated as opaque.
 * @param {string} fg
 * @param {string} bg
 */
export function contrastRatio(fg, bg) {
  const back = { ...parseColour(bg), a: 1 };
  const front = over(parseColour(fg), back);
  const [hi, lo] = [luminance(front), luminance(back)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

/**
 * Measure every pair.
 * @param {{ light: Record<string, string>, dark: Record<string, string> }} tokens
 * @param {ContrastPair[]} [pairs]
 */
export function checkContrast(tokens, pairs = CONTRAST_PAIRS) {
  return pairs.flatMap((pair) =>
    pair.themes.map((theme) => {
      const fgValue = resolveToken(tokens[theme], pair.fg);
      const bgValue = resolveToken(tokens[theme], pair.bg);
      const ratio = contrastRatio(fgValue, bgValue);
      return { ...pair, theme, fgValue, bgValue, ratio, pass: ratio >= pair.min };
    }),
  );
}

/**
 * Replace each match with spaces of the same length, keeping offsets and newlines.
 * @param {string} text
 * @param {RegExp} pattern
 */
function blank(text, pattern) {
  return text.replace(pattern, (m) => m.replace(/[^\n]/g, ' '));
}

/**
 * Text-colour uses of NEVER_TEXT tokens in one CSS chunk. `color` and text-fill always count;
 * `fill` counts when the rule's selector is about text or labels (SVG text is painted by fill).
 * @param {string} css comment-free CSS
 * @param {number} base offset of `css` in the file
 * @param {(offset: number, token: string) => void} report
 */
function scanCss(css, base, report) {
  for (const rule of css.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    const selector = rule[1] ?? '';
    const body = rule[2] ?? '';
    const bodyStart = (rule.index ?? 0) + selector.length + 1;
    const textSelector = /text|label/i.test(selector);
    for (const decl of body.matchAll(/([\w-]+)\s*:\s*([^;]*)/g)) {
      const property = (decl[1] ?? '').toLowerCase();
      const isText =
        property === 'color' ||
        property === '-webkit-text-fill-color' ||
        (property === 'fill' && textSelector);
      if (!isText) continue;
      for (const token of NEVER_TEXT) {
        const at = (decl[2] ?? '').search(new RegExp(`var\\(\\s*${token}\\s*[,)]`));
        if (at >= 0)
          report(
            base + bodyStart + (decl.index ?? 0) + (decl[0].length - (decl[2] ?? '').length) + at,
            token,
          );
      }
    }
  }
}

/**
 * Find rent, hi-vis and other non-text tokens used as a text colour.
 * @param {string} source
 * @param {string} filename used for its extension
 * @returns {{ line: number, token: string }[]}
 */
export function findForbiddenTextColours(source, filename) {
  const ext = path.extname(filename).toLowerCase();
  let text = blank(source, /\/\*[\s\S]*?\*\//g);
  if (ext !== '.css') text = blank(text, /<!--[\s\S]*?-->/g);

  /** @type {{ line: number, token: string }[]} */
  const findings = [];
  const report = (/** @type {number} */ offset, /** @type {string} */ token) => {
    const line = source.slice(0, offset).split('\n').length;
    findings.push({ line, token });
  };

  if (ext === '.css') {
    scanCss(text, 0, report);
  } else {
    for (const m of text.matchAll(/(<style\b[^>]*>)([\s\S]*?)<\/style>/gi)) {
      scanCss(m[2] ?? '', (m.index ?? 0) + (m[1] ?? '').length, report);
    }
    for (const m of text.matchAll(/(?<![\w-])style\s*=\s*(["'])([\s\S]*?)\1/g)) {
      const start = (m.index ?? 0) + m[0].indexOf(m[2] ?? '');
      scanCss(`x{${m[2] ?? ''}}`, start - 2, report);
    }
  }
  return findings;
}

/**
 * @param {string} dir absolute
 * @returns {AsyncGenerator<string>} repo-relative paths
 */
async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* walk(path.join(dir, entry.name));
    } else if (entry.isFile()) {
      yield path.relative(ROOT, path.join(dir, entry.name)).split(path.sep).join('/');
    }
  }
}

/** Scan every file check-tokens scans, plus tokens.css itself. */
export async function scanRepoForForbiddenTextColours() {
  /** @type {{ file: string, line: number, token: string }[]} */
  const out = [];
  for await (const rel of walk(ROOT)) {
    if (!isChecked(rel) && rel !== 'src/styles/tokens.css') continue;
    const source = await readFile(path.join(ROOT, rel), 'utf8');
    for (const f of findForbiddenTextColours(source, rel)) out.push({ file: rel, ...f });
  }
  return out;
}

async function main() {
  const results = checkContrast(await readTokens());
  for (const r of results) {
    const mark = r.pass ? 'ok  ' : 'FAIL';
    console.log(
      `${mark} ${r.theme.padEnd(5)} ${r.ratio.toFixed(2).padStart(5)}:1 (min ${r.min})  ${r.fg} on ${r.bg}  ${r.use}`,
    );
  }
  const forbidden = await scanRepoForForbiddenTextColours();
  for (const f of forbidden) {
    console.error(`${f.file}:${f.line}  ${f.token} used as a text colour`);
  }
  const failed = results.filter((r) => !r.pass).length;
  if (failed > 0 || forbidden.length > 0) {
    console.error(
      `\ncheck-contrast: ${failed} pair(s) below minimum, ${forbidden.length} forbidden text colour(s).`,
    );
    process.exit(1);
  }
  console.log(
    `\ncheck-contrast: ${results.length} pairs pass; rent and hi-vis never used as text.`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
