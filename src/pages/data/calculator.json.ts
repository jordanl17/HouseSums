/**
 * Static endpoint (phase 6, perf): the calculator island's shared data, built once to
 * dist/data/calculator.json: the defaults, tax rules, rates, nation figures and old-slug aliases,
 * validated at build time (src/lib/calculator-data.ts). Pages used to carry this as serialised
 * island props, about 19.5 KB on each of 362 pages; now it is one file the browser caches.
 *
 * It is JSON, not JavaScript, so it does not count towards the JS budget. Pages ask for it with
 * a hash of its content in the query (calculatorLinks().data) and preload it in the head.
 */
import type { APIRoute } from 'astro';
import { calculatorDataText } from '../../lib/calculator-data';

export const prerender = true;

export const GET: APIRoute = () =>
  new Response(calculatorDataText(), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
