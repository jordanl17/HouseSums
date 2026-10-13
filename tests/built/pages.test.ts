/**
 * Page quality over the built site: every page has a unique title and description, exactly one
 * h1, lang en-GB and no em-dashes in what a reader sees; every indexable page has a canonical
 * link to its own URL and complete Open Graph and Twitter tags; noindex pages say so and have no
 * canonical; JSON-LD has the agreed shape.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import areasJson from '../../data/areas.json';
import { NATION_NAMES, NATION_SLUGS } from '../../src/lib/nations';
import { parseAreasFile } from '../../src/lib/schema';
import { NATIONS, type Nation } from '../../src/lib/types';
import { config, loadSite, type BuiltPage, type BuiltSite } from './site';

const areas = parseAreasFile(areasJson).areas;
const nationBySlug = new Map<string, Nation>(NATIONS.map((n) => [NATION_SLUGS[n], n]));
const areaBySlug = new Map(areas.map((area) => [area.slug, area]));

/** Pages that must stay out of search: the 404 page and the unlisted style guide. */
const NOINDEX_ROUTES = ['404.html', 'styleguide/'];

let site: BuiltSite;
let indexable: BuiltPage[];

beforeAll(async () => {
  site = await loadSite();
  indexable = site.pages.filter((p) => !p.noindex);
});

/** "rent-vs-buy/leeds/" -> the area; null for any other route. */
function areaOf(page: BuiltPage) {
  const slug = /^rent-vs-buy\/([^/]+)\/$/.exec(page.route)?.[1];
  return slug ? (areaBySlug.get(slug) ?? null) : null;
}

function nationOf(page: BuiltPage): Nation | null {
  const slug = /^rent-vs-buy\/([^/]+)\/$/.exec(page.route)?.[1];
  return slug ? (nationBySlug.get(slug) ?? null) : null;
}

type Ld = Record<string, unknown>;
const ldOfType = (page: BuiltPage, type: string) =>
  page.jsonLd.filter((block): block is Ld => (block as Ld)['@type'] === type);

describe('the build', () => {
  it('has every area and nation page and nothing at the old slugs', () => {
    for (const area of areas)
      expect(site.files.has(`rent-vs-buy/${area.slug}/index.html`)).toBe(true);
    for (const nation of NATIONS) {
      expect(site.files.has(`rent-vs-buy/${NATION_SLUGS[nation]}/index.html`)).toBe(true);
    }
    for (const old of [
      'bristol-city-of',
      'kingston-upon-hull-city-of',
      'herefordshire-county-of',
    ]) {
      expect(site.files.has(`rent-vs-buy/${old}/index.html`)).toBe(false);
    }
  });

  it('marks exactly the 404 page and the style guide noindex', () => {
    expect(
      site.pages
        .filter((p) => p.noindex)
        .map((p) => p.route)
        .sort(),
    ).toEqual([...NOINDEX_ROUTES].sort());
  });
});

