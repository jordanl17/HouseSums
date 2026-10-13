/**
 * Turns the parsed sources into data/areas.json and data/rates.json. Pure: no network or files.
 *
 * Rules (brief, "Data: local defaults"):
 * - price: latest UK HPI average, all property types; growth10y: (latest / 10 years earlier)^(1/10) - 1.
 * - rent: latest ONS private rent; rentGrowth: latest annual change. Scotland and NI use the BRMA
 *   in data/brma-map.json.
 * - A missing or stale local figure falls back to the nation's figure and is listed in
 *   `fallbacks`. Nothing is estimated or invented: a missing nation figure is an error.
 * - Figures are stored raw (unclamped); the engine clamps.
 */
import type {
  Area,
  AreaField,
  AreaFigures,
  AreasFile,
  Month,
  Nation,
  QuotedRate,
  RatesFile,
} from '../../src/lib/types.ts';
import { NATIONS } from '../../src/lib/types.ts';
import { QUOTED_RATE_SERIES, descriptionMatches, type IadbData } from './boe.ts';
import type { BrmaMap } from './brma.ts';
import type { LocalAuthority } from './geography.ts';
import { latestMonth, priceFigures, type PriceSeries } from './hpi.ts';
import { latestRentMonth, rentAreaKey, rentFigures, seriesKey, type RentSeries } from './pipr.ts';
import { COUNTRY_CODES, monthsBetween, nationFromCode, slugify } from './util.ts';

/** A local figure older than this, against the file's month, counts as missing. */
export const MAX_STALE_MONTHS = 6;

export interface BuildAreasInput {
  generatedAt: string;
  localAuthorities: readonly LocalAuthority[];
  prices: ReadonlyMap<string, PriceSeries>;
  rents: ReadonlyMap<string, RentSeries>;
  brmaMap: BrmaMap;
}

export interface BuildResult<T> {
  file: T;
  /** Problems that must fail the run (missing nation figures, unmapped BRMAs...). */
  errors: string[];
  /** Plain-English notes for the job summary (each fallback and why). */
  notes: string[];
}

type NationFigures = AreasFile['nations'][Nation];

