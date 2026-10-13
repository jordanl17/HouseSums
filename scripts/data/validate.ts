/**
 * The data checks from the brief, run on freshly built files against the committed ones (by the
 * refresh) and on the committed files alone (by scripts/validate-data.ts and the unit tests).
 *
 * A run fails, and the site keeps its last good data, if:
 * - the files do not match the schema in src/lib/schema.ts;
 * - any area lacks a price or a rent after fallbacks, or a fallback does not hold the nation figure;
 * - two areas share a slug;
 * - more than MAX_FALLBACK_SHARE of areas needed a fallback (a sign a source changed shape);
 * - areas disappear compared with the committed file (unless allowCountDrop);
 * - any value moves too far month on month compared with the committed file (unless allowMoves):
 *   prices and rents by more than 15%, 10-year growth by more than 1.5 points, rent growth by
 *   more than 5 points, a mortgage rate by more than 15% of its old value (MAX_RATE_MOVE);
 * - a Bank of England series is missing or a rate is outside 0-25%.
 * Comparisons against the committed file are skipped for anything labelled as a sample.
 *
 * Warnings (reported in the job summary, never failing the run): a field that switched between
 * the area's own figure and its nation's fallback since last month. Those are not compared month
 * on month (the two figures measure different places), so the summary says so instead.
 */
import type { AreaField, AreasFile, RatesFile, SourcesFile } from '../../src/lib/types.ts';
import { AREA_FIELDS, NATIONS } from '../../src/lib/types.ts';
import { parseAreasFile, parseRatesFile, parseSourcesFile } from '../../src/lib/schema.ts';
import { QUOTED_RATE_SERIES } from './boe.ts';
import type { BrmaMap } from './brma.ts';

export const MAX_MOVE = {
  price: 0.15,
  rent: 0.15,
  growth10y: 0.015,
  rentGrowth: 0.05,
} as const;

/**
 * The brief's "more than 15% month on month", applied to each Bank of England quoted rate as a
 * relative move (5.00% to 5.80% is +16% and fails). A move must also exceed `floor` (0.25
 * percentage points) to fail, so a tiny rate cannot trip the rule on ordinary noise: at 1.00%, a
 * 0.20-point move is +20% but passes. At today's 4-6% rates the relative limit (0.6-0.9 points)
 * is always the one that bites. allowMoves turns a failure into a warning.
 */
export const MAX_RATE_MOVE = { relative: 0.15, floor: 0.0025 } as const;

/** Slack for floating-point noise, so a move of exactly the limit passes. */
const LIMIT_EPSILON = 1e-9;

/** Relative fields are compared as a share of the old value; the others in absolute terms. */
const RELATIVE: Record<AreaField, boolean> = {
  price: true,
  rent: true,
  growth10y: false,
  rentGrowth: false,
};

export const MAX_FALLBACK_SHARE = 0.05;

export interface CheckOptions {
  allowCountDrop?: boolean;
  allowMoves?: boolean;
}

export interface CheckResult {
  errors: string[];
  warnings: string[];
}

export interface FallbackSwitch {
  code: string;
  name: string;
  field: AreaField;
  /** The nation whose figure the fallback side used. */
  nation: AreasFile['areas'][number]['nation'];
  /** True when the field now uses the nation figure; false when it went back to its own. */
  toFallback: boolean;
  from: number;
  to: number;
}

export interface Move {
  code: string;
  name: string;
  field: AreaField;
  from: number;
  to: number;
  /** Relative change for price and rent, absolute change for growth rates. */
  change: number;
}

function schemaErrors(parse: () => unknown): string[] {
  try {
    parse();
    return [];
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }
}

function isSample(file: { sample?: boolean } | null | undefined): boolean {
  return !file || file.sample === true;
}

/** Every price and rent move between two area files (areas matched by code), biggest first. */
export function areaMoves(next: AreasFile, prev: AreasFile): Move[] {
  const before = new Map(prev.areas.map((a) => [a.code, a]));
  const moves: Move[] = [];
  for (const a of next.areas) {
    const b = before.get(a.code);
    if (!b) continue;
    for (const field of AREA_FIELDS) {
      if (b.sample?.includes(field) || a.sample?.includes(field)) continue;
      if (b.fallbacks.includes(field) !== a.fallbacks.includes(field)) continue;
      const from = b[field];
      const to = a[field];
      const change = RELATIVE[field] ? (from === 0 ? Infinity : to / from - 1) : to - from;
      moves.push({ code: a.code, name: a.name, field, from, to, change });
    }
  }
  return moves.sort((x, y) => Math.abs(y.change) - Math.abs(x.change));
}

