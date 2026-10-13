import fc from 'fast-check';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
    expect(normaliseBase('//')).toBe('/');
    expect(normaliseBase('  ')).toBe('/');
  });

  it('trims whitespace and repeated slashes', () => {
    expect(normaliseBase(' /HouseSums/ ')).toBe('/HouseSums/');
    expect(normaliseBase('//HouseSums//')).toBe('/HouseSums/');
  });

  it('keeps nested bases and collapses repeated slashes inside them', () => {
    expect(normaliseBase('/sites/HouseSums')).toBe('/sites/HouseSums/');
    expect(normaliseBase('sites//HouseSums')).toBe('/sites/HouseSums/');
  });
});

describe('joinBase', () => {
  it('returns the base for the home page', () => {
    expect(joinBase('/HouseSums', '')).toBe('/HouseSums/');
    expect(joinBase('/HouseSums/', '/')).toBe('/HouseSums/');
    expect(joinBase('/HouseSums/')).toBe('/HouseSums/');
    expect(joinBase('/', '')).toBe('/');
    expect(joinBase('', '/')).toBe('/');
  });

  it('adds a trailing slash to page paths', () => {
    expect(joinBase('/HouseSums/', 'rent-vs-buy/leeds')).toBe('/HouseSums/rent-vs-buy/leeds/');
    expect(joinBase('/HouseSums/', '/sources')).toBe('/HouseSums/sources/');
    expect(joinBase('/', 'sources/')).toBe('/sources/');
  });

  it('strips leading slashes and collapses repeated slashes in the path', () => {
    expect(joinBase('/HouseSums/', 'rent-vs-buy//leeds')).toBe('/HouseSums/rent-vs-buy/leeds/');
    expect(joinBase('/HouseSums/', 'sources//')).toBe('/HouseSums/sources/');
    expect(joinBase('/HouseSums', '/rent-vs-buy/')).toBe('/HouseSums/rent-vs-buy/');
  });

  it('treats slashes with no host as an internal path, not a protocol-relative URL', () => {
    expect(joinBase('/HouseSums/', '//')).toBe('/HouseSums/');
    expect(joinBase('/HouseSums/', '///sources')).toBe('/HouseSums/sources/');
  });

  it('keeps a trailing slash after a dotted segment, so it stays a page', () => {
    expect(joinBase('/HouseSums/', 'v1.2/')).toBe('/HouseSums/v1.2/');
  });

  it('leaves file paths alone', () => {
    expect(joinBase('/HouseSums/', 'favicon.svg')).toBe('/HouseSums/favicon.svg');
    expect(joinBase('/HouseSums/', '/data/areas.json')).toBe('/HouseSums/data/areas.json');
    expect(joinBase('/', 'og/leeds.PNG')).toBe('/og/leeds.PNG');
  });

  it('only treats an extension on the last segment as a file', () => {
    expect(joinBase('/HouseSums/', 'v1.2/sources')).toBe('/HouseSums/v1.2/sources/');
  });

  it('keeps query strings and hashes after the slash', () => {
    expect(joinBase('/HouseSums/', 'rent-vs-buy/leeds?price=300000#chart')).toBe(
      '/HouseSums/rent-vs-buy/leeds/?price=300000#chart',
    );
    expect(joinBase('/HouseSums/', 'sources#ons')).toBe('/HouseSums/sources/#ons');
    expect(joinBase('/HouseSums/', 'favicon.svg?v=2')).toBe('/HouseSums/favicon.svg?v=2');
  });

  it('handles a bare query string or hash', () => {
    expect(joinBase('/HouseSums/', '?price=300000')).toBe('/HouseSums/?price=300000');
    expect(joinBase('/HouseSums/', '#answer')).toBe('/HouseSums/#answer');
  });

  it('does not touch slashes inside the query string', () => {
    expect(joinBase('/HouseSums/', 'go?to=a//b')).toBe('/HouseSums/go/?to=a//b');
  });

  it('returns external URLs unchanged', () => {
    expect(joinBase('/HouseSums/', 'https://www.gov.uk/')).toBe('https://www.gov.uk/');
    expect(joinBase('/HouseSums/', 'http://example.com/a')).toBe('http://example.com/a');
    expect(joinBase('/HouseSums/', 'mailto:hello@example.com')).toBe('mailto:hello@example.com');
    expect(joinBase('/HouseSums/', '//cdn.example.com/x.js')).toBe('//cdn.example.com/x.js');
  });

  it('works with a nested base', () => {
    expect(joinBase('/sites/HouseSums', 'sources')).toBe('/sites/HouseSums/sources/');
  });
});

