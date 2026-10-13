/**
 * Network side of the pipeline: finds the latest file for each source, downloads it with
 * retries, and keeps a copy under the raw directory (data/raw/, gitignored) so a run can be
 * repeated offline with --offline. Only the GitHub Action can reach these hosts.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { IADB_BASE, QUOTED_RATE_SERIES, iadbUrl } from './boe.ts';
import { ladQueryUrl, latestLadService, parseServiceList, serviceListUrl } from './geography.ts';
import { PIPR_PAGE } from './sources.ts';
import { addMonths } from './util.ts';

const USER_AGENT =
  'Mozilla/5.0 (compatible; HouseSumsDataRefresh/1.0; +https://github.com/jordanl17/HouseSums)';

export const HPI_BASE =
  'https://publicdata.landregistry.gov.uk/market-trend-data/house-price-index-data';

export interface Downloads {
  hpi: { url: string; text: string };
  pipr: { url: string; edition: string; file: Buffer };
  boe: { url: string; text: string };
  geography: { service: string; json: unknown };
}

interface Fetched {
  status: number;
  body: Buffer;
  contentType: string;
}

async function get(url: string, attempts = 3): Promise<Fetched> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: '*/*' },
        redirect: 'follow',
        signal: AbortSignal.timeout(180_000),
      });
      const body = Buffer.from(await res.arrayBuffer());
      if (res.status >= 500) throw new Error(`HTTP ${res.status}`);
      return { status: res.status, body, contentType: res.headers.get('content-type') ?? '' };
    } catch (error) {
      lastError = error;
      await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    }
  }
  throw new Error(
    `GET ${url} failed: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

async function getOk(url: string): Promise<Fetched> {
  const res = await get(url);
  if (res.status !== 200) throw new Error(`GET ${url}: HTTP ${res.status}`);
  return res;
}

async function getJson(url: string): Promise<unknown> {
  const res = await getOk(url);
  try {
    return JSON.parse(res.body.toString('utf8'));
  } catch {
    throw new Error(`GET ${url}: not JSON`);
  }
}

/** UK HPI: the newest monthly "Average-prices-YYYY-MM.csv", trying back from last month. */
async function fetchHpi(now: Date): Promise<Downloads['hpi']> {
  const thisMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const tried: string[] = [];
  for (let back = 1; back <= 6; back += 1) {
    const url = `${HPI_BASE}/Average-prices-${addMonths(thisMonth, -back)}.csv`;
    const res = await get(url);
    tried.push(`${addMonths(thisMonth, -back)}: ${res.status}`);
    if (res.status === 200 && !/xml|html/i.test(res.contentType)) {
      return { url, text: res.body.toString('utf8') };
    }
  }
  throw new Error(`UK HPI: no Average-prices file found (${tried.join(', ')})`);
}

/** ONS private rents: the newest edition's .xlsx, found through the ONS page's /data JSON. */
async function fetchPipr(): Promise<Downloads['pipr']> {
  const page = (await getJson(`${PIPR_PAGE}/data`)) as { datasets?: { uri?: string }[] };
  const uri = page.datasets?.[0]?.uri;
  if (!uri) throw new Error('ONS private rents: no editions listed');
  const edition = (await getJson(`https://www.ons.gov.uk${uri}/data`)) as {
    downloads?: { file?: string }[];
    description?: { edition?: string };
  };
  const file = edition.downloads?.map((d) => d.file).find((f) => f?.endsWith('.xlsx'));
  if (!file) throw new Error(`ONS private rents: no .xlsx in ${uri}`);
  const url = `https://www.ons.gov.uk/file?uri=${uri}/${file}`;
  const res = await getOk(url);
  return {
    url,
    edition: edition.description?.edition ?? uri.split('/').at(-1) ?? '',
    file: res.body,
  };
}

/** Bank of England: the last 13 months of every quoted-rate series, with descriptions. */
async function fetchBoe(now: Date): Promise<Downloads['boe']> {
  const from = new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth() - 1, 1));
  const url = iadbUrl(
    QUOTED_RATE_SERIES.map((s) => s.code),
    from,
  );
  const res = await getOk(url);
  return { url, text: res.body.toString('utf8') };
}

async function fetchGeography(): Promise<Downloads['geography']> {
  const service = latestLadService(parseServiceList(await getJson(serviceListUrl())));
  if (!service) throw new Error('ONS geography: no LAD_<month>_<year>_UK_NC service found');
  return { service, json: await getJson(ladQueryUrl(service)) };
}

const RAW = {
  hpi: 'uk-hpi-average-prices.csv',
  pipr: 'ons-pipr.xlsx',
  boe: 'boe-quoted-rates.csv',
  geography: 'ons-lad.json',
  meta: 'meta.json',
};

export async function downloadAll(rawDir: string, now = new Date()): Promise<Downloads> {
  const [hpi, pipr, boe, geography] = await Promise.all([
    fetchHpi(now),
    fetchPipr(),
    fetchBoe(now),
    fetchGeography(),
  ]);
  await mkdir(rawDir, { recursive: true });
  await Promise.all([
    writeFile(join(rawDir, RAW.hpi), hpi.text),
    writeFile(join(rawDir, RAW.pipr), pipr.file),
    writeFile(join(rawDir, RAW.boe), boe.text),
    writeFile(join(rawDir, RAW.geography), JSON.stringify(geography.json)),
    writeFile(
      join(rawDir, RAW.meta),
      JSON.stringify(
        {
          hpi: hpi.url,
          pipr: pipr.url,
          edition: pipr.edition,
          boe: boe.url,
          service: geography.service,
        },
        null,
        2,
      ),
    ),
  ]);
  return { hpi, pipr, boe, geography };
}

/** Re-reads the files a previous download saved, for an offline run. */
export async function readRaw(rawDir: string): Promise<Downloads> {
  const meta = JSON.parse(await readFile(join(rawDir, RAW.meta), 'utf8')) as Record<string, string>;
  return {
    hpi: { url: meta['hpi'] ?? '', text: await readFile(join(rawDir, RAW.hpi), 'utf8') },
    pipr: {
      url: meta['pipr'] ?? '',
      edition: meta['edition'] ?? '',
      file: await readFile(join(rawDir, RAW.pipr)),
    },
    boe: { url: meta['boe'] ?? IADB_BASE, text: await readFile(join(rawDir, RAW.boe), 'utf8') },
    geography: {
      service: meta['service'] ?? '',
      json: JSON.parse(await readFile(join(rawDir, RAW.geography), 'utf8')),
    },
  };
}