/**
 * Fields that switched between an area's own figure and its nation's fallback since the previous
 * file (areas matched by code). areaMoves leaves these out; checkAreas reports them as warnings.
 */
export function fallbackSwitches(next: AreasFile, prev: AreasFile): FallbackSwitch[] {
  const before = new Map(prev.areas.map((a) => [a.code, a]));
  const switches: FallbackSwitch[] = [];
  for (const a of next.areas) {
    const b = before.get(a.code);
    if (!b) continue;
    for (const field of AREA_FIELDS) {
      if (b.sample?.includes(field) || a.sample?.includes(field)) continue;
      const toFallback = a.fallbacks.includes(field);
      if (b.fallbacks.includes(field) === toFallback) continue;
      switches.push({
        code: a.code,
        name: a.name,
        field,
        nation: a.nation,
        toFallback,
        from: b[field],
        to: a[field],
      });
    }
  }
  return switches;
}

const NATION_NAMES = {
  eng: 'England',
  sco: 'Scotland',
  wal: 'Wales',
  ni: 'Northern Ireland',
} as const;

export function describeSwitch(s: FallbackSwitch): string {
  const nation = `the ${NATION_NAMES[s.nation]} figure`;
  const [from, to] = s.toFallback ? ['its local figure', nation] : [nation, 'its local figure'];
  return `${s.name}: ${s.field} switched from ${from} to ${to} (${s.from} to ${s.to}); not compared month on month`;
}

export function checkAreas(
  next: AreasFile,
  prev: AreasFile | null,
  options: CheckOptions = {},
): CheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  errors.push(...schemaErrors(() => parseAreasFile(next)));
  if (errors.length > 0) return { errors, warnings };

  const slugs = new Map<string, string>();
  let withFallback = 0;
  for (const a of next.areas) {
    if (!(a.price > 0) || !Number.isFinite(a.price)) errors.push(`${a.name}: no price`);
    if (!(a.rent > 0) || !Number.isFinite(a.rent)) errors.push(`${a.name}: no rent`);
    const other = slugs.get(a.slug);
    if (other) errors.push(`slug "${a.slug}" is used by both ${other} and ${a.name}`);
    slugs.set(a.slug, a.name);
    const nation = next.nations[a.nation];
    for (const field of a.fallbacks) {
      if (a[field] !== nation[field]) {
        errors.push(`${a.name}: ${field} is listed as a fallback but is not the nation figure`);
      }
    }
    if (a.fallbacks.length > 0) withFallback += 1;
  }
  for (const nation of NATIONS) {
    const n = next.nations[nation];
    if (!(n.price > 0) || !(n.rent > 0)) errors.push(`${nation}: nation figures missing`);
    if (!next.areas.some((a) => a.nation === nation)) errors.push(`${nation}: no areas`);
  }
  const share = next.areas.length === 0 ? 1 : withFallback / next.areas.length;
  if (share > MAX_FALLBACK_SHARE && !next.sample) {
    errors.push(
      `${withFallback} of ${next.areas.length} areas use a nation fallback (more than ${MAX_FALLBACK_SHARE * 100}%); a source may have changed shape`,
    );
  }

  if (prev && !isSample(prev)) {
    const nextCodes = new Set(next.areas.map((a) => a.code));
    const gone = prev.areas.filter((a) => !nextCodes.has(a.code));
    if (gone.length > 0) {
      const list = gone.map((a) => `${a.name} (${a.code})`).join(', ');
      if (options.allowCountDrop) warnings.push(`areas removed (allowed): ${list}`);
      else errors.push(`${gone.length} areas disappeared: ${list}`);
    }
    for (const s of fallbackSwitches(next, prev)) warnings.push(describeSwitch(s));
    for (const m of areaMoves(next, prev)) {
      const limit = MAX_MOVE[m.field];
      if (Math.abs(m.change) <= limit) continue;
      const text = `${m.name}: ${m.field} moved from ${m.from} to ${m.to} (${describeChange(m)}), limit ${RELATIVE[m.field] ? `${limit * 100}%` : `${limit * 100} points`}`;
      if (options.allowMoves) warnings.push(`${text} (allowed)`);
      else errors.push(text);
    }
    for (const nation of NATIONS) {
      const a = next.nations[nation];
      const b = prev.nations[nation];
      if (b.sample && b.sample.length > 0) continue;
      for (const field of AREA_FIELDS) {
        const change = RELATIVE[field] ? a[field] / b[field] - 1 : a[field] - b[field];
        if (Math.abs(change) > MAX_MOVE[field]) {
          const text = `${nation} nation ${field} moved from ${b[field]} to ${a[field]}`;
          if (options.allowMoves) warnings.push(`${text} (allowed)`);
          else errors.push(text);
        }
      }
    }
  }
  return { errors, warnings };
}

