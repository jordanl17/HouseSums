/** Small helpers shared by the data pipeline modules. */
import type { Month, Nation } from '../../src/lib/types.ts';

const MONTH_NAMES = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
];

export function isMonth(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** "2026-07" plus n months (n may be negative). */
export function addMonths(month: Month, n: number): Month {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const total = y * 12 + (m - 1) + n;
  const year = Math.floor(total / 12);
  return `${String(year).padStart(4, '0')}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/** Whole months from a to b (b - a). */
export function monthsBetween(a: Month, b: Month): number {
  const [ay, am] = a.split('-').map(Number) as [number, number];
  const [by, bm] = b.split('-').map(Number) as [number, number];
  return by * 12 + bm - (ay * 12 + am);
}

/**
 * Reads a month from the shapes the sources use: an Excel date serial ("46235"), an ISO date
 * ("2026-07-01"), "2026-07", "30 Sep 2026", "Sep 2026" or "September 2026". Null if unreadable.
 */
export function toMonth(value: string): Month | null {
  const v = value.trim();
  if (/^\d{4,5}(\.\d+)?$/.test(v)) {
    const serial = Math.floor(Number(v));
    if (serial < 20000 || serial > 80000) return null;
    const d = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }
  const iso = /^(\d{4})-(\d{2})(?:-\d{2})?(?:[T ].*)?$/.exec(v);
  if (iso) {
    const m = `${iso[1]}-${iso[2]}`;
    return isMonth(m) ? m : null;
  }
  const named = /^(?:\d{1,2}\s+)?([A-Za-z]{3})[A-Za-z]*\.?\s+(\d{4})$/.exec(v);
  if (named?.[1] && named[2]) {
    const index = MONTH_NAMES.indexOf(named[1].toLowerCase());
    if (index >= 0) return `${named[2]}-${String(index + 1).padStart(2, '0')}`;
  }
  return null;
}

/**
 * A number from a source cell, or null for blanks and the ONS shorthand for missing values
 * ("[x]" not available, "[z]" not applicable, "[c]" confidential, "..", "-").
 */
export function toNumber(value: string | undefined): number | null {
  if (value === undefined) return null;
  const v = value.trim().replace(/,/g, '');
  if (v === '' || /^\[[a-z]\]$/i.test(v) || v === '..' || v === '-') return null;
  if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(v)) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Rounds away binary noise: 5.13 / 100 is 0.0513, not 0.051300000000000005. */
export function round(value: number, places: number): number {
  return Number(value.toFixed(places));
}

/**
 * The brief's slug rule: the ONS name lowercased and hyphenated. Accents are dropped, apostrophes
 * and full stops removed, and every other run of non-alphanumerics becomes one hyphen.
 * "Kingston upon Hull, City of" -> "kingston-upon-hull-city-of"; "King's Lynn" -> "kings-lynn".
 */
export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’.]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Nation from the first letter of a GSS code (E, S, W, N). */
export function nationFromCode(code: string): Nation | null {
  switch (code[0]) {
    case 'E':
      return 'eng';
    case 'S':
      return 'sco';
    case 'W':
      return 'wal';
    case 'N':
      return 'ni';
    default:
      return null;
  }
}

/** GSS country codes, used for the nation-level figures in UK HPI and ONS private rents. */
export const COUNTRY_CODES: Record<Nation, string> = {
  eng: 'E92000001',
  sco: 'S92000003',
  wal: 'W92000004',
  ni: 'N92000002',
};

/** The local authority code prefixes in scope: districts, unitaries, boroughs, councils. */
export const LOCAL_AUTHORITY_CODE = /^(E0[6-9]|W06|S12|N09)\d{6}$/;

/** The most common value in a list (ties go to the latest in sort order). */
export function mode(values: readonly string[]): string | null {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: string | null = null;
  let bestCount = 0;
  for (const [v, c] of [...counts].sort(([a], [b]) => a.localeCompare(b))) {
    if (c >= bestCount) {
      best = v;
      bestCount = c;
    }
  }
  return best;
}
