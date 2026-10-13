/**
 * Bank of England Interactive Database (IADB), quoted household interest rates. The CSV endpoint
 * with CSVF=TT returns a "SERIES,DESCRIPTION" block, a blank line, then "DATE,<code>,<code>..."
 * rows with dates like "30 Sep 2026" and values in per cent.
 *
 * The series codes were found by searching the IADB and checked against the descriptions it
 * returns (October 2026). The Bank publishes 2-year fixes at 60, 75, 85, 90 and 95% LTV and
 * 5-year fixes at 60, 75, 90 and 95% LTV. There is no 5-year 85% LTV series, so rates.json has
 * nine rates, not ten. The pipeline checks each description, so a code that changes meaning
 * fails the run instead of shipping the wrong rate.
 */
import type { LtvBand, Month } from '../../src/lib/types.ts';
import { parseCsv } from './csv.ts';
import { round, toMonth, toNumber } from './util.ts';

export interface QuotedRateSeries {
  code: string;
  fixYears: number;
  ltv: LtvBand;
}

export const QUOTED_RATE_SERIES: readonly QuotedRateSeries[] = [
  { code: 'IUMZICQ', fixYears: 2, ltv: 0.6 },
  { code: 'IUMBV34', fixYears: 2, ltv: 0.75 },
  { code: 'IUMZICR', fixYears: 2, ltv: 0.85 },
  { code: 'IUMB482', fixYears: 2, ltv: 0.9 },
  { code: 'IUM2WTL', fixYears: 2, ltv: 0.95 },
  { code: 'IUMZO27', fixYears: 5, ltv: 0.6 },
  { code: 'IUMBV42', fixYears: 5, ltv: 0.75 },
  { code: 'IUMZO28', fixYears: 5, ltv: 0.9 },
  { code: 'IUM5WTL', fixYears: 5, ltv: 0.95 },
];

export const IADB_BASE =
  'https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp';

/** CSV download URL for the series from `from` (a Date) to now, with descriptions. */
export function iadbUrl(codes: readonly string[], from: Date): string {
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const date = `01/${months[from.getUTCMonth()]}/${from.getUTCFullYear()}`;
  const params = new URLSearchParams({
    'csv.x': 'yes',
    Datefrom: date,
    Dateto: 'now',
    SeriesCodes: codes.join(','),
    CSVF: 'TT',
    UsingCodes: 'Y',
    VPD: 'Y',
    VFD: 'N',
  });
  return `${IADB_BASE}?${params.toString()}`;
}

export interface IadbData {
  descriptions: Map<string, string>;
  /** Observations by series code, oldest first, values as decimals (5.13% is 0.0513). */
  observations: Map<string, { month: Month; value: number }[]>;
}

export function parseIadbCsv(text: string): IadbData {
  if (/<html/i.test(text.slice(0, 2000))) {
    throw new Error(
      'Bank of England: got an HTML page instead of CSV (bad series code or blocked)',
    );
  }
  const rows = parseCsv(text);
  const descriptions = new Map<string, string>();
  const observations = new Map<string, { month: Month; value: number }[]>();
  let i = 0;
  if (rows[0]?.[0] === 'SERIES') {
    for (i = 1; i < rows.length && rows[i]?.[0] !== 'DATE'; i += 1) {
      const [code, ...rest] = rows[i] ?? [];
      if (code) descriptions.set(code.trim(), rest.join(',').trim());
    }
  }
  const header = rows[i];
  if (!header || header[0] !== 'DATE') throw new Error('Bank of England: no DATE header in CSV');
  const codes = header.slice(1).map((c) => c.trim());
  for (const code of codes) observations.set(code, []);
  for (const row of rows.slice(i + 1)) {
    const month = toMonth(row[0] ?? '');
    if (!month) continue;
    codes.forEach((code, j) => {
      const v = toNumber(row[j + 1]);
      if (v !== null) observations.get(code)?.push({ month, value: round(v / 100, 6) });
    });
  }
  for (const list of observations.values()) list.sort((a, b) => a.month.localeCompare(b.month));
  return { descriptions, observations };
}

/**
 * True when the IADB description matches the series we think it is: owner-occupier (not buy to
 * let), fixed, this fix length and this LTV.
 */
export function descriptionMatches(description: string, series: QuotedRateSeries): boolean {
  const d = description.toLowerCase();
  return (
    d.includes(
      `${series.fixYears} year (${Math.round(series.ltv * 100)}% ltv) fixed rate mortgage`,
    ) && !d.includes('buy to let')
  );
}
