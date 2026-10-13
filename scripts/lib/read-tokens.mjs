// @ts-check
/**
 * Reads the design tokens from src/styles/tokens.css so scripts and tests can
 * use the real values instead of copies (check-contrast, e2e theme checks).
 *
 *   const { light, dark } = await readTokens();
 *   resolveToken(dark, '--color-concrete'); // '#1c1c1b'
 *
 * light: custom properties declared in the first top-level `:root {}` block.
 * dark:  light, overridden by the `:root {}` inside `@media (prefers-color-scheme: dark)`.
 * Other media blocks (e.g. the wider gutter from 48rem) are ignored.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const TOKENS_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../src/styles/tokens.css',
);

/**
 * Replace each comment with spaces of the same length, keeping offsets and newlines.
 * @param {string} css
 */
export function stripCssComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '));
}

/**
 * Index just past the brace that closes the block opened at `open` (which must be '{').
 * @param {string} css
 * @param {number} open
 */
function blockEnd(css, open) {
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  throw new Error('tokens.css: unbalanced braces');
}

/**
 * Custom property declarations directly inside a block body (not in nested blocks).
 * @param {string} body
 * @returns {Record<string, string>}
 */
function declarations(body) {
  /** @type {Record<string, string>} */
  const out = {};
  // Drop nested blocks so only top-level declarations remain.
  let flat = '';
  let depth = 0;
  for (const ch of body) {
    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    else if (depth === 0) flat += ch;
  }
  for (const match of flat.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    const [, name, value] = match;
    if (name && value) out[name] = value.trim().replace(/\s+/g, ' ');
  }
  return out;
}

/**
 * Top-level blocks as { prelude, body } pairs.
 * @param {string} css
 */
function topLevelBlocks(css) {
  /** @type {{ prelude: string, body: string }[]} */
  const blocks = [];
  let start = 0;
  let i = 0;
  while (i < css.length) {
    if (css[i] === '{') {
      const end = blockEnd(css, i);
      blocks.push({ prelude: css.slice(start, i).trim(), body: css.slice(i + 1, end - 1) });
      i = end;
      start = end;
    } else {
      i += 1;
    }
  }
  return blocks;
}

/**
 * Parse tokens.css source.
 * @param {string} source
 * @returns {{ light: Record<string, string>, dark: Record<string, string> }}
 */
export function parseTokens(source) {
  const css = stripCssComments(source);
  const blocks = topLevelBlocks(css);
  const rootBlock = blocks.find((b) => b.prelude === ':root');
  if (!rootBlock) throw new Error('tokens.css: no top-level :root block');
  const light = declarations(rootBlock.body);

  const darkMedia = blocks.find((b) => /prefers-color-scheme\s*:\s*dark/.test(b.prelude));
  /** @type {Record<string, string>} */
  let darkOverrides = {};
  if (darkMedia) {
    const inner = topLevelBlocks(darkMedia.body).find((b) => b.prelude === ':root');
    if (inner) darkOverrides = declarations(inner.body);
  }
  return { light, dark: { ...light, ...darkOverrides } };
}

/**
 * Resolve a token to its final value, following var(--x) references.
 * @param {Record<string, string>} tokens
 * @param {string} name e.g. '--color-ink'
 * @returns {string}
 */
export function resolveToken(tokens, name) {
  /** @param {string} value @param {number} depth @returns {string} */
  const expand = (value, depth) => {
    if (depth > 20) throw new Error(`tokens.css: var() loop at ${name}`);
    return value.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]*))?\)/g, (_m, ref, fallback) => {
      const found = tokens[ref];
      if (found !== undefined) return expand(found, depth + 1);
      if (fallback !== undefined) return expand(fallback, depth + 1);
      throw new Error(`tokens.css: ${name} refers to undefined ${ref}`);
    });
  };
  const raw = tokens[name];
  if (raw === undefined) throw new Error(`tokens.css: ${name} is not defined`);
  return expand(raw, 0);
}

/**
 * Read and parse tokens.css from disk.
 * @param {string} [file]
 */
export async function readTokens(file = TOKENS_PATH) {
  return parseTokens(await readFile(file, 'utf8'));
}
