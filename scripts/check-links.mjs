// @ts-check
/**
 * Link checker for the built site. Reads every file under dist/ (no server, no network) and
 * fails on any internal link or asset that does not resolve to a built file.
 *
 * Usage:
 *   npm run build && npm run check:links
 *   node scripts/check-links.mjs [--orphans=error|warn|off]
 *
 * Env (same defaults as astro.config.mjs; see scripts/lib/site.mjs): SITE_URL, BASE_PATH,
 * DIST_DIR. Run it with the env the build used.
 *
 * Checked, in every .html file:
 *   - href/src/srcset on a, link, script, img, source, iframe, use, image, video, audio, form
 *     action, and astro-island's component-url, renderer-url and any base-path URL in its props;
 *   - og:image, og:url, twitter:image and the canonical link (absolute URLs on our origin);
 *   - #fragments, against the ids and names in the target page.
 * And: url() and CSS import rules in every .css file, every <loc> in sitemap.xml and the Sitemap line in
 * robots.txt.
 *
 * Rules: a URL on another origin is external and skipped (counted, never fetched). Anything on
 * our origin must sit under the base path, and a page URL must end in "/" (the trailing-slash
 * policy; GitHub Pages would redirect, but astro preview returns 404 and it costs a hop).
 *
 * Orphans: every page with a canonical link must be reachable by following <a href> links from
 * the home page (crawlability). --orphans=warn reports them without failing.
 *
 * Exits 1 and lists page, URL and reason for each problem.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { siteConfig } from './lib/site.mjs';

/** @typedef {{ origin: string, base: string }} Site */
/** @typedef {{ tag: string, attr: string, value: string }} Ref */
/** @typedef {{ from: string, url: string, reason: string }} Problem */

const URL_ATTRS = ['href', 'src', 'action', 'poster', 'component-url', 'renderer-url'];
const SRCSET_ATTRS = ['srcset', 'imagesrcset'];
const META_URL_KEYS = new Set(['og:image', 'og:image:url', 'og:url', 'twitter:image']);
const SKIP_SCHEMES = /^(?:mailto|tel|data|blob|about|sms):/i;

/**
 * Decode the HTML character references that can appear in attribute values.
 * @param {string} text
 */
export function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|#39);/gi, (_, ref) => {
    const lower = String(ref).toLowerCase();
    if (lower === 'amp') return '&';
    if (lower === 'lt') return '<';
    if (lower === 'gt') return '>';
    if (lower === 'quot') return '"';
    if (lower === 'apos' || lower === '#39') return "'";
    const code = lower.startsWith('#x')
      ? parseInt(lower.slice(2), 16)
      : parseInt(lower.slice(1), 10);
    return String.fromCodePoint(code);
  });
}

/**
 * Attributes of one start tag's body (everything after the tag name), lower-cased names,
 * decoded values. A bare attribute gets "".
 * @param {string} body
 * @returns {Record<string, string>}
 */
export function parseAttributes(body) {
  /** @type {Record<string, string>} */
  const attrs = {};
  const re = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (const match of body.matchAll(re)) {
    const name = (match[1] ?? '').toLowerCase();
    if (!name || name in attrs) continue;
    attrs[name] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attrs;
}

/**
 * Start tags in an HTML document, with comments and the bodies of script, style and template
 * elements removed first (so text inside them is never read as markup).
 * @param {string} html
 * @returns {{ tag: string, attrs: Record<string, string> }[]}
 */
export function startTags(html) {
  const cleaned = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/(<(script|style)\b[^>]*>)[\s\S]*?<\/\2\s*>/gi, '$1');
  const tags = [];
  for (const match of cleaned.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*)>/gi)) {
    tags.push({ tag: (match[1] ?? '').toLowerCase(), attrs: parseAttributes(match[2] ?? '') });
  }
  return tags;
}

/**
 * URL strings under the base path inside an astro-island `props` attribute (serialised JSON),
 * such as the area list's address.
 * @param {string} props
 * @param {string} base
 */
export function urlsInIslandProps(props, base) {
  const found = [];
  // Root-relative paths only: that is what url() gives. Absolute URLs in props are data (such
  // as a dataset's address), not links on the page.
  for (const match of props.matchAll(/"(\/(?!\/)[^"\s]*)"/g)) {
    const value = match[1] ?? '';
    // Under base "/" every path qualifies, so require at least one character after it.
    if (value.startsWith(base) && (base !== '/' || value.length > 1)) found.push(value);
  }
  return found;
}

/**
 * Every URL reference in an HTML page, plus the ids and names it defines (fragment targets).
 * @param {string} html
 * @param {string} base
 * @returns {{ refs: Ref[], anchors: Set<string>, canonical: string | null, noindex: boolean }}
 */