export function describeChange(m: Pick<Move, 'field' | 'change'>): string {
  const sign = m.change > 0 ? '+' : '';
  return RELATIVE[m.field]
    ? `${sign}${(m.change * 100).toFixed(1)}%`
    : `${sign}${(m.change * 100).toFixed(2)} points`;
}

/** True when a quoted rate moved more than MAX_RATE_MOVE allows (relative, above the floor). */
export function rateMoveTooBig(from: number, to: number): boolean {
  const points = Math.abs(to - from);
  if (points <= MAX_RATE_MOVE.floor + LIMIT_EPSILON) return false;
  if (from === 0) return true;
  return points / Math.abs(from) > MAX_RATE_MOVE.relative + LIMIT_EPSILON;
}

export function checkRates(
  next: RatesFile,
  prev: RatesFile | null,
  options: CheckOptions = {},
): CheckResult {
  const errors = schemaErrors(() => parseRatesFile(next));
  const warnings: string[] = [];
  if (errors.length > 0) return { errors, warnings };
  if (!next.sample) {
    for (const s of QUOTED_RATE_SERIES) {
      const r = next.rates.find((x) => x.series === s.code);
      if (!r) errors.push(`rates: ${s.code} (${s.fixYears} years, ${s.ltv * 100}% LTV) missing`);
      else if (r.fixYears !== s.fixYears || r.ltv !== s.ltv)
        errors.push(`rates: ${s.code} has the wrong fix or LTV`);
    }
  }
  if (prev && !isSample(prev)) {
    for (const r of next.rates) {
      const old = prev.rates.find((x) => x.series === r.series && !x.sample);
      if (!old) continue;
      if (!rateMoveTooBig(old.rate, r.rate)) continue;
      const change = old.rate === 0 ? Infinity : r.rate / old.rate - 1;
      const sign = change > 0 ? '+' : '';
      const text = `${r.series}: rate moved from ${old.rate} to ${r.rate} (${sign}${(change * 100).toFixed(1)}%), limit ${MAX_RATE_MOVE.relative * 100}%`;
      if (options.allowMoves) warnings.push(`${text} (allowed)`);
      else errors.push(text);
    }
  }
  return { errors, warnings };
}

export function checkSources(next: SourcesFile): CheckResult {
  const errors = schemaErrors(() => parseSourcesFile(next));
  for (const id of ['uk-hpi', 'ons-pipr', 'boe-quoted-rates', 'ons-la-codes']) {
    if (!next.sources.some((s) => s.id === id)) errors.push(`sources: ${id} missing`);
  }
  return { errors, warnings: [] };
}

/**
 * data/brma-map.json covers every Scottish and NI area, and each area's rentArea is the one the
 * map gives. Map entries for codes no longer in areas.json are warnings.
 */
export function checkBrmaMap(areas: AreasFile, map: BrmaMap): CheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const entries = new Map(map.areas.map((e) => [e.code, e]));
  for (const a of areas.areas) {
    if (a.nation !== 'sco' && a.nation !== 'ni') continue;
    const entry = entries.get(a.code);
    if (!entry) errors.push(`${a.name} (${a.code}): no entry in data/brma-map.json`);
    else if (a.rentArea !== undefined && a.rentArea !== entry.rentArea) {
      errors.push(
        `${a.name}: rentArea "${a.rentArea}" differs from brma-map.json "${entry.rentArea}"`,
      );
    }
  }
  const codes = new Set(areas.areas.map((a) => a.code));
  for (const e of map.areas) {
    if (!codes.has(e.code) && !areas.sample)
      warnings.push(`brma-map.json: ${e.code} (${e.name}) is not in areas.json`);
  }
  return { errors, warnings };
}

export function mergeResults(...results: CheckResult[]): CheckResult {
  return {
    errors: results.flatMap((r) => r.errors),
    warnings: results.flatMap((r) => r.warnings),
  };
}
