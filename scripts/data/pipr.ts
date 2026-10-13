/**
 * ONS Price Index of Private Rents (PIPR), "Price Index of Private Rents, UK: monthly price
 * statistics", sheet "Table 1". One row per area per month with columns "Time period" (an Excel
 * date), "Area code", "Area name", "Region or country name", "Index", "Monthly change", "Annual
 * change" (per cent), "Rental price" (pounds a month), then the same by bedrooms and property type.
 *
 * Areas: local authorities in England and Wales, Broad Rental Market Areas (BRMAs) in Scotland
 * (codes S33...) and Northern Ireland (no code, "[z]", so they are keyed by name), plus regions and
 * countries. Missing values are "[x]". Northern Ireland usually lags Great Britain by two months.
 */
import type { Month } from '../../src/lib/types.ts';
import { round, toMonth, toNumber } from './util.ts';

export interface RentPoint {
  rent: number | null;
  /** Annual change as a decimal (3.8% is 0.038). */
  annualChange: number | null;
}

export interface RentSeries {
  /** GSS code, or null where ONS gives none (Northern Ireland BRMAs). */
  code: string | null;
  name: string;
  region: string;
  points: Map<Month, RentPoint>;
}

export interface RentFigures {
  rent: number;
  rentGrowth: number;
  month: Month;
}

export const PIPR_SHEET = 'Table 1';

const HEADERS = {
  period: 'time period',
  code: 'area code',
  name: 'area name',
  region: 'region or country name',
  annual: 'annual change',
  rent: 'rental price',
} as const;

/** "Belfast BRMA" -> "belfast"; "Renfrewshire/Inverclyde" -> "renfrewshire/inverclyde". */
export function rentAreaKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+brma$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Series key: the GSS code when there is one, otherwise "name:" + the normalised name. */
export function seriesKey(code: string | null, name: string): string {
  return code ?? `name:${rentAreaKey(name)}`;
}

function normaliseHeader(cell: string): string {
  return cell
    .replace(/\s*\[note[^\]]*\]/gi, '')
    .trim()
    .toLowerCase();
}

export function parsePiprRows(rows: readonly string[][]): Map<string, RentSeries> {
  const headerIndex = rows.findIndex((r) => normaliseHeader(r[0] ?? '') === HEADERS.period);
  const header = rows[headerIndex];
  if (!header) throw new Error('PIPR: no "Time period" header row in Table 1');
  const names = header.map(normaliseHeader);
  const col = Object.fromEntries(
    Object.entries(HEADERS).map(([key, label]) => [key, names.indexOf(label)]),
  ) as Record<keyof typeof HEADERS, number>;
  const missing = Object.entries(col).filter(([, i]) => i < 0);
  if (missing.length > 0) {
    throw new Error(
      `PIPR: missing columns ${missing.map(([k]) => HEADERS[k as keyof typeof HEADERS]).join(', ')}`,
    );
  }
  const out = new Map<string, RentSeries>();
  for (const row of rows.slice(headerIndex + 1)) {
    const month = toMonth(row[col.period] ?? '');
    const rawCode = (row[col.code] ?? '').trim();
    const name = (row[col.name] ?? '').trim();
    if (!month || !name) continue;
    const code = /^[A-Z]\d{8}$/.test(rawCode) ? rawCode : null;
    const key = seriesKey(code, name);
    let series = out.get(key);
    if (!series) {
      series = { code, name, region: (row[col.region] ?? '').trim(), points: new Map() };
      out.set(key, series);
    }
    const rent = toNumber(row[col.rent]);
    const annual = toNumber(row[col.annual]);
    series.points.set(month, {
      rent: rent !== null && rent > 0 ? rent : null,
      annualChange: annual === null ? null : round(annual / 100, 6),
    });
  }
  if (out.size === 0) throw new Error('PIPR: no data rows');
  return out;
}

/** The latest month with both a rent and an annual change. Null if there is none. */
export function rentFigures(series: RentSeries): RentFigures | null {
  const months = [...series.points.keys()].sort().reverse();
  for (const month of months) {
    const p = series.points.get(month);
    if (p && p.rent !== null && p.annualChange !== null) {
      return { rent: Math.round(p.rent), rentGrowth: p.annualChange, month };
    }
  }
  return null;
}

/** The latest month in the file with any rent at all (the release's reference month). */
export function latestRentMonth(all: Iterable<RentSeries>): Month | null {
  let latest: Month | null = null;
  for (const s of all) {
    for (const [m, p] of s.points) if (p.rent !== null && (!latest || m > latest)) latest = m;
  }
  return latest;
}
