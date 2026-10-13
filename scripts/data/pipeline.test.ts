import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseAreasFile, parseRatesFile, parseSourcesFile } from '../../src/lib/schema.ts';
import type { AreasFile, RatesFile } from '../../src/lib/types.ts';
import { parseIadbCsv } from './boe.ts';
import { parseBrmaMap } from './brma.ts';
import { buildAreas, buildRates } from './build.ts';
import {
  BRMA_MAP,
  HPI_SERIES,
  IADB_TT,
  LADS,
  PIPR_AREAS,
  areasFile,
  hpiCsv,
  piprRows,
} from './fixtures.ts';
import { parseHpiAveragePrices } from './hpi.ts';
import { parsePiprRows } from './pipr.ts';
import { buildSources } from './sources.ts';
import { renderSummary } from './summary.ts';
import { validateDirectory } from './validate-files.ts';
import { checkAreas, checkBrmaMap, checkRates, checkSources } from './validate.ts';

const dataDir = fileURLToPath(new URL('../../data/', import.meta.url));
const GENERATED = '2026-10-20T06:17:00Z';

function build(
  overrides: { lads?: typeof LADS; pipr?: typeof PIPR_AREAS; hpi?: typeof HPI_SERIES } = {},
) {
  return buildAreas({
    generatedAt: GENERATED,
    localAuthorities: overrides.lads ?? LADS,
    prices: parseHpiAveragePrices(hpiCsv(overrides.hpi ?? HPI_SERIES)),
    rents: parsePiprRows(piprRows(overrides.pipr ?? PIPR_AREAS)),
    brmaMap: BRMA_MAP,
  });
}

const byCode = (file: AreasFile, code: string) => file.areas.find((a) => a.code === code)!;

describe('buildAreas', () => {
  const { file, errors, notes } = build();

  it('produces a file that matches the schema, sorted by name', () => {
    expect(errors).toEqual([]);
    expect(() => parseAreasFile(file)).not.toThrow();
    expect(file.areas.map((a) => a.slug)).toEqual([
      'belfast',
      'cardiff',
      'glasgow-city',
      'isles-of-scilly',
      'leeds',
      'westminster',
    ]);
    expect(file.asOf).toEqual({ price: '2026-07', rent: '2026-08' });
  });

  it('uses the ONS name and local figures, unclamped, with rates as decimals', () => {
    const westminster = byCode(file, 'E09000033');
    expect(westminster).toMatchObject({
      name: 'Westminster',
      nation: 'eng',
      price: 900000,
      rent: 3200,
      rentGrowth: -0.006,
      fallbacks: [],
    });
    expect(westminster.growth10y).toBeCloseTo(0.01, 4);
    expect(westminster.asOf).toBeUndefined();
  });

  it('takes Scottish and NI rents from the mapped BRMA and records it', () => {
    expect(byCode(file, 'S12000049')).toMatchObject({
      rent: 1270,
      rentGrowth: 0.0125,
      rentArea: 'Greater Glasgow',
    });
    expect(byCode(file, 'N09000003')).toMatchObject({
      price: 180000,
      rent: 1130,
      rentArea: 'Belfast',
      asOf: { price: '2026-06', rent: '2026-06' },
    });
  });

  it('falls back to the nation figure, lists it, and says why', () => {
    expect(byCode(file, 'E06000053')).toMatchObject({
      price: 300000,
      rent: 1450,
      rentGrowth: 0.04,
      fallbacks: ['price', 'growth10y', 'rent', 'rentGrowth'],
    });
    expect(notes.join('\n')).toMatch(/Isles of Scilly .*not in UK HPI/);
    expect(notes.join('\n')).toMatch(/Isles of Scilly .*not in ONS private rents/);
  });

  it('records the nation months when they differ from the file (NI)', () => {
    expect(file.nations.ni).toMatchObject({
      price: 190000,
      rent: 870,
      asOf: { price: '2026-06', rent: '2026-06' },
    });
    expect(file.nations.eng.asOf).toBeUndefined();
  });

  it('fails rather than invent a nation figure', () => {
    const result = build({ pipr: PIPR_AREAS.filter((a) => a.code !== 'S92000003') });
    expect(result.errors).toContain('sco: no nation-level ONS private rent (S92000003)');
  });

  it('fails when a Scottish or NI council is missing from the BRMA map or its BRMA is gone', () => {
    const extra = build({ lads: [...LADS, { code: 'S12000036', name: 'City of Edinburgh' }] });
    expect(extra.errors).toContain('City of Edinburgh (S12000036): no entry in data/brma-map.json');
    const gone = build({ pipr: PIPR_AREAS.filter((a) => a.name !== 'Belfast BRMA') });
    expect(gone.errors.join('\n')).toMatch(/rental area "Belfast" .* not found/);
  });

  it('treats a stale local figure as missing', () => {
    const stale = build({
      pipr: PIPR_AREAS.map((a) => (a.code === 'E08000035' ? { ...a, month: '2025-12' } : a)),
    });
    expect(byCode(stale.file, 'E08000035').fallbacks).toEqual(['rent', 'rentGrowth']);
    expect(stale.notes.join('\n')).toMatch(/Leeds: ONS rent is from 2025-12, too old/);
  });
});

