/**
 * How the calculator island gets its shared data (phase 6, perf).
 *
 * Until phase 6 every page with the island carried the defaults, tax rules, rates and nation
 * figures as serialised props: about 19.5 KB of escaped JSON repeated on 362 pages. Now they are
 * one cacheable file, data/calculator.json (src/pages/data/calculator.json.ts), and:
 *
 * - Build time: src/lib/calculator-data.ts registers its validated loader here with
 *   provideIslandData(), so the server render reads the data synchronously and the HTML still
 *   carries the whole answer, chart and breakdown without any JavaScript.
 * - Browser: the head preloads the file (Base.astro `preloads`), and islandData() throws the
 *   request's promise until it arrives. CalculatorIsland.tsx holds the server-rendered DOM
 *   (Hold in deferred.tsx) and hydrates it as soon as the data is in, so nothing on the page
 *   changes or moves while it waits.
 *
 * The file is JSON, not JavaScript: it does not count towards the JS budget, it is parsed with
 * JSON.parse, and the island never imports JSON. The URL carries a hash of its content
 * (calculatorLinks().data), so a page always gets the data it was built with once caches turn
 * over, and the file itself keeps a stable name, so a page cached from before a deploy still
 * finds it.
 */
import type { CalculatorData } from './types';

/** Bump when the shape of data/calculator.json changes in a way old pages cannot read. */
export const ISLAND_DATA_VERSION = 1;

/** The file as served: the island's data plus the version. */
export type IslandDataFile = CalculatorData & { v: number };

/** Wait before each retry of a failed request, in ms. After the last one the island stays static. */
export const RETRY_DELAYS: readonly number[] = [1000, 4000];

let data: CalculatorData | null = null;
let serverSource: (() => CalculatorData) | null = null;
let request: Promise<void> | null = null;

/** Build time only: where the server render reads the data (src/lib/calculator-data.ts). */
export function provideIslandData(source: () => CalculatorData): void {
  serverSource = source;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * A light shape check of the fetched file (the full validation ran at build time, and the
 * schema code is too big to ship): the version and the four objects the island reads.
 */
export function isIslandDataFile(json: unknown): json is IslandDataFile {
  if (!isObject(json) || json.v !== ISLAND_DATA_VERSION) return false;
  const { defaults, taxRules, rates, areasMeta } = json;
  return (
    isObject(defaults) &&
    isObject(defaults.fields) &&
    isObject(taxRules) &&
    isObject(taxRules.regimes) &&
    isObject(rates) &&
    Array.isArray(rates.rates) &&
    isObject(areasMeta) &&
    isObject(areasMeta.nations)
  );
}

/** Strips the version: what the island takes as `data`. */
export function fromFile(file: IslandDataFile): CalculatorData {
  const { v: _version, ...rest } = file;
  return rest;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function fetchData(url: string): Promise<CalculatorData> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await fetch(url, { credentials: 'same-origin' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json: unknown = await response.json();
      if (!isIslandDataFile(json)) throw new Error('calculator.json has an unexpected shape');
      return fromFile(json);
    } catch (error) {
      const delay = RETRY_DELAYS[attempt];
      if (delay === undefined) throw error;
      await wait(delay);
    }
  }
}

/**
 * Starts loading the data (once) and returns a promise that settles only when the data is in.
 * After the retries fail it never settles: the page keeps its server-rendered answer and the
 * calculator simply never comes alive, which is better than a broken one.
 */
export function loadIslandData(url: string): Promise<void> {
  request ??= fetchData(url).then(
    (loaded) => {
      data = loaded;
    },
    () => new Promise<void>(() => {}),
  );
  return request;
}

/**
 * The island's data. On the server it comes from the build-time loader; in the browser it is
 * the fetched file, and until that arrives this throws the pending request (a promise), which
 * Hold in deferred.tsx catches to keep the server-rendered DOM as it is.
 */
export function islandData(url: string): CalculatorData {
  if (data) return data;
  if (serverSource) {
    data = serverSource();
    return data;
  }
  if (typeof window === 'undefined') {
    throw new Error(
      'islandData: no data on the server. Import src/lib/calculator-data.ts in the page (calculatorLinks() does).',
    );
  }
  throw loadIslandData(url);
}
