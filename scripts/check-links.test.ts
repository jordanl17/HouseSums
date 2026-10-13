import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  checkSite,
  cssUrls,
  decodeEntities,
  fileUrl,
  parseAttributes,
  readSite,
  resolveRef,
  scanHtml,
  startTags,
  urlsInIslandProps,
} from './check-links.mjs';
import { normaliseBase, siteConfig } from './lib/site.mjs';

const SITE = { origin: 'https://x.test', base: '/HouseSums/' };
const ROOT_SITE = { origin: 'https://x.test', base: '/' };

const page = (head: string, body: string) =>
  `<!doctype html><html lang="en-GB"><head>${head}</head><body>${body}</body></html>`;

describe('HTML parsing', () => {
  it('decodes character references', () => {
    expect(decodeEntities('a&amp;b&quot;c&#39;d&#x2F;e&#47;')).toBe('a&b"c\'d/e/');
  });

  it('reads quoted, unquoted and bare attributes', () => {
    expect(parseAttributes(` href="/a?x=1&amp;y=2" data-x='q' hidden id=main`)).toEqual({
      href: '/a?x=1&y=2',
      'data-x': 'q',
      hidden: '',
      id: 'main',
    });
  });

  it('ignores markup inside comments, scripts and styles', () => {
    const tags = startTags(
      '<!-- <a href="/gone/"> --><script>const s = "<a href=\'/nope/\'>";</script><style>a{}</style><a href="/yes/">',
    );
    expect(tags.filter((t) => t.tag === 'a').map((t) => t.attrs['href'])).toEqual(['/yes/']);
  });

  it('finds base-path URLs in island props', () => {
    const props =
      '{"links":[0,{"areaList":[0,"/HouseSums/data/area-list.json"],"howItWorks":[0,"/HouseSums/how-it-works/"]}],"other":[0,"/elsewhere"]}';
    expect(urlsInIslandProps(props, '/HouseSums/')).toEqual([
      '/HouseSums/data/area-list.json',
      '/HouseSums/how-it-works/',
    ]);
    expect(urlsInIslandProps('{"a":[0,"/"],"b":[0,"/data/x.json"]}', '/')).toEqual([
      '/data/x.json',
    ]);
  });

  it('collects links, assets, meta URLs, srcset, anchors, canonical and noindex', () => {
    const scan = scanHtml(
      page(
        '<link rel="canonical" href="https://x.test/HouseSums/a/"><meta property="og:image" content="https://x.test/HouseSums/og/default.png"><meta name="robots" content="noindex"><link rel="stylesheet" href="/HouseSums/_astro/a.css">',
        '<a id="top" href="b/">B</a><img src="i.png" srcset="i-1.png 1x, i-2.png 2x"><astro-island component-url="/HouseSums/_astro/c.js" renderer-url="/HouseSums/_astro/r.js" props="{}"></astro-island>',
      ),
      '/HouseSums/',
    );
    expect(scan.refs.map((r) => r.value)).toEqual([
      'https://x.test/HouseSums/a/',
      'https://x.test/HouseSums/og/default.png',
      '/HouseSums/_astro/a.css',
      'b/',
      'i.png',
      'i-1.png',
      'i-2.png',
      '/HouseSums/_astro/c.js',
      '/HouseSums/_astro/r.js',
    ]);
    expect(scan.canonical).toBe('https://x.test/HouseSums/a/');
    expect(scan.noindex).toBe(true);
    expect([...scan.anchors]).toEqual(['top']);
  });

  it('reads url() and @import from CSS', () => {
    expect(
      cssUrls(
        `@import "x.css"; /* url(gone.png) */ a{background:url(./f.woff2)} b{src:url("g.woff") format("woff"), url('h.svg')}`,
      ),
    ).toEqual(['./f.woff2', 'g.woff', 'h.svg', 'x.css']);
  });
});

describe('resolveRef', () => {
  const from = 'https://x.test/HouseSums/rent-vs-buy/leeds/';

  it('maps page URLs to index.html and keeps file paths', () => {
    expect(resolveRef('../', from, SITE)).toEqual({
      kind: 'internal',
      file: 'rent-vs-buy/index.html',
      fragment: null,
    });
    expect(resolveRef('/HouseSums/', from, SITE)).toMatchObject({ file: 'index.html' });
    expect(resolveRef('/HouseSums/og/default.png', from, SITE)).toMatchObject({
      file: 'og/default.png',
    });
    expect(resolveRef('/HouseSums/sources/#licences', from, SITE)).toEqual({
      kind: 'internal',
      file: 'sources/index.html',
      fragment: 'licences',
    });
    expect(resolveRef('?a=bristol', from, SITE)).toMatchObject({
      file: 'rent-vs-buy/leeds/index.html',
    });
    expect(resolveRef('#main', from, SITE)).toMatchObject({ fragment: 'main' });
  });

  it('treats other origins and non-web schemes as external', () => {
    expect(resolveRef('https://www.ons.gov.uk/', from, SITE)).toEqual({ kind: 'external' });
    expect(resolveRef('mailto:a@b.test', from, SITE)).toEqual({ kind: 'external' });
    expect(resolveRef('data:image/png;base64,AAA', from, SITE)).toEqual({ kind: 'external' });
  });

  it('rejects paths outside the base, pages without a trailing slash and empty URLs', () => {
    expect(resolveRef('/sources/', from, SITE)).toMatchObject({
      kind: 'error',
      reason: expect.stringMatching(/outside the base path/),
    });
    expect(resolveRef('/HouseSums/sources', from, SITE)).toMatchObject({
      kind: 'error',
      reason: expect.stringMatching(/trailing slash/),
    });
    expect(resolveRef('', from, SITE)).toMatchObject({ kind: 'error' });
    expect(resolveRef('javascript:void(0)', from, SITE)).toMatchObject({ kind: 'error' });
  });

  it('works at the root base path', () => {
    expect(resolveRef('/sources/', 'https://x.test/', ROOT_SITE)).toMatchObject({
      file: 'sources/index.html',
    });
    expect(fileUrl('rent-vs-buy/leeds/index.html', ROOT_SITE)).toBe(
      'https://x.test/rent-vs-buy/leeds/',
    );
    expect(fileUrl('index.html', SITE)).toBe('https://x.test/HouseSums/');
  });
});