describe('buildRates', () => {
  it('takes the latest month of each series and checks the descriptions', () => {
    const { file, errors } = buildRates(parseIadbCsv(IADB_TT), GENERATED);
    expect(errors).toEqual([]);
    expect(() => parseRatesFile(file)).not.toThrow();
    expect(file.asOf).toBe('2026-09');
    expect(file.rates).toHaveLength(9);
    expect(file.rates.find((r) => r.series === 'IUMBV42')).toEqual({
      fixYears: 5,
      ltv: 0.75,
      rate: 0.041,
      series: 'IUMBV42',
    });
  });

  it('fails when a code now describes something else', () => {
    const swapped = IADB_TT.replace(
      'IUMBV34,Monthly',
      'IUMBV34,Buy to let 2 year (75% LTV) Monthly',
    );
    const { errors } = buildRates(parseIadbCsv(swapped), GENERATED);
    expect(errors.join('\n')).toMatch(/IUMBV34: description .* is not a 2-year 75% LTV fixed rate/);
  });

  it('marks a series whose latest month lags the others', () => {
    const lagging = IADB_TT.replace('30 Sep 2026,4,4.1,', '30 Sep 2026,,4.1,');
    const { file, notes } = buildRates(parseIadbCsv(lagging), GENERATED);
    expect(file.rates.find((r) => r.series === 'IUMZICQ')).toMatchObject({
      rate: 0.041,
      asOf: '2026-08',
    });
    expect(notes).toEqual(['IUMZICQ: latest figure is for 2026-08, not 2026-09']);
  });
});

