// @ts-check
/**
 * The site URL, base path and build folder the dist checks run against (check-links.mjs and the
 * page-quality tests in tests/built/). Same environment variables and defaults as
 * astro.config.mjs, so a check always matches the build it follows:
 *
 *   SITE_URL   default https://jordanl17.github.io
 *   BASE_PATH  default /HouseSums (BASE_PATH=/ for a custom domain)
 *   DIST_DIR   default dist (a second build, e.g. at BASE_PATH=/, can go elsewhere)
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * "/HouseSums/" from "HouseSums", "/HouseSums//" or "/HouseSums"; "/" from "" or "/".
 * The same rule as normaliseBase() in src/lib/url.ts.
 * @param {string} base
 */
export function normaliseBase(base) {
  const trimmed = base
    .trim()
    .replace(/\/{2,}/g, '/')
    .replace(/^\/+|\/+$/g, '');
  return trimmed === '' ? '/' : `/${trimmed}/`;
}

/**
 * @param {Record<string, string | undefined>} [env]
 * @returns {{ site: string, base: string, origin: string, siteRoot: string, distDir: string }}
 *   site: the SITE_URL as given; base: "/HouseSums/"; origin: "https://jordanl17.github.io";
 *   siteRoot: origin + base, the absolute URL of the home page; distDir: absolute path.
 */
export function siteConfig(env = process.env) {
  const site = env['SITE_URL'] || 'https://jordanl17.github.io';
  const base = normaliseBase(env['BASE_PATH'] || '/HouseSums');
  const origin = new URL(site).origin;
  const distDir = path.resolve(ROOT, env['DIST_DIR'] || 'dist');
  return { site, base, origin, siteRoot: `${origin}${base}`, distDir };
}
