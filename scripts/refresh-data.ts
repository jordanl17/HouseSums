/**
 * Monthly data refresh: fetch UK HPI, ONS private rents, Bank of England quoted rates and ONS
 * local authority names; build data/areas.json, rates.json and sources.json; check them against
 * the committed files; write them only if every check passes.
 *
 * Run: npm run data:refresh -- [options]   (needs network access to the data hosts)
 *   --out <dir>          where to write the JSON (default data/)
 *   --raw <dir>          where to keep the downloads (default data/raw/, gitignored)
 *   --offline            rebuild from the downloads in --raw instead of fetching
 *   --summary <file>     also write the Markdown summary here
 *   --mode <label>       label for the summary (e.g. "dry run", "scheduled")
 *   --allow-count-drop   accept areas disappearing (e.g. after a boundary change)
 *   --allow-moves        accept moves over the month-on-month limits
 *
 * Exit code 1 when a check fails; nothing is written to --out in that case. Writes
 * `changed=true|false` to $GITHUB_OUTPUT and the summary to $GITHUB_STEP_SUMMARY when set.
 */
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import type { AreasFile, RatesFile, SourcesFile } from '../src/lib/types.ts';
import { parseAreasFile, parseRatesFile } from '../src/lib/schema.ts';
import { parseIadbCsv } from './data/boe.ts';
import { parseBrmaMap } from './data/brma.ts';
import { buildAreas, buildRates } from './data/build.ts';
import { downloadAll, readRaw } from './data/fetch.ts';
import { parseLadQuery } from './data/geography.ts';
import { parseHpiAveragePrices } from './data/hpi.ts';
import { PIPR_SHEET, parsePiprRows } from './data/pipr.ts';
import { buildSources, serviceMonth } from './data/sources.ts';
import { renderSummary } from './data/summary.ts';
import {
  checkAreas,
  checkBrmaMap,
  checkRates,
  checkSources,
  mergeResults,
  type CheckResult,
} from './data/validate.ts';
import { readXlsxSheet } from './data/xlsx.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const { values: args } = parseArgs({
  options: {
    out: { type: 'string', default: join(root, 'data') },
    raw: { type: 'string', default: join(root, 'data', 'raw') },
    offline: { type: 'boolean', default: false },
    summary: { type: 'string' },
    mode: { type: 'string', default: 'local' },
    'allow-count-drop': { type: 'boolean', default: false },
    'allow-moves': { type: 'boolean', default: false },
  },
});

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return null;
  }
}

function tryParse<T>(parse: (v: unknown) => T, value: unknown): T | null {
  if (value === null) return null;
  try {
    return parse(value);
  } catch {
    return null;
  }
}

const serialise = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

/** Same data apart from generatedAt? */
function sameData(a: { generatedAt: string } | null, b: { generatedAt: string } | null): boolean {
  if (!a || !b) return false;
  return serialise({ ...a, generatedAt: '' }) === serialise({ ...b, generatedAt: '' });
}

async function report(summary: string): Promise<void> {
  console.log(summary);
  if (args.summary) await writeFile(args.summary, summary);
  if (process.env['GITHUB_STEP_SUMMARY'])
    await appendFile(process.env['GITHUB_STEP_SUMMARY'], summary);
}

async function setOutput(name: string, value: string): Promise<void> {
  if (process.env['GITHUB_OUTPUT'])
    await appendFile(process.env['GITHUB_OUTPUT'], `${name}=${value}\n`);
}

async function main(): Promise<number> {
  const dataDir = join(root, 'data');
  const prevAreas = tryParse(parseAreasFile, await readJson(join(dataDir, 'areas.json')));
  const prevRates = tryParse(parseRatesFile, await readJson(join(dataDir, 'rates.json')));
  const prevSources = (await readJson(join(dataDir, 'sources.json'))) as SourcesFile | null;
  const prev = { areas: prevAreas, rates: prevRates };
  const mode = args.mode ?? 'local';
  const rawDir = resolve(args.raw ?? join(dataDir, 'raw'));

  let built: { areas: AreasFile; rates: RatesFile; sources: SourcesFile };
  let checks: CheckResult;
  let notes: string[];
  try {
    const downloads = args.offline ? await readRaw(rawDir) : await downloadAll(rawDir);
    const generatedAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    const brmaMap = parseBrmaMap(await readJson(join(dataDir, 'brma-map.json')));
    const prices = parseHpiAveragePrices(downloads.hpi.text);
    const rents = parsePiprRows(readXlsxSheet(downloads.pipr.file, PIPR_SHEET, 8));
    const iadb = parseIadbCsv(downloads.boe.text);
    const localAuthorities = parseLadQuery(downloads.geography.json);
    const areas = buildAreas({ generatedAt, localAuthorities, prices, rents, brmaMap });
    const rates = buildRates(iadb, generatedAt);
    const sources = buildSources({
      generatedAt,
      hpi: { url: downloads.hpi.url, asOf: areas.file.asOf.price },
      pipr: {
        url: downloads.pipr.url,
        edition: downloads.pipr.edition,
        asOf: areas.file.asOf.rent,
      },
      boe: { asOf: rates.file.asOf, descriptions: iadb.descriptions },
      geography: {
        service: downloads.geography.service,
        asOf: serviceMonth(downloads.geography.service) ?? areas.file.asOf.price,
      },
    });
    built = { areas: areas.file, rates: rates.file, sources };
    notes = [...areas.notes, ...rates.notes];
    const options = { allowCountDrop: args['allow-count-drop'], allowMoves: args['allow-moves'] };
    checks = mergeResults(
      { errors: [...areas.errors, ...rates.errors], warnings: [] },
      checkAreas(built.areas, prevAreas, options),
      checkRates(built.rates, prevRates, options),
      checkSources(built.sources),
      checkBrmaMap(built.areas, brmaMap),
    );
  } catch (error) {
    const failure = error instanceof Error ? error.message : String(error);
    await report(
      renderSummary({
        mode,
        next: null,
        prev,
        checks: { errors: [failure], warnings: [] },
        notes: [],
        failure,
      }),
    );
    await setOutput('changed', 'false');
    return 1;
  }

  await report(renderSummary({ mode, next: built, prev, checks, notes }));
  if (checks.errors.length > 0) {
    await setOutput('changed', 'false');
    return 1;
  }
  const unchanged =
    sameData(built.areas, prevAreas) &&
    sameData(built.rates, prevRates) &&
    sameData(built.sources, prevSources);
  const outDir = resolve(args.out ?? dataDir);
  if (unchanged && outDir === resolve(dataDir)) {
    console.log('No changes since the committed data; nothing written.');
    await setOutput('changed', 'false');
    return 0;
  }
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'areas.json'), serialise(built.areas));
  await writeFile(join(outDir, 'rates.json'), serialise(built.rates));
  await writeFile(join(outDir, 'sources.json'), serialise(built.sources));
  console.log(`Wrote areas.json, rates.json and sources.json to ${outDir}`);
  await setOutput('changed', unchanged ? 'false' : 'true');
  return 0;
}

process.exitCode = await main();