describe('checkAreas', () => {
  const prev = areasFile();

  it('passes a good file against the previous month', () => {
    expect(checkAreas(areasFile(), prev)).toEqual({ errors: [], warnings: [] });
  });

  it('fails when an area has no rent after fallbacks', () => {
    const bad = areasFile();
    bad.areas[0]!.rent = 0;
    expect(checkAreas(bad, prev).errors.join('\n')).toMatch(/rent/);
  });

  it('fails on a fallback that does not hold the nation figure', () => {
    const bad = areasFile();
    bad.areas[3]!.fallbacks = ['price'];
    expect(checkAreas(bad, prev).errors).toContain(
      'Leeds: price is listed as a fallback but is not the nation figure',
    );
  });

  it('fails on colliding slugs', () => {
    const bad = areasFile();
    bad.areas[1]!.slug = 'leeds';
    expect(checkAreas(bad, null).errors.join('\n')).toMatch(/duplicate slug "leeds"/);
  });

  it('fails when a price or rent moves more than 15% month on month', () => {
    const next = areasFile();
    next.areas[3]!.price = 250000 * 1.16;
    next.areas[0]!.rent = Math.round(1130 * 0.84);
    const { errors } = checkAreas(next, prev);
    expect(errors).toHaveLength(2);
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/Leeds: price moved from 250000 to 290000 \(\+16\.0%\), limit 15%/),
        expect.stringMatching(/Belfast: rent moved .*\(-16\.0%\), limit 15%/),
      ]),
    );
  });

  it('allows a 15% move exactly, and flags growth jumps in points', () => {
    const next = areasFile();
    next.areas[3]!.price = 250000 * 1.15;
    next.areas[3]!.growth10y = 0.04 + 0.02;
    const { errors } = checkAreas(next, prev);
    expect(errors).toEqual([
      expect.stringMatching(/Leeds: growth10y moved .*\+2\.00 points\), limit 1\.5 points/),
    ]);
  });

  it('turns moves into warnings when allowed', () => {
    const next = areasFile();
    next.areas[3]!.price = 400000;
    const result = checkAreas(next, prev, { allowMoves: true });
    expect(result.errors).toEqual([]);
    expect(result.warnings[0]).toMatch(/\(allowed\)$/);
  });

  it('fails when areas disappear, unless allowed', () => {
    const york = { ...areasFile().areas[3]!, code: 'E06000014', slug: 'york', name: 'York' };
    const before = areasFile({ areas: [...areasFile().areas, york] });
    expect(checkAreas(areasFile(), before).errors).toEqual([
      '1 areas disappeared: York (E06000014)',
    ]);
    expect(checkAreas(areasFile(), before, { allowCountDrop: true }).warnings).toEqual([
      'areas removed (allowed): York (E06000014)',
    ]);
  });

  it('fails when too many areas need a fallback (a source changed shape)', () => {
    const next = areasFile();
    const leeds = next.areas[3]!;
    Object.assign(leeds, { rent: 1450, rentGrowth: 0.04, fallbacks: ['rent', 'rentGrowth'] });
    expect(checkAreas(next, null).errors.join('\n')).toMatch(/1 of 4 areas use a nation fallback/);
  });

  it('skips the month-on-month checks against sample data', () => {
    const sample = { ...areasFile(), sample: true };
    sample.areas = sample.areas.map((a) => ({ ...a, price: 1 }));
    expect(checkAreas(areasFile(), sample).errors).toEqual([]);
  });
});

describe('checkRates and checkSources', () => {
  const rates = buildRates(parseIadbCsv(IADB_TT), GENERATED).file;

  it('passes the built rates and fails on a missing series', () => {
    expect(checkRates(rates, null).errors).toEqual([]);
    const missing: RatesFile = {
      ...rates,
      rates: rates.rates.filter((r) => r.series !== 'IUM2WTL'),
    };
    expect(checkRates(missing, null).errors).toEqual(['rates: IUM2WTL (2 years, 95% LTV) missing']);
  });

  it('fails when a rate moves more than 1.5 points in a month', () => {
    const next: RatesFile = {
      ...rates,
      rates: rates.rates.map((r) => ({ ...r, rate: r.series === 'IUMBV34' ? 0.06 : r.rate })),
    };
    expect(checkRates(next, rates).errors).toEqual(['IUMBV34: rate moved from 0.041 to 0.06']);
  });

  it('checks every source is listed', () => {
    const sources = buildSources({
      generatedAt: GENERATED,
      hpi: { url: 'https://example.org/hpi.csv', asOf: '2026-07' },
      pipr: { url: 'https://example.org/pipr.xlsx', edition: '16 September 2026', asOf: '2026-08' },
      boe: { asOf: '2026-09', descriptions: parseIadbCsv(IADB_TT).descriptions },
      geography: { service: 'LAD_APR_2025_UK_NC_v2', asOf: '2025-04' },
    });
    expect(() => parseSourcesFile(sources)).not.toThrow();
    expect(checkSources(sources).errors).toEqual([]);
    expect(sources.sources.find((s) => s.id === 'boe-quoted-rates')?.series).toHaveLength(9);
    expect(checkSources({ ...sources, sources: sources.sources.slice(1) }).errors).toEqual([
      'sources: uk-hpi missing',
    ]);
  });
});