describe('joinBase properties', () => {
  // Path segments made of the characters real slugs and file names use.
  const segment = fc.stringMatching(/^[a-z0-9-]{1,12}(\.[a-z0-9]{1,4})?$/);
  const slashes = fc.stringMatching(/^\/{0,3}$/);
  const separator = fc.stringMatching(/^\/{1,3}$/);
  // Internal paths: at most one leading slash (two would make a protocol-relative URL),
  // segments separated by one or more slashes, and an optional run of trailing slashes.
  const internalPath = fc
    .tuple(
      fc.constantFrom('', '/'),
      fc.array(fc.tuple(segment, separator), { maxLength: 5 }),
      segment,
      slashes,
    )
    .map(
      ([lead, parts, last, trail]) =>
        lead + parts.map(([seg, sep]) => seg + sep).join('') + last + trail,
    );
  const base = fc
    .array(fc.stringMatching(/^[A-Za-z0-9-]{1,10}$/), { maxLength: 3 })
    .chain((parts) =>
      fc
        .tuple(slashes, slashes)
        .map(([lead, trail]) => (parts.length === 0 ? lead : lead + parts.join('/') + trail)),
    );

  it('always starts with the normalised base', () => {
    fc.assert(
      fc.property(base, internalPath, (b, p) => {
        expect(joinBase(b, p).startsWith(normaliseBase(b))).toBe(true);
      }),
    );
  });

  it('never contains a double slash', () => {
    fc.assert(
      fc.property(base, internalPath, (b, p) => {
        expect(joinBase(b, p)).not.toContain('//');
      }),
    );
  });

  it('ends pages with a slash and files with their extension', () => {
    fc.assert(
      fc.property(base, internalPath, (b, p) => {
        const result = joinBase(b, p);
        const last = p.split('/').pop() ?? '';
        if (last.includes('.')) {
          expect(result.endsWith(`/${last}`)).toBe(true);
        } else {
          expect(result.endsWith('/')).toBe(true);
        }
      }),
    );
  });

  it('is stable when the result is joined again under the root', () => {
    fc.assert(
      fc.property(base, internalPath, (b, p) => {
        const once = joinBase(b, p);
        expect(joinBase('/', once)).toBe(once);
      }),
    );
  });

  it('gives the same result for a path that was already joined under the root', () => {
    fc.assert(
      fc.property(base, internalPath, (b, p) => {
        expect(joinBase(b, joinBase('/', p))).toBe(joinBase(b, p));
      }),
    );
  });

  it('normaliseBase is idempotent', () => {
    fc.assert(
      fc.property(base, (b) => {
        expect(normaliseBase(normaliseBase(b))).toBe(normaliseBase(b));
      }),
    );
  });
});

describe('url', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses the configured base path', () => {
    expect(url('sources')).toBe(joinBase(import.meta.env.BASE_URL, 'sources'));
  });

  it('builds URLs under the GitHub Pages base path', () => {
    vi.stubEnv('BASE_URL', '/HouseSums/');
    expect(url()).toBe('/HouseSums/');
    expect(url('sources')).toBe('/HouseSums/sources/');
    expect(url('favicon.svg')).toBe('/HouseSums/favicon.svg');
  });

  it('builds URLs at the root for a custom domain', () => {
    vi.stubEnv('BASE_URL', '/');
    expect(url()).toBe('/');
    expect(url('/rent-vs-buy/leeds')).toBe('/rent-vs-buy/leeds/');
  });
});
