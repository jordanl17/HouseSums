/**
 * Shared loader for the page-quality tests over the built site (npm run check:pages). Reads
 * dist/ once (DIST_DIR, SITE_URL and BASE_PATH as for the build; see scripts/lib/site.mjs) and
 * gives each HTML page with the parts the tests look at.
 */
import { decodeEntities, fileUrl, readSite, startTags } from '../../scripts/check-links.mjs';
import { siteConfig } from '../../scripts/lib/site.mjs';

export const config = siteConfig();

export interface BuiltPage {
  /** Path in dist, e.g. "rent-vs-buy/leeds/index.html". */
  rel: string;
  /** The page's public URL under the site and base, e.g. "https://.../HouseSums/rent-vs-buy/leeds/". */
  url: string;
  /** Path after the base, e.g. "rent-vs-buy/leeds/" ("" for the home page). */
  route: string;
  html: string;
  lang: string | null;
  title: string | null;
  /** meta name= and property= values, keyed by lower-cased name. */
  meta: Map<string, string>;
  canonical: string | null;
  noindex: boolean;
  h1Count: number;
  jsonLd: unknown[];
  /** Text a reader can see or hear: body text plus alt, title, aria-label and placeholder. */
  visibleText: string;
}

const TEXT_ATTRS = ['alt', 'title', 'aria-label', 'placeholder', 'aria-description'];

/** The page's visible text, without script, style and template bodies or comments. */
export function visibleText(html: string): string {
  const body = /<body\b[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html;
  const attrText = startTags(body)
    .flatMap(({ attrs }) => TEXT_ATTRS.map((name) => attrs[name]))
    .filter((value): value is string => typeof value === 'string' && value !== '');
  const text = body
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  return decodeEntities([text, ...attrText].join(' '))
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Inner HTML of the first element carrying data-testid="<id>", nesting-aware for elements of
 * the same tag name. Null when there is none.
 */
export function elementByTestId(
  html: string,
  id: string,
): { tag: string; attrs: string; inner: string } | null {
  const open = new RegExp(`<([a-z][a-z0-9-]*)\\b([^>]*\\sdata-testid="${id}"[^>]*)>`, 'i').exec(
    html,
  );
  if (!open) return null;
  const tag = (open[1] ?? '').toLowerCase();
  const start = open.index + open[0].length;
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi');
  re.lastIndex = start;
  let depth = 1;
  for (let match = re.exec(html); match; match = re.exec(html)) {
    depth += match[1] === '/' ? -1 : 1;
    if (depth === 0) return { tag, attrs: open[2] ?? '', inner: html.slice(start, match.index) };
  }
  return null;
}

/** Text of an HTML fragment, whitespace collapsed. */
export function textOf(fragment: string): string {
  return decodeEntities(fragment.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function parsePage(rel: string, html: string): BuiltPage {
  const tags = startTags(html);
  const meta = new Map<string, string>();
  let canonical: string | null = null;
  let h1Count = 0;
  let lang: string | null = null;
  for (const { tag, attrs } of tags) {
    if (tag === 'html') lang = attrs['lang'] ?? null;
    if (tag === 'h1') h1Count += 1;
    if (tag === 'meta') {
      const key = (attrs['name'] ?? attrs['property'] ?? '').toLowerCase();
      if (key && attrs['content'] !== undefined && !meta.has(key)) meta.set(key, attrs['content']);
    }
    if (tag === 'link' && (attrs['rel'] ?? '').split(/\s+/).includes('canonical')) {
      canonical = attrs['href'] ?? null;
    }
  }
  const titleMatch = /<title>([\s\S]*?)<\/title>/i.exec(html);
  const jsonLd = [
    ...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi),
  ].map((match) => JSON.parse(match[1] ?? '') as unknown);
  const url = fileUrl(rel, config);
  return {
    rel,
    url,
    route: url.slice(config.siteRoot.length),
    html,
    lang,
    title: titleMatch ? decodeEntities(titleMatch[1] ?? '').trim() : null,
    meta,
    canonical,
    noindex: /noindex/i.test(meta.get('robots') ?? ''),
    h1Count,
    jsonLd,
    visibleText: visibleText(html),
  };
}

export interface BuiltSite {
  files: Map<string, string | null>;
  pages: BuiltPage[];
  page(route: string): BuiltPage;
}

let loaded: Promise<BuiltSite> | null = null;

/** The built site, read once per test file. Throws a clear error when there is no build. */
export function loadSite(): Promise<BuiltSite> {
  loaded ??= (async () => {
    let files: Map<string, string | null>;
    try {
      files = await readSite(config.distDir);
    } catch {
      throw new Error(`Cannot read ${config.distDir}. Run npm run build first.`);
    }
    const pages = [...files]
      .filter(([rel, text]) => rel.endsWith('.html') && text !== null)
      .map(([rel, text]) => parsePage(rel, text ?? ''))
      .sort((a, b) => a.rel.localeCompare(b.rel));
    const byRoute = new Map(pages.map((p) => [p.route, p]));
    return {
      files,
      pages,
      page(route: string) {
        const found = byRoute.get(route);
        if (!found) throw new Error(`No built page at "${route}"`);
        return found;
      },
    };
  })();
  return loaded;
}