describe('checkBrmaMap', () => {
  it('needs an entry for every Scottish and NI area', () => {
    expect(checkBrmaMap(areasFile(), BRMA_MAP).errors).toEqual([]);
    const map = { ...BRMA_MAP, areas: BRMA_MAP.areas.slice(1) };
    expect(checkBrmaMap(areasFile(), map).errors).toEqual([
      'Glasgow City (S12000049): no entry in data/brma-map.json',
    ]);
  });
});

describe('renderSummary', () => {
  it('lists counts, movers, fallbacks and rates', () => {
    const prev = areasFile();
    const next = areasFile();
    next.areas[3]!.price = 260000;
    const rates = buildRates(parseIadbCsv(IADB_TT), GENERATED).file;
    const text = renderSummary({
      mode: 'dry run',
      next: {
        areas: next,
        rates,
        sources: { schemaVersion: 1, generatedAt: GENERATED, sources: [] },
      },
      prev: { areas: prev, rates: null },
      checks: { errors: [], warnings: [] },
      notes: ['Isles of Scilly: not in UK HPI'],
    });
    expect(text).toContain('## Data refresh (dry run): checks passed');
    expect(text).toContain('| Areas | 4 | 4 |');
    expect(text).toContain('| Leeds | £250,000 | £260,000 | +4.0% |');
    expect(text).toContain('| 5 years | 90% | 4.30% | IUMZO28 |  |');
    expect(text).toContain('Isles of Scilly: not in UK HPI');
  });

  it('says the site keeps its last good data when the run fails', () => {
    const text = renderSummary({
      mode: 'scheduled',
      next: null,
      prev: { areas: null, rates: null },
      checks: { errors: ['x'], warnings: [] },
      notes: [],
      failure: 'GET https://example.org failed',
    });
    expect(text).toContain('checks FAILED');
    expect(text).toContain('keeps its last good data');
  });
});

describe('validateDirectory (scripts/validate-data.ts)', () => {
  it('passes the committed data files', async () => {
    const result = await validateDirectory(dataDir);
    expect(result.errors).toEqual([]);
  });

  it('the committed BRMA map covers every Scottish council and NI district', async () => {
    const map = parseBrmaMap(JSON.parse(await readFile(join(dataDir, 'brma-map.json'), 'utf8')));
    expect(map.areas.filter((a) => a.code.startsWith('S12'))).toHaveLength(32);
    expect(map.areas.filter((a) => a.code.startsWith('N09'))).toHaveLength(11);
  });

  it('fails a fixture directory with a broken file and a big move against the previous one', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hs-data-'));
    const prevDir = await mkdtemp(join(tmpdir(), 'hs-prev-'));
    const copy = async (name: string) =>
      writeFile(join(dir, name), await readFile(join(dataDir, name)));
    await Promise.all(['taxRules.json', 'defaults.json'].map(copy));
    const next = areasFile();
    next.areas[3]!.rent = 2000;
    await writeFile(join(dir, 'areas.json'), JSON.stringify(next));
    await writeFile(join(prevDir, 'areas.json'), JSON.stringify(areasFile()));
    await writeFile(
      join(dir, 'rates.json'),
      JSON.stringify(buildRates(parseIadbCsv(IADB_TT), GENERATED).file),
    );
    await writeFile(join(dir, 'sources.json'), '{ not json');
    await writeFile(join(dir, 'brma-map.json'), JSON.stringify(BRMA_MAP));
    const result = await validateDirectory(dir, prevDir);
    expect(result.errors.some((e) => e.startsWith('sources.json:'))).toBe(true);
    expect(result.errors.some((e) => /Leeds: rent moved from 1150 to 2000/.test(e))).toBe(true);
  });
});
