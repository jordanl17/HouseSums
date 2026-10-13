/**
 * Static endpoint: dist/robots.txt, allowing everything and naming the sitemap's absolute URL.
 * Under GitHub Pages' base path crawlers will not read it (robots.txt only counts at the root of
 * a host); with a custom domain at BASE_PATH=/ it sits at the root and takes effect.
 */
import type { APIRoute } from 'astro';
import { absoluteUrl, robotsTxt } from '../lib/seo';
import { url } from '../lib/url';

export const prerender = true;

export const GET: APIRoute = ({ site, url: requestUrl }) =>
  new Response(robotsTxt(absoluteUrl(url('sitemap.xml'), site ?? requestUrl)), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