export function scanHtml(html, base) {
  /** @type {Ref[]} */
  const refs = [];
  const anchors = new Set();
  let canonical = null;
  let noindex = false;
  for (const { tag, attrs } of startTags(html)) {
    if (attrs['id']) anchors.add(attrs['id']);
    if (tag === 'a' && attrs['name']) anchors.add(attrs['name']);
    if (tag === 'meta') {
      const key = (attrs['property'] ?? attrs['name'] ?? '').toLowerCase();
      if (META_URL_KEYS.has(key) && attrs['content']) {
        refs.push({ tag, attr: key, value: attrs['content'] });
      }
      if (key === 'robots' && /noindex/i.test(attrs['content'] ?? '')) noindex = true;
      continue;
    }
    if (tag === 'link' && (attrs['rel'] ?? '').toLowerCase().split(/\s+/).includes('canonical')) {
      canonical = attrs['href'] ?? null;
    }
    for (const attr of URL_ATTRS) {
      const value = attrs[attr];
      if (value !== undefined) refs.push({ tag, attr, value });
    }
    // SVG <use> and <image> may carry xlink:href.
    if (attrs['xlink:href'] !== undefined) {
      refs.push({ tag, attr: 'xlink:href', value: attrs['xlink:href'] });
    }
    for (const attr of SRCSET_ATTRS) {
      const value = attrs[attr];
      if (!value) continue;
      for (const candidate of value.split(',')) {
        const href = candidate.trim().split(/\s+/)[0];
        if (href) refs.push({ tag, attr, value: href });
      }
    }
    if (tag === 'astro-island' && attrs['props']) {
      for (const value of urlsInIslandProps(attrs['props'], base)) {
        refs.push({ tag, attr: 'props', value });
      }
    }
  }
  return { refs, anchors, canonical, noindex };
}

/**
 * url(...) and CSS import rule targets in a stylesheet.
 * @param {string} css
 */
export function cssUrls(css) {
  const out = [];
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const match of stripped.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)/gi)) {
    const value = match[1] ?? match[2] ?? match[3] ?? '';
    if (value) out.push(value);
  }
  for (const match of stripped.matchAll(/@import\s+(?:"([^"]*)"|'([^']*)')/gi)) {
    const value = match[1] ?? match[2] ?? '';
    if (value) out.push(value);
  }
  return out;
}

/**
 * The public URL of a file in dist: "rent-vs-buy/leeds/index.html" -> origin + base +
 * "rent-vs-buy/leeds/".
 * @param {string} rel  path relative to dist, with forward slashes
 * @param {Site} site
 */
export function fileUrl(rel, site) {
  const pagePath = rel === 'index.html' ? '' : rel.replace(/(^|\/)index\.html$/, '$1');
  return `${site.origin}${site.base}${pagePath.split('/').map(encodeURIComponent).join('/')}`;
}

/**
 * Where a reference points. `external` for other origins and skipped schemes; otherwise the
 * dist-relative file it must exist as, the fragment (if any), or an error.
 * @param {string} value  the raw reference
 * @param {string} fromUrl  absolute URL of the referring file
 * @param {Site} site
 * @returns {{ kind: 'external' } | { kind: 'error', reason: string } | { kind: 'internal', file: string, fragment: string | null }}
 */
