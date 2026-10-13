/**
 * Static endpoint: the compact area list the calculator island fetches (see src/lib/area-list.ts).
 * Built once to dist/data/area-list.json from data/areas.json, validated on the way. It is JSON,
 * not JavaScript, so it does not count towards the JS budget and is only downloaded when the
 * calculator needs it.
 */
import type { APIRoute } from 'astro';
import areasJson from '../../../data/areas.json';
import { toAreaList } from '../../lib/area-list';
import { parseAreasFile } from '../../lib/schema';

export const prerender = true;

export const GET: APIRoute = () =>
  new Response(JSON.stringify(toAreaList(parseAreasFile(areasJson))), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
