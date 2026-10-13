import { describe, expect, it } from 'vitest';
import {
  areaDescription,
  areaTitle,
  breadcrumbLd,
  canonicalUrl,
  fullTitle,
  jsonLdText,
  MAX_TITLE_LENGTH,
  nationTitle,
  ogImagePath,
  robotsTxt,
  sitemapXml,
  webApplicationLd,
  withTrailingSlash,
  xmlEscape,
} from './seo';

describe('titles', () => {
  it('adds the site name', () => {
    expect(fullTitle()).toBe('House Sums');
    expect(fullTitle('Sources')).toBe('Sources | House Sums');
  });

  it('builds area and nation titles', () => {
    expect(areaTitle('Leeds')).toBe('Rent or buy in Leeds? Your break-even year');
    expect(nationTitle('ni')).toBe('Rent or buy in Northern Ireland? Break-even years by area');
  });

  it('keeps area titles to about 65 characters with the site name, dropping words for long names', () => {
    expect(fullTitle(areaTitle('Leeds'))).toBe(
      'Rent or buy in Leeds? Your break-even year | House Sums',
    );
    expect(areaTitle('Kingston upon Hull')).toBe(
      'Rent or buy in Kingston upon Hull? Break-even year',
    );
    expect(areaTitle('Armagh City, Banbridge and Craigavon')).toBe(
      'Rent or buy in Armagh City, Banbridge and Craigavon?',
    );
    for (const name of ['Leeds', 'Kingston upon Hull', 'Bournemouth, Christchurch and Poole']) {
      expect(fullTitle(areaTitle(name)).length).toBeLessThanOrEqual(MAX_TITLE_LENGTH);
    }
  });

  it('puts the answer first in an area description', () => {
    expect(
      areaDescription({
        answer: 'At typical assumptions, buying in Leeds pulls ahead after 2 years.',
        price: '£247,695',
        rent: '£1,145',
      }),
    ).toBe(
      'At typical assumptions, buying in Leeds pulls ahead after 2 years. Average price £247,695, rent £1,145 a month. Change any figure to see your own answer.',
    );
  });

  it("labels figures taken from the nation as the nation's", () => {
    const answer = 'At typical assumptions, buying in City of London pulls ahead after 9 years.';
    expect(
      areaDescription({
        answer,
        price: '£710,652',
        rent: '£1,459',
        rentFallback: true,
        fallbackLabel: 'England figure',
      }),
    ).toBe(
      `${answer} Average price £710,652, rent £1,459 a month (England figure). Change any figure to see your own answer.`,
    );
    expect(
      areaDescription({
        answer,
        price: '£293,479',
        rent: '£1,459',
        priceFallback: true,
        rentFallback: true,
        fallbackLabel: 'England figure',
      }),
    ).toContain('Average price £293,479 (England figure), rent £1,459 a month (England figure).');
    expect(() => areaDescription({ answer, price: '£1', rent: '£1', priceFallback: true })).toThrow(
      /fallbackLabel/,
    );
  });
});

describe('URLs', () => {
  it('applies the trailing-slash policy', () => {
    expect(withTrailingSlash('/HouseSums/sources')).toBe('/HouseSums/sources/');
    expect(withTrailingSlash('/HouseSums/sources/')).toBe('/HouseSums/sources/');
    expect(withTrailingSlash('/HouseSums/og/default.png')).toBe('/HouseSums/og/default.png');
  });

  it('gives absolute canonical URLs without query or hash', () => {
    const site = 'https://jordanl17.github.io';
    expect(canonicalUrl('/HouseSums/rent-vs-buy/leeds', site)).toBe(
      'https://jordanl17.github.io/HouseSums/rent-vs-buy/leeds/',
    );
    expect(canonicalUrl('/HouseSums/?a=leeds#x', site)).toBe(
      'https://jordanl17.github.io/HouseSums/',
    );
    expect(canonicalUrl('/', 'https://housesums.co.uk')).toBe('https://housesums.co.uk/');
  });

  it('names one OG image per nation plus a default', () => {
    expect(ogImagePath('sco')).toBe('og/scotland.png');
    expect(ogImagePath('ni')).toBe('og/northern-ireland.png');
    expect(ogImagePath()).toBe('og/default.png');
  });
});

describe('JSON-LD', () => {
  it('builds a WebApplication', () => {
    expect(webApplicationLd({ name: 'Rent v buy', url: 'https://x.test/' })).toEqual({
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: 'Rent v buy',
      url: 'https://x.test/',
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Any',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'GBP' },
    });
  });

  it('numbers breadcrumb items from 1', () => {
    const ld = breadcrumbLd([
      { name: 'House Sums', url: 'https://x.test/' },
      { name: 'Leeds', url: 'https://x.test/rent-vs-buy/leeds/' },
    ]);
    expect(ld['itemListElement']).toEqual([
      { '@type': 'ListItem', position: 1, name: 'House Sums', item: 'https://x.test/' },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Leeds',
        item: 'https://x.test/rent-vs-buy/leeds/',
      },
    ]);
  });

  it('escapes "<" so a value cannot close the script element', () => {
    const text = jsonLdText({ name: '</script><b>' });
    expect(text).not.toContain('<');
    expect(JSON.parse(text)).toEqual({ name: '</script><b>' });
  });
});

describe('sitemap', () => {
  it('escapes the five XML special characters', () => {
    expect(xmlEscape(`a&b<c>d"e'f`)).toBe('a&amp;b&lt;c&gt;d&quot;e&apos;f');
  });

  it('lists each URL once, in order, in a urlset', () => {
    const xml = sitemapXml([
      'https://x.test/HouseSums/',
      'https://x.test/HouseSums/rent-vs-buy/leeds/',
      'https://x.test/HouseSums/',
    ]);
    expect(xml).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        '<url><loc>https://x.test/HouseSums/</loc></url>',
        '<url><loc>https://x.test/HouseSums/rent-vs-buy/leeds/</loc></url>',
        '</urlset>',
        '',
      ].join('\n'),
    );
  });

  it('escapes a URL and rejects one that is not absolute', () => {
    expect(sitemapXml(['https://x.test/?a=1&b=2'])).toContain(
      '<loc>https://x.test/?a=1&amp;b=2</loc>',
    );
    expect(() => sitemapXml(['/HouseSums/'])).toThrow(/absolute/);
  });
});

describe('robots.txt', () => {
  it('allows everything and points at the sitemap', () => {
    expect(robotsTxt('https://x.test/HouseSums/sitemap.xml')).toBe(
      'User-agent: *\nAllow: /\n\nSitemap: https://x.test/HouseSums/sitemap.xml\n',
    );
  });

  it('needs an absolute sitemap URL', () => {
    expect(() => robotsTxt('sitemap.xml')).toThrow(/absolute/);
  });
});