describe('checkSite', () => {
  const canonical = (rel: string) =>
    `<link rel="canonical" href="https://x.test/HouseSums/${rel}">`;

  const site = () =>
    new Map<string, string | null>([
      [
        'index.html',
        page(
          `${canonical('')}<link rel="stylesheet" href="/HouseSums/_astro/s.css">`,
          '<main id="main"><a href="/HouseSums/a/">A</a><a href="#main">Skip</a><a href="https://example.test/">Out</a></main>',
        ),
      ],
      ['a/index.html', page(canonical('a/'), '<a href="../">Home</a><h2 id="x">X</h2>')],
      ['_astro/s.css', '@font-face{src:url(./f.woff2)}'],
      ['_astro/f.woff2', null],
      ['sitemap.xml', '<urlset><url><loc>https://x.test/HouseSums/a/</loc></url></urlset>'],
      ['robots.txt', 'User-agent: *\nSitemap: https://x.test/HouseSums/sitemap.xml\n'],
    ]);

  it('passes a site whose links all resolve', () => {
    const result = checkSite(site(), SITE);
    expect(result.problems).toEqual([]);
    expect(result.orphans).toEqual([]);
    expect(result.pages).toBe(2);
    expect(result.external).toBe(1);
  });

  it('reports missing pages, assets, fragments, sitemap entries and orphans', () => {
    const files = site();
    files.set(
      'a/index.html',
      page(
        canonical('a/'),
        '<a href="/HouseSums/gone/">Gone</a><a href="/HouseSums/#nope">Nope</a><img src="/HouseSums/og/x.png">',
      ),
    );
    files.set('_astro/s.css', '@font-face{src:url(./missing.woff2)}');
    files.set('sitemap.xml', '<urlset><url><loc>https://x.test/HouseSums/b/</loc></url></urlset>');
    files.set('lost/index.html', page(canonical('lost/'), '<p>No one links here</p>'));
    files.set(
      'hidden/index.html',
      page('<meta name="robots" content="noindex">', '<p>Unlisted is fine</p>'),
    );

    const result = checkSite(files, SITE);
    expect(result.problems.map((p) => [p.from, p.url, p.reason])).toEqual([
      ['a/index.html', '/HouseSums/gone/', 'no such file: gone/index.html'],
      ['a/index.html', '/HouseSums/#nope', 'no element with id "nope"'],
      ['a/index.html', '/HouseSums/og/x.png', 'no such file: og/x.png'],
      ['_astro/s.css', './missing.woff2', 'no such file: _astro/missing.woff2'],
      ['sitemap.xml', 'https://x.test/HouseSums/b/', 'no such file: b/index.html'],
    ]);
    expect(result.orphans).toEqual(['lost/index.html']);
  });
});

describe('site config', () => {
  it('uses the same defaults as astro.config.mjs', () => {
    const config = siteConfig({});
    expect(config.base).toBe('/HouseSums/');
    expect(config.siteRoot).toBe('https://jordanl17.github.io/HouseSums/');
    expect(config.distDir).toMatch(/[/\\]dist$/);
  });

  it('follows SITE_URL, BASE_PATH and DIST_DIR', () => {
    const config = siteConfig({
      SITE_URL: 'https://housesums.co.uk',
      BASE_PATH: '/',
      DIST_DIR: '/tmp/dist-root',
    });
    expect(config.siteRoot).toBe('https://housesums.co.uk/');
    expect(config.distDir).toBe(path.resolve('/tmp/dist-root'));
    expect(normaliseBase('HouseSums//')).toBe('/HouseSums/');
  });
});

describe('readSite', () => {
  const dirs: string[] = [];
  afterAll(async () => {
    await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('reads text files and marks binary files', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'check-links-'));
    dirs.push(dir);
    await mkdir(path.join(dir, 'a'), { recursive: true });
    await writeFile(path.join(dir, 'index.html'), '<a href="a/">A</a>');
    await writeFile(path.join(dir, 'a', 'index.html'), '<p>A</p>');
    await writeFile(path.join(dir, 'a', 'x.png'), 'png');
    const files = await readSite(dir);
    expect([...files.keys()].sort()).toEqual(['a/index.html', 'a/x.png', 'index.html']);
    expect(files.get('a/x.png')).toBeNull();
    expect(files.get('index.html')).toBe('<a href="a/">A</a>');
  });
});
