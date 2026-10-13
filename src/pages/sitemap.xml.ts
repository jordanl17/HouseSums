/**
 * Static endpoint: dist/sitemap.xml, every indexable page as an absolute URL under the site and
 * base path. A static endpoint rather than @astrojs/sitemap: the list is short and known at
 * build time, it needs no new dependency, and it follows url()'s trailing-slash policy exactly.
 *
 * Left out: /styleguide/ and the 404 page (both noindex) and data files. The page-quality tests
 * (npm run check:pages) fail if this list and the built pages with a canonical link ever differ,
 * so a new page cannot be forgotten here.
 */
import type { APIRoute } from 'astro';
import { areaPath, nationPath, nationsIndexPath, rentVsBuyPaths } from '../lib/areas';
import { absoluteUrl, sitemapXml } from '../lib/seo';
import { url } from '../lib/url';

export const prerender = true;

export const GET: APIRoute = ({ site, url: requestUrl }) => {
  const origin = site ?? requestUrl;
  const paths = [
    url(),
    url('how-it-works'),
    url('sources'),
    url('about'),
    nationsIndexPath(),
    ...rentVsBuyPaths().map(({ props }) =>
      props.kind === 'nation' ? nationPath(props.nation) : areaPath(props.area),
    ),
  ];
  return new Response(sitemapXml(paths.map((path) => absoluteUrl(path, origin))), {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
