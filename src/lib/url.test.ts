import { describe, expect, it } from 'vitest';
import { joinBase, normaliseBase, url } from './url';

describe('normaliseBase', () => {
  it('adds leading and trailing slashes', () => {
    expect(normaliseBase('HouseSums')).toBe('/HouseSums/');
    expect(normaliseBase('/HouseSums')).toBe('/HouseSums/');
    expect(normaliseBase('/HouseSums/')).toBe('/HouseSums/');
  });

  it('treats an empty or root base as /', () => {
    expect(normaliseBase('')).toBe('/');
    expect(normaliseBase('/')).toBe('/');
  });
});

describe('joinBase', () => {
  it('returns the base for the home page', () => {
    expect(joinBase('/HouseSums', '')).toBe('/HouseSums/');
    expect(joinBase('/HouseSums/', '/')).toBe('/HouseSums/');
    expect(joinBase('/', '')).toBe('/');
  });

  it('adds a trailing slash to page paths', () => {
    expect(joinBase('/HouseSums/', 'rent-vs-buy/leeds')).toBe('/HouseSums/rent-vs-buy/leeds/');
    expect(joinBase('/HouseSums/', '/sources')).toBe('/HouseSums/sources/');
    expect(joinBase('/', 'sources/')).toBe('/sources/');
  });

  it('leaves file paths alone', () => {
    expect(joinBase('/HouseSums/', 'favicon.svg')).toBe('/HouseSums/favicon.svg');
  });

  it('keeps query strings and hashes after the slash', () => {
    expect(joinBase('/HouseSums/', 'rent-vs-buy/leeds?price=300000#chart')).toBe(
      '/HouseSums/rent-vs-buy/leeds/?price=300000#chart',
    );
  });

  it('returns external URLs unchanged', () => {
    expect(joinBase('/HouseSums/', 'https://www.gov.uk/')).toBe('https://www.gov.uk/');
  });
});

describe('url', () => {
  it('uses the configured base path', () => {
    expect(url('sources')).toBe(joinBase(import.meta.env.BASE_URL, 'sources'));
  });
});
