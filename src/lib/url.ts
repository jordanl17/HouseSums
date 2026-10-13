/**
 * Internal URL helpers. The site is served under a base path (e.g. /HouseSums/
 * on GitHub Pages, / on a custom domain), so every internal link must go
 * through url() rather than being written as an absolute path.
 *
 * Trailing-slash policy (matches astro.config.mjs trailingSlash: 'always'):
 * - Page paths always end in "/" ("rent-vs-buy/leeds" -> "/HouseSums/rent-vs-buy/leeds/").
 * - Paths whose last segment has a file extension are left alone
 *   ("favicon.svg" -> "/HouseSums/favicon.svg").
 * - A query string or hash is kept and placed after the slash.
 */

const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

/** Ensure a base path starts and ends with a single "/". */
export function normaliseBase(base: string): string {
  const trimmed = base.trim().replace(/^\/+|\/+$/g, '');
  return trimmed === '' ? '/' : `/${trimmed}/`;
}

/**
 * Join a base path and an internal path. Pure, so it can be unit tested
 * with any base. Prefer url() in pages and components.
 */
export function joinBase(base: string, path = ''): string {
  if (EXTERNAL.test(path)) {
    return path;
  }

  const match = /^([^?#]*)(.*)$/.exec(path);
  const pathname = match?.[1] ?? '';
  const suffix = match?.[2] ?? '';

  const cleaned = pathname.replace(/^\/+/, '').replace(/\/{2,}/g, '/');
  const lastSegment = cleaned.split('/').pop() ?? '';
  const isFile = /\.[a-z0-9]+$/i.test(lastSegment);
  const withSlash = cleaned === '' || isFile || cleaned.endsWith('/') ? cleaned : `${cleaned}/`;

  return `${normaliseBase(base)}${withSlash}${suffix}`;
}

/** Build an internal URL under the configured base path, e.g. url('sources') -> '/HouseSums/sources/'. */
export function url(path = ''): string {
  return joinBase(import.meta.env.BASE_URL, path);
}
