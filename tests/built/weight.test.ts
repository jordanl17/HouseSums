/**
 * Page weight (phase 6, perf): the HTML stays small and the calculator's shared data is one
 * cacheable file instead of being repeated in every page.
 *
 * - Every area page and the home page is under 45 KB of HTML (raw bytes, as built).
 * - The island's serialised props carry only the page's own area and the links: no defaults,
 *   tax rules, rates or nation figures.
 * - data/calculator.json holds exactly the validated data files, and every page with the island
 *   asks for it (and preloads it) with the hash of its content in the query.
 * - Every page preloads the woff2 fonts its stylesheet uses, and nothing else of the kind.
 *
 * The static answer staying in the HTML is checked by answers.test.ts.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import areaNamesJson from '../../data/area-names.json';
import areasJson from '../../data/areas.json';
import defaultsJson from '../../data/defaults.json';
import ratesJson from '../../data/rates.json';
import taxRulesJson from '../../data/taxRules.json';
import { startTags } from '../../scripts/check-links.mjs';
import { NATION_SLUGS } from '../../src/lib/nations';
import {
  parseAreaNames,
  parseAreasFile,
  parseDefaults,
  parseRatesFile,
  parseTaxRules,
} from '../../src/lib/schema';
import { config, loadSite, type BuiltPage, type BuiltSite } from './site';

/** The phase 6 target for an area page (and the home page), in raw bytes. */
const MAX_PAGE_BYTES = 45 * 1024;
/** Island props are the area and four links now; the shared data alone was about 19.5 KB. */
const MAX_PROPS_CHARS = 2000;

let site: BuiltSite;
beforeAll(async () => {
  site = await loadSite();
});

const nationSlugs = new Set<string>(Object.values(NATION_SLUGS));
const bytes = (page: BuiltPage) => Buffer.byteLength(page.html, 'utf8');
const areaPages = () =>
  site.pages.filter((page) => {
    const match = /^rent-vs-buy\/([^/]+)\/$/.exec(page.route);
    return match !== null && !nationSlugs.has(match[1] ?? '');
  });
const islandPages = () => site.pages.filter((page) => page.html.includes('<astro-island'));

function tagsOf(page: BuiltPage, tag: string) {
  return startTags(page.html).filter((t) => t.tag === tag);
}

describe('HTML weight', () => {
  it('has the 361 area pages to check', () => {
    expect(areaPages()).toHaveLength(361);
  });

  it('keeps every area page under 45 KB', () => {
    const over = areaPages()
      .filter((page) => bytes(page) > MAX_PAGE_BYTES)
      .map((page) => `${page.route} ${bytes(page)}`);
    expect(over).toEqual([]);
  });

  it('keeps the home page under 45 KB', () => {
    expect(bytes(site.page(''))).toBeLessThanOrEqual(MAX_PAGE_BYTES);
  });
});

describe('the calculator island', () => {
  it('is on the home page and every area page, and nowhere else', () => {
    const routes = islandPages().map((page) => page.route);
    expect(routes).toHaveLength(362);
    expect(routes).toContain('');
    expect(routes).toContain('rent-vs-buy/leeds/');
  });

  it('serialises only the area and the links into the page, never the shared data', () => {
    for (const page of islandPages()) {
      const islands = tagsOf(page, 'astro-island');
      expect(islands, page.route).toHaveLength(1);
      const props = islands[0]?.attrs['props'] ?? '';
      expect(props.length, page.route).toBeLessThanOrEqual(MAX_PROPS_CHARS);
      for (const key of ['"defaults"', '"taxRules"', '"rates"', '"areasMeta"', '"slugAliases"']) {
        expect(props, `${page.route} ${key}`).not.toContain(key);
      }
    }
  });
});

describe('data/calculator.json', () => {
  const read = () => readFileSync(path.join(config.distDir, 'data', 'calculator.json'), 'utf8');

  it('is exactly the validated data files the island needs', () => {
    const areas = parseAreasFile(areasJson);
    expect(JSON.parse(read())).toEqual({
      v: 1,
      defaults: parseDefaults(defaultsJson),
      taxRules: parseTaxRules(taxRulesJson),
      rates: parseRatesFile(ratesJson),
      areasMeta: { asOf: areas.asOf, nations: areas.nations },
      slugAliases: { ...parseAreaNames(areaNamesJson).aliases },
    });
  });

  it('is asked for and preloaded with the hash of its content on every island page', () => {
    const hash = createHash('sha256').update(read()).digest('hex').slice(0, 10);
    const href = `${config.base}data/calculator.json?v=${hash}`;
    for (const page of islandPages()) {
      const props = tagsOf(page, 'astro-island')[0]?.attrs['props'] ?? '';
      expect(props, page.route).toContain(`"data":[0,"${href}"]`);
      const preload = tagsOf(page, 'link').filter(
        (link) => link.attrs['rel'] === 'preload' && link.attrs['href'] === href,
      );
      expect(preload, page.route).toHaveLength(1);
      expect(preload[0]?.attrs['as'], page.route).toBe('fetch');
      expect(preload[0]?.attrs['crossorigin'], page.route).toBe('anonymous');
    }
  });

  it('is not preloaded on pages without the island', () => {
    for (const page of site.pages.filter((p) => !p.html.includes('<astro-island'))) {
      expect(page.html, page.route).not.toContain('data/calculator.json');
    }
  });
});

describe('fonts', () => {
  it('preloads the woff2 files the stylesheet uses, on every page, and builds no .woff', () => {
    const css = [...site.files].filter(([rel]) => rel.endsWith('.css'));
    const used = new Set<string>();
    for (const [, text] of css) {
      for (const match of (text ?? '').matchAll(/url\(([^)]+\.woff2)\)/g)) {
        used.add(match[1]?.replace(/^["']|["']$/g, '') ?? '');
      }
    }
    expect(used.size).toBe(4);
    for (const href of used) {
      expect(site.files.has(href.slice(config.base.length)), href).toBe(true);
    }
    expect([...site.files.keys()].filter((rel) => rel.endsWith('.woff'))).toEqual([]);
    for (const page of site.pages) {
      const fonts = tagsOf(page, 'link')
        .filter((link) => link.attrs['rel'] === 'preload' && link.attrs['as'] === 'font')
        .map((link) => {
          expect(link.attrs['type'], page.route).toBe('font/woff2');
          expect(link.attrs['crossorigin'], page.route).toBe('anonymous');
          return link.attrs['href'];
        });
      expect(new Set(fonts), page.route).toEqual(used);
    }
  });
});