export function resolveRef(value, fromUrl, site) {
  const trimmed = value.trim();
  if (trimmed === '') return { kind: 'error', reason: 'empty URL' };
  if (SKIP_SCHEMES.test(trimmed)) return { kind: 'external' };
  if (/^javascript:/i.test(trimmed)) return { kind: 'error', reason: 'javascript: URL' };
  let target;
  try {
    target = new URL(trimmed, fromUrl);
  } catch {
    return { kind: 'error', reason: 'not a valid URL' };
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') return { kind: 'external' };
  if (target.origin !== site.origin) return { kind: 'external' };
  if (!target.pathname.startsWith(site.base)) {
    return { kind: 'error', reason: `outside the base path ${site.base}` };
  }
  let rel;
  try {
    rel = decodeURIComponent(target.pathname.slice(site.base.length));
  } catch {
    return { kind: 'error', reason: 'badly encoded path' };
  }
  const last = rel.split('/').pop() ?? '';
  let file;
  if (rel === '' || rel.endsWith('/')) file = `${rel}index.html`;
  else if (/\.[a-z0-9]+$/i.test(last)) file = rel;
  else return { kind: 'error', reason: 'page URL without its trailing slash' };
  const fragment = target.hash ? decodeURIComponent(target.hash.slice(1)) : null;
  return { kind: 'internal', file, fragment: fragment || null };
}

/**
 * Check a whole site held in memory: `files` maps dist-relative paths to their text (HTML, CSS,
 * sitemap.xml, robots.txt) or null for binary files.
 * @param {Map<string, string | null>} files
 * @param {Site} site
 * @returns {{ problems: Problem[], orphans: string[], pages: number, internal: number, external: number }}
 */
export function checkSite(files, site) {
  /** @type {Problem[]} */
  const problems = [];
  /** @type {Map<string, ReturnType<typeof scanHtml>>} */
  const pages = new Map();
  for (const [rel, text] of files) {
    if (rel.endsWith('.html') && text !== null) pages.set(rel, scanHtml(text, site.base));
  }

  let internal = 0;
  let external = 0;
  /** @type {Map<string, Set<string>>} page -> pages it links to with <a href> */
  const links = new Map();

  /**
   * @param {string} from  dist-relative referring file
   * @param {string} value
   * @param {boolean} isAnchor  an <a href>, followed by the orphan crawl
   */
  const check = (from, value, isAnchor) => {
    const result = resolveRef(value, fileUrl(from, site), site);
    if (result.kind === 'external') {
      external += 1;
      return;
    }
    if (result.kind === 'error') {
      problems.push({ from, url: value, reason: result.reason });
      return;
    }
    internal += 1;
    if (!files.has(result.file)) {
      problems.push({ from, url: value, reason: `no such file: ${result.file}` });
      return;
    }
    if (isAnchor && result.file.endsWith('.html')) {
      const set = links.get(from) ?? new Set();
      set.add(result.file);
      links.set(from, set);
    }
    if (result.fragment && result.file.endsWith('.html')) {
      const target = pages.get(result.file);
      if (target && !target.anchors.has(result.fragment)) {
        problems.push({ from, url: value, reason: `no element with id "${result.fragment}"` });
      }
    }
  };

  for (const [rel, scan] of pages) {
    for (const ref of scan.refs) check(rel, ref.value, ref.tag === 'a' && ref.attr === 'href');
    if (scan.canonical !== null) check(rel, scan.canonical, false);
  }
  for (const [rel, text] of files) {
    if (text === null) continue;
    if (rel.endsWith('.css')) for (const value of cssUrls(text)) check(rel, value, false);
    if (rel === 'sitemap.xml') {
      for (const match of text.matchAll(/<loc>([^<]*)<\/loc>/g)) {
        check(rel, decodeEntities(match[1] ?? ''), false);
      }
    }
    if (rel === 'robots.txt') {
      for (const match of text.matchAll(/^Sitemap:\s*(\S+)/gim)) check(rel, match[1] ?? '', false);
    }
  }

  // Crawl from the home page over <a href> links; every indexable page must be reached.
  const seen = new Set(['index.html']);
  const queue = ['index.html'];
  while (queue.length > 0) {
    const next = queue.shift() ?? '';
    for (const target of links.get(next) ?? []) {
      if (!seen.has(target)) {
        seen.add(target);
        queue.push(target);
      }
    }
  }
  const orphans = [...pages]
    .filter(([rel, scan]) => scan.canonical !== null && !scan.noindex && !seen.has(rel))
    .map(([rel]) => rel)
    .sort();

  return { problems, orphans, pages: pages.size, internal, external };
}

const TEXT_EXT = new Set(['.html', '.css', '.xml', '.txt']);

/**
 * Every file under `dir`, dist-relative with forward slashes, text for the formats we read.
 * @param {string} dir
 */
export async function readSite(dir) {
  /** @type {Map<string, string | null>} */
  const files = new Map();
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const abs = path.join(entry.parentPath, entry.name);
    const rel = path.relative(dir, abs).split(path.sep).join('/');
    files.set(rel, TEXT_EXT.has(path.extname(rel)) ? await readFile(abs, 'utf8') : null);
  }
  return files;
}

async function main() {
  const orphansArg = process.argv.find((arg) => arg.startsWith('--orphans='));
  const orphanMode = orphansArg ? orphansArg.slice('--orphans='.length) : 'error';
  if (!['error', 'warn', 'off'].includes(orphanMode)) {
    console.error(`check-links: --orphans must be error, warn or off, not "${orphanMode}"`);
    process.exit(2);
  }
  const { origin, base, distDir } = siteConfig();
  let files;
  try {
    files = await readSite(distDir);
  } catch {
    console.error(`check-links: cannot read ${distDir}. Run npm run build first.`);
    process.exit(2);
  }
  if (!files.has('index.html')) {
    console.error(`check-links: ${distDir} has no index.html. Run npm run build first.`);
    process.exit(2);
  }
  const started = Date.now();
  const result = checkSite(files, { origin, base });
  for (const p of result.problems) console.error(`${p.from}: ${p.url}  (${p.reason})`);
  if (orphanMode !== 'off') {
    const log = orphanMode === 'error' ? console.error : console.warn;
    // As warnings, a sample is enough; as errors, list them all.
    const shown = orphanMode === 'error' ? result.orphans : result.orphans.slice(0, 10);
    for (const rel of shown) log(`${rel}: not reachable by links from the home page (orphan)`);
    if (shown.length < result.orphans.length) {
      log(`...and ${result.orphans.length - shown.length} more orphan page(s)`);
    }
  }
  const summary = `${result.pages} pages, ${result.internal} internal links and assets checked, ${result.external} external skipped, base ${base}, ${Date.now() - started}ms.`;
  const orphanFail = orphanMode === 'error' && result.orphans.length > 0;
  if (result.problems.length > 0 || orphanFail) {
    console.error(
      `\ncheck-links: ${result.problems.length} broken link(s), ${result.orphans.length} orphan page(s). ${summary}`,
    );
    process.exit(1);
  }
  const orphanNote =
    result.orphans.length > 0 && orphanMode === 'warn'
      ? ` ${result.orphans.length} orphan page(s) reported as warnings.`
      : '';
  console.log(`check-links: no broken links. ${summary}${orphanNote}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
