import { describe, expect, it } from 'vitest';
import {
  areaDescription,
  areaTitle,
  breadcrumbLd,
  canonicalUrl,
  fullTitle,
  jsonLdText,
  nationTitle,
  ogImagePath,
  webApplicationLd,
  withTrailingSlash,
} from './seo';

describe('titles', () => {
  it('adds the site name', () => {
    expect(fullTitle()).toBe('House Sums');
    expect(fullTitle('Sources')).toBe('Sources | House Sums');
  });

  it('builds area and nation titles', () => {
    expect(areaTitle('Leeds')).toBe('Rent or buy in Leeds? See your break-even year');
    expect(nationTitle('ni')).toBe('Rent or buy in Northern Ireland? Break-even years by area');
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
