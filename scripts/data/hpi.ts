/**
 * UK House Price Index (HM Land Registry with ONS): the "Average-prices-YYYY-MM.csv" download.
 * Columns: Date (YYYY-MM-DD), Region_Name, Area_Code, Average_Price, Monthly_Change,
 * Annual_Change, Average_Price_SA. One row per area per month; Northern Ireland is quarterly and
 * its figure is repeated for each month of the quarter and carried into later months until the
 * next quarter is published.
 */
import type { Month } from '../../src/lib/types.ts';
import { parseCsv } from './csv.ts';
import { addMonths, round, toMonth, toNumber } from './util.ts';

export interface PriceSeries {
  code: string;
  name: string;
  /** Average price by month. */
  prices: Map<Month, number>;
}

export interface PriceFigures {
  price: number;
  /** 10-year compound annual growth, or null when the price 10 years earlier is missing. */
  growth10y: number | null;
  /** The month the price is for. */
  month: Month;
}

const REQUIRED = ['Date', 'Region_Name', 'Area_Code', 'Average_Price'] as const;

export function parseHpiAveragePrices(text: string): Map<string, PriceSeries> {
  const [header, ...rows] = parseCsv(text);
  if (!header) throw new Error('UK HPI: empty file');
  const col = Object.fromEntries(REQUIRED.map((name) => [name, header.indexOf(name)])) as Record<
    (typeof REQUIRED)[number],
    number
  >;
  const missing = REQUIRED.filter((name) => col[name] < 0);
  if (missing.length > 0) throw new Error(`UK HPI: missing columns ${missing.join(', ')}`);
  const out = new Map<string, PriceSeries>();
  for (const row of rows) {
    const code = row[col.Area_Code]?.trim() ?? '';
    const month = toMonth(row[col.Date] ?? '');
    const price = toNumber(row[col.Average_Price]);
    if (!code || !month || price === null || price <= 0) continue;
    let series = out.get(code);
    if (!series) {
      series = { code, name: (row[col.Region_Name] ?? '').trim(), prices: new Map() };
      out.set(code, series);
    }
    series.prices.set(month, price);
  }
  if (out.size === 0) throw new Error('UK HPI: no rows with a code, month and price');
  return out;
}

/** The latest month in any series. */
export function latestMonth(all: Iterable<PriceSeries>): Month | null {
  let latest: Month | null = null;
  for (const s of all) for (const m of s.prices.keys()) if (!latest || m > latest) latest = m;
  return latest;
}

/**
 * For quarterly series (Northern Ireland): the latest quarter-end month whose figure is the one
 * still shown in the latest month. July 2026 repeating the April-June figure gives "2026-06".
 */
export function quarterlyMonth(series: PriceSeries, latest: Month): Month {
  const value = series.prices.get(latest);
  if (value === undefined) return latest;
  let cursor = latest;
  while (series.prices.get(cursor) === value) {
    if (/-(03|06|09|12)$/.test(cursor)) return cursor;
    cursor = addMonths(cursor, -1);
  }
  return latest;
}

/**
 * Latest price and 10-year compound growth for one series. `quarterly` applies the Northern
 * Ireland rule above. Returns null when the series has no price at all.
 */
export function priceFigures(series: PriceSeries, quarterly: boolean): PriceFigures | null {
  let latest: Month | null = null;
  for (const m of series.prices.keys()) if (!latest || m > latest) latest = m;
  if (!latest) return null;
  const month = quarterly ? quarterlyMonth(series, latest) : latest;
  const price = series.prices.get(month);
  if (price === undefined) return null;
  const earlier = series.prices.get(addMonths(month, -120));
  const growth10y = earlier ? round((price / earlier) ** (1 / 10) - 1, 6) : null;
  return { price: Math.round(price), growth10y, month };
}