export function buildAreas(input: BuildAreasInput): BuildResult<AreasFile> {
  const errors: string[] = [];
  const notes: string[] = [];
  const priceMonth = latestMonth(input.prices.values());
  const rentMonth = latestRentMonth(input.rents.values());
  if (!priceMonth) errors.push('UK HPI: no latest month');
  if (!rentMonth) errors.push('ONS private rents: no latest month');
  const asOf = { price: priceMonth ?? '1970-01', rent: rentMonth ?? '1970-01' };

  const nations = {} as Record<Nation, NationFigures>;
  for (const nation of NATIONS) {
    const code = COUNTRY_CODES[nation];
    const priceSeries = input.prices.get(code);
    const p = priceSeries ? priceFigures(priceSeries, nation === 'ni') : null;
    const rentSeries = input.rents.get(code);
    const r = rentSeries ? rentFigures(rentSeries) : null;
    if (!p || p.growth10y === null)
      errors.push(`${nation}: no nation-level UK HPI price and 10-year growth (${code})`);
    if (!r) errors.push(`${nation}: no nation-level ONS private rent (${code})`);
    const figures: NationFigures = {
      price: p?.price ?? 0,
      growth10y: p?.growth10y ?? 0,
      rent: r?.rent ?? 0,
      rentGrowth: r?.rentGrowth ?? 0,
    };
    const months: Partial<Record<'price' | 'rent', Month>> = {};
    if (p && p.month !== asOf.price) months.price = p.month;
    if (r && r.month !== asOf.rent) months.rent = r.month;
    if (Object.keys(months).length > 0) figures.asOf = months;
    nations[nation] = figures;
  }

  const brma = new Map(input.brmaMap.areas.map((e) => [e.code, e]));
  const areas: Area[] = [];
  for (const la of input.localAuthorities) {
    const nation = nationFromCode(la.code);
    if (!nation) continue;
    const fallbacks: AreaField[] = [];
    const months: Partial<Record<'price' | 'rent', Month>> = {};
    const nationFigures = nations[nation];
    const figures: AreaFigures = { price: 0, growth10y: 0, rent: 0, rentGrowth: 0 };

    // Price and growth from UK HPI.
    const priceSeries = input.prices.get(la.code);
    let p = priceSeries ? priceFigures(priceSeries, nation === 'ni') : null;
    if (p && monthsBetween(p.month, asOf.price) > MAX_STALE_MONTHS) {
      notes.push(`${la.name}: UK HPI price is from ${p.month}, too old; nation figure used`);
      p = null;
    }
    if (p) {
      figures.price = p.price;
      if (p.month !== asOf.price) months.price = p.month;
    } else {
      if (!priceSeries)
        notes.push(`${la.name} (${la.code}): not in UK HPI; nation price and growth used`);
      figures.price = nationFigures.price;
      fallbacks.push('price');
      const nationMonth = nationFigures.asOf?.price;
      if (nationMonth) months.price = nationMonth;
    }
    if (p && p.growth10y !== null) {
      figures.growth10y = p.growth10y;
    } else {
      if (p)
        notes.push(`${la.name}: no UK HPI price 10 years before ${p.month}; nation growth used`);
      figures.growth10y = nationFigures.growth10y;
      fallbacks.push('growth10y');
    }

    // Rent and rent growth from ONS private rents.
    let rentArea: string | undefined;
    let rentKey: string | null = la.code;
    if (nation === 'sco' || nation === 'ni') {
      const entry = brma.get(la.code);
      if (!entry) {
        errors.push(`${la.name} (${la.code}): no entry in data/brma-map.json`);
        rentKey = null;
      } else {
        rentArea = entry.rentArea;
        rentKey = entry.rentAreaCode ?? seriesKey(null, entry.rentArea);
        const series = input.rents.get(rentKey);
        if (!series) {
          errors.push(
            `${la.name}: rental area "${entry.rentArea}" (${entry.rentAreaCode ?? rentAreaKey(entry.rentArea)}) not found in ONS private rents`,
          );
        }
      }
    }
    const rentSeries = rentKey ? input.rents.get(rentKey) : undefined;
    let r = rentSeries ? rentFigures(rentSeries) : null;
    if (r && monthsBetween(r.month, asOf.rent) > MAX_STALE_MONTHS) {
      notes.push(`${la.name}: ONS rent is from ${r.month}, too old; nation figure used`);
      r = null;
    }
    if (r) {
      figures.rent = r.rent;
      figures.rentGrowth = r.rentGrowth;
      if (r.month !== asOf.rent) months.rent = r.month;
    } else {
      if (!rentSeries && nation !== 'sco' && nation !== 'ni') {
        notes.push(
          `${la.name} (${la.code}): not in ONS private rents; nation rent and rent growth used`,
        );
      } else if (rentSeries) {
        notes.push(
          `${la.name}: ONS private rents has no rent and annual change; nation figures used`,
        );
      }
      figures.rent = nationFigures.rent;
      figures.rentGrowth = nationFigures.rentGrowth;
      fallbacks.push('rent', 'rentGrowth');
      const nationMonth = nationFigures.asOf?.rent;
      if (nationMonth) months.rent = nationMonth;
    }

    const area: Area = {
      code: la.code,
      slug: slugify(la.name),
      name: la.name,
      nation,
      ...figures,
      fallbacks,
    };
    if (Object.keys(months).length > 0) area.asOf = months;
    if (rentArea) area.rentArea = rentArea;
    areas.push(area);
  }
  areas.sort((a, b) => a.name.localeCompare(b.name, 'en-GB') || a.code.localeCompare(b.code));

  return {
    file: { schemaVersion: 1, generatedAt: input.generatedAt, asOf, nations, areas },
    errors,
    notes,
  };
}

export const RATES_SOURCE = 'Bank of England, quoted household interest rates';

export function buildRates(data: IadbData, generatedAt: string): BuildResult<RatesFile> {
  const errors: string[] = [];
  const notes: string[] = [];
  const latest: { series: (typeof QUOTED_RATE_SERIES)[number]; month: Month; value: number }[] = [];
  for (const series of QUOTED_RATE_SERIES) {
    const description = data.descriptions.get(series.code);
    if (!description) errors.push(`${series.code}: no description returned by the Bank of England`);
    else if (!descriptionMatches(description, series)) {
      errors.push(
        `${series.code}: description "${description}" is not a ${series.fixYears}-year ${series.ltv * 100}% LTV fixed rate`,
      );
    }
    const obs = data.observations.get(series.code) ?? [];
    const last = obs.at(-1);
    if (!last) errors.push(`${series.code}: no observations`);
    else latest.push({ series, month: last.month, value: last.value });
  }
  const asOf = latest.reduce<Month>((m, x) => (x.month > m ? x.month : m), '1970-01');
  const rates: QuotedRate[] = latest.map(({ series, month, value }) => {
    const rate: QuotedRate = {
      fixYears: series.fixYears,
      ltv: series.ltv,
      rate: value,
      series: series.code,
    };
    if (month !== asOf) {
      rate.asOf = month;
      notes.push(`${series.code}: latest figure is for ${month}, not ${asOf}`);
    }
    return rate;
  });
  return {
    file: { schemaVersion: 1, generatedAt, asOf, source: RATES_SOURCE, rates },
    errors,
    notes,
  };
}