describe('every page', () => {
  it('has a title, and no two pages share one', () => {
    const titles = site.pages.map((p) => p.title);
    expect(titles.filter((t) => !t)).toEqual([]);
    const dupes = titles.filter((t, i) => titles.indexOf(t) !== i);
    expect(dupes).toEqual([]);
  });

  it('has a meta description, and no two pages share one', () => {
    const descriptions = site.pages.map((p) => p.meta.get('description') ?? '');
    expect(site.pages.filter((p) => !p.meta.get('description')).map((p) => p.rel)).toEqual([]);
    const dupes = descriptions.filter((d, i) => descriptions.indexOf(d) !== i);
    expect(dupes).toEqual([]);
  });

  it('has exactly one h1', () => {
    expect(site.pages.filter((p) => p.h1Count !== 1).map((p) => `${p.rel}: ${p.h1Count}`)).toEqual(
      [],
    );
  });

  it('is in British English', () => {
    expect(site.pages.filter((p) => p.lang !== 'en-GB').map((p) => p.rel)).toEqual([]);
  });

  it('has no em-dashes in its visible text, title or descriptions', () => {
    const offenders = site.pages.flatMap((p) => {
      const texts = [
        p.visibleText,
        p.title ?? '',
        ...[
          'description',
          'og:title',
          'og:description',
          'og:image:alt',
          'twitter:title',
          'twitter:description',
        ].map((key) => p.meta.get(key) ?? ''),
      ];
      const hits = texts.filter((t) => /—/.test(t));
      if (/&mdash;|&#8212;|&#x2014;/i.test(p.html)) hits.push('an em-dash entity');
      return hits.map(
        (t) => `${p.rel}: ${t.slice(Math.max(0, t.indexOf('—') - 40), t.indexOf('—') + 40)}`,
      );
    });
    expect(offenders).toEqual([]);
  });

  it('has Open Graph and Twitter card tags that match its title and description', () => {
    const problems: string[] = [];
    for (const p of site.pages) {
      const expect_ = (key: string, value: string | undefined) => {
        if (p.meta.get(key) !== value)
          problems.push(`${p.rel}: ${key} is "${p.meta.get(key)}", want "${value}"`);
      };
      expect_('og:site_name', 'House Sums');
      expect_('og:locale', 'en_GB');
      expect_('og:type', 'website');
      expect_('og:title', p.title ?? undefined);
      expect_('og:description', p.meta.get('description'));
      expect_('og:image:width', '1200');
      expect_('og:image:height', '630');
      expect_('twitter:card', 'summary_large_image');
      expect_('twitter:title', p.title ?? undefined);
      expect_('twitter:description', p.meta.get('description'));
      expect_('twitter:image', p.meta.get('og:image'));
      if (!p.meta.get('og:image:alt')) problems.push(`${p.rel}: no og:image:alt`);
      if (p.meta.get('twitter:image:alt') !== p.meta.get('og:image:alt')) {
        problems.push(`${p.rel}: twitter:image:alt differs from og:image:alt`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('points og:image at its nation card (or the site card) as an absolute URL that exists', () => {
    const problems: string[] = [];
    for (const p of site.pages) {
      const nation = areaOf(p)?.nation ?? nationOf(p);
      const want = `${config.siteRoot}og/${nation ? NATION_SLUGS[nation] : 'default'}.png`;
      const got = p.meta.get('og:image');
      if (got !== want) problems.push(`${p.rel}: og:image is ${got}, want ${want}`);
      if (!site.files.has(want.slice(config.siteRoot.length)))
        problems.push(`${p.rel}: ${want} is not in the build`);
    }
    expect(problems).toEqual([]);
  });
});

describe('indexable pages', () => {
  it('each have a canonical link to their own URL, with og:url the same', () => {
    const problems = indexable
      .filter((p) => p.canonical !== p.url || p.meta.get('og:url') !== p.url)
      .map(
        (p) => `${p.rel}: canonical ${p.canonical}, og:url ${p.meta.get('og:url')}, want ${p.url}`,
      );
    expect(problems).toEqual([]);
  });

  it('use the trailing-slash policy in canonical URLs', () => {
    expect(indexable.filter((p) => !p.canonical?.endsWith('/')).map((p) => p.rel)).toEqual([]);
  });
});

describe('noindex pages', () => {
  it('have no canonical link and no og:url', () => {
    for (const route of NOINDEX_ROUTES) {
      const p = site.page(route);
      expect(p.canonical, route).toBeNull();
      expect(p.meta.has('og:url'), route).toBe(false);
    }
  });
});

describe('JSON-LD', () => {
  it('is valid schema.org JSON in every block', () => {
    for (const p of site.pages) {
      for (const block of p.jsonLd) {
        expect(block, p.rel).toMatchObject({
          '@context': 'https://schema.org',
          '@type': expect.any(String),
        });
      }
    }
  });

  it('describes the calculator as a free WebApplication on the home page and every area page', () => {
    const calculatorPages = site.pages.filter((p) => p.route === '' || areaOf(p) !== null);
    expect(calculatorPages).toHaveLength(areas.length + 1);
    for (const p of calculatorPages) {
      const apps = ldOfType(p, 'WebApplication');
      expect(apps, p.rel).toHaveLength(1);
      expect(apps[0], p.rel).toEqual({
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        name: expect.stringMatching(/\S/),
        url: p.url,
        applicationCategory: 'FinanceApplication',
        operatingSystem: 'Any',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'GBP' },
        ...(apps[0]?.['description'] === undefined
          ? {}
          : { description: p.meta.get('description') }),
      });
      const area = areaOf(p);
      if (area) expect(apps[0]?.['name']).toContain(area.name);
    }
    const others = site.pages.filter((p) => !calculatorPages.includes(p));
    expect(
      others.filter((p) => ldOfType(p, 'WebApplication').length > 0).map((p) => p.rel),
    ).toEqual([]);
  });

  it('gives area, nation and nations-index pages a BreadcrumbList from the home page to the page', () => {
    const urls = new Set(indexable.map((p) => p.url));
    const crumbPages = site.pages.filter(
      (p) => p.route === 'rent-vs-buy/' || areaOf(p) !== null || nationOf(p) !== null,
    );
    expect(crumbPages).toHaveLength(areas.length + NATIONS.length + 1);
    for (const p of crumbPages) {
      const lists = ldOfType(p, 'BreadcrumbList');
      expect(lists, p.rel).toHaveLength(1);
      const items = lists[0]?.['itemListElement'] as {
        '@type': string;
        position: number;
        name: string;
        item: string;
      }[];
      expect(Array.isArray(items), p.rel).toBe(true);
      items.forEach((item, index) => {
        expect(item['@type']).toBe('ListItem');
        expect(item.position).toBe(index + 1);
        expect(item.name).toMatch(/\S/);
        expect(urls.has(item.item), `${p.rel}: ${item.item}`).toBe(true);
      });
      expect(items[0]).toMatchObject({ name: 'House Sums', item: config.siteRoot });
      expect(items[1]).toMatchObject({
        name: 'Rent v buy',
        item: `${config.siteRoot}rent-vs-buy/`,
      });
      expect(items[items.length - 1]?.item).toBe(p.url);
      const area = areaOf(p);
      const nation = area?.nation ?? nationOf(p);
      if (nation) expect(items[2]?.name).toBe(NATION_NAMES[nation]);
      if (area) {
        expect(items).toHaveLength(4);
        expect(items[3]?.name).toBe(area.name);
      }
    }
  });
});
