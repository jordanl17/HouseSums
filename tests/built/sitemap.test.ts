/**
 * sitemap.xml lists exactly the indexable pages (those with a canonical link), and robots.txt
 * points at it.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { decodeEntities } from '../../scripts/check-links.mjs';
import { config, loadSite, type BuiltSite } from './site';

let site: BuiltSite;
let sitemap: string;

beforeAll(async () => {
  site = await loadSite();
  sitemap = site.files.get('sitemap.xml') ?? '';
});

describe('sitemap.xml', () => {
  it('is a sitemaps.org urlset', () => {
    expect(sitemap.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n')).toBe(true);
    expect(sitemap).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(sitemap.trimEnd().endsWith('</urlset>')).toBe(true);
    // Every element is a url with a single loc (no stray markup).
    const body = sitemap.replace(/^[\s\S]*?<urlset[^>]*>/, '').replace(/<\/urlset>\s*$/, '');
    expect(body.replace(/<url><loc>[^<]+<\/loc><\/url>/g, '').trim()).toBe('');
  });

  it('lists every indexable page once and nothing else', () => {
    const locs = [...sitemap.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) =>
      decodeEntities(m[1] ?? ''),
    );
    expect(new Set(locs).size).toBe(locs.length);
    const canonical = site.pages.filter((p) => p.canonical !== null).map((p) => p.canonical);
    expect([...locs].sort()).toEqual([...canonical].sort());
    expect(locs.length).toBeLessThanOrEqual(50_000);
  });

  it('leaves out the style guide and the 404 page', () => {
    expect(sitemap).not.toContain('styleguide');
    expect(sitemap).not.toContain('404');
  });

  it('uses absolute URLs under the site and base path with trailing slashes', () => {
    for (const match of sitemap.matchAll(/<loc>([^<]*)<\/loc>/g)) {
      const loc = match[1] ?? '';
      expect(loc.startsWith(config.siteRoot), loc).toBe(true);
      expect(loc.endsWith('/'), loc).toBe(true);
    }
  });
});

describe('robots.txt', () => {
  it('allows crawling and names the sitemap', () => {
    const robots = site.files.get('robots.txt') ?? '';
    expect(robots).toMatch(/^User-agent: \*$/m);
    expect(robots).not.toMatch(/^Disallow: \/\s*$/m);
    expect(robots).toMatch(
      new RegExp(
        `^Sitemap: ${config.siteRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}sitemap\\.xml$`,
        'm',
      ),
    );
  });
});
