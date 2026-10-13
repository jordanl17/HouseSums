/**
 * Runtime validators for the JSON files under data/. Each parse function takes `unknown` (the
 * result of JSON.parse or a JSON import) and returns it typed, or throws a DataError naming the
 * path of the first problem. Used by tests, by scripts/validate-data.ts and by phase 4/5 at build
 * time. Hand-written so the engine needs no runtime dependency.
 *
 * Ownership: each teammate may tighten the parser for the file they own (data: areas, rates,
 * sources; tax: taxRules; model: defaults). Keep them in step with src/lib/types.ts.
 */
import {
  AREA_FIELDS,
  BUYER_TYPES,
  DERIVED_INPUT_KEYS,
  LTV_BANDS,
  NATIONS,
  NUMERIC_INPUT_KEYS,
  PRESET_NAMES,
  type AreaFigures,
  type AreasFile,
  type DefaultsFile,
  type RatesFile,
  type SourcesFile,
  type TaxBand,
  type TaxRules,
} from './types';

export class DataError extends Error {
  constructor(
    readonly path: string,
    message: string,
  ) {
    super(`${path}: ${message}`);
    this.name = 'DataError';
  }
}

type Obj = Record<string, unknown>;

function obj(value: unknown, path: string): Obj {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new DataError(path, 'expected an object');
  }
  return value as Obj;
}

function arr(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new DataError(path, 'expected an array');
  return value;
}

function num(value: unknown, path: string, min = -Infinity, max = Infinity): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new DataError(path, 'expected a finite number');
  }
  if (value < min || value > max) {
    throw new DataError(path, `expected ${min} to ${max}, got ${value}`);
  }
  return value;
}

function str(value: unknown, path: string, pattern?: RegExp): string {
  if (typeof value !== 'string' || value === '') throw new DataError(path, 'expected a string');
  if (pattern && !pattern.test(value)) {
    throw new DataError(path, `"${value}" does not match ${String(pattern)}`);
  }
  return value;
}

function oneOf<T>(value: unknown, allowed: readonly T[], path: string): T {
  if (!allowed.includes(value as T)) {
    throw new DataError(path, `expected one of ${allowed.join(', ')}, got ${String(value)}`);
  }
  return value as T;
}

function optional<T>(o: Obj, key: string, check: (v: unknown, p: string) => T, path: string): void {
  if (key in o && o[key] !== undefined) check(o[key], `${path}.${key}`);
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE = /^\d{4}-\d{2}-\d{2}/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function schemaVersion(o: Obj, path: string): void {
  if (o['schemaVersion'] !== 1) throw new DataError(`${path}.schemaVersion`, 'expected 1');
}

function figures(value: unknown, path: string): AreaFigures {
  const o = obj(value, path);
  num(o['price'], `${path}.price`, 1);
  num(o['growth10y'], `${path}.growth10y`, -1, 1);
  num(o['rent'], `${path}.rent`, 1);
  num(o['rentGrowth'], `${path}.rentGrowth`, -1, 1);
  optional(
    o,
    'sample',
    (v, p) => arr(v, p).map((f, i) => oneOf(f, AREA_FIELDS, `${p}[${i}]`)),
    path,
  );
  return o as unknown as AreaFigures;
}

export function parseAreasFile(value: unknown, path = 'areas.json'): AreasFile {
  const o = obj(value, path);
  schemaVersion(o, path);
  str(o['generatedAt'], `${path}.generatedAt`, DATE);
  const asOf = obj(o['asOf'], `${path}.asOf`);
  str(asOf['price'], `${path}.asOf.price`, MONTH);
  str(asOf['rent'], `${path}.asOf.rent`, MONTH);
  const nations = obj(o['nations'], `${path}.nations`);
  for (const nation of NATIONS) figures(nations[nation], `${path}.nations.${nation}`);

  const slugs = new Set<string>();
  const codes = new Set<string>();
  arr(o['areas'], `${path}.areas`).forEach((item, i) => {
    const p = `${path}.areas[${i}]`;
    const a = figures(item, p) as unknown as Obj;
    const code = str(a['code'], `${p}.code`, /^[ENSW]\d{8}$/);
    const slug = str(a['slug'], `${p}.slug`, SLUG);
    str(a['name'], `${p}.name`);
    oneOf(a['nation'], NATIONS, `${p}.nation`);
    arr(a['fallbacks'], `${p}.fallbacks`).forEach((f, j) =>
      oneOf(f, AREA_FIELDS, `${p}.fallbacks[${j}]`),
    );
    if (slugs.has(slug)) throw new DataError(`${p}.slug`, `duplicate slug "${slug}"`);
    if (codes.has(code)) throw new DataError(`${p}.code`, `duplicate code "${code}"`);
    slugs.add(slug);
    codes.add(code);
    optional(
      a,
      'asOf',
      (v, q) => {
        const m = obj(v, q);
        optional(m, 'price', (x, r) => str(x, r, MONTH), q);
        optional(m, 'rent', (x, r) => str(x, r, MONTH), q);
      },
      p,
    );
    optional(a, 'rentArea', str, p);
  });
  return o as unknown as AreasFile;
}

export function parseRatesFile(value: unknown, path = 'rates.json'): RatesFile {
  const o = obj(value, path);
  schemaVersion(o, path);
  str(o['generatedAt'], `${path}.generatedAt`, DATE);
  str(o['asOf'], `${path}.asOf`, MONTH);
  str(o['source'], `${path}.source`);
  const rates = arr(o['rates'], `${path}.rates`);
  if (rates.length === 0) throw new DataError(`${path}.rates`, 'expected at least one rate');
  rates.forEach((item, i) => {
    const p = `${path}.rates[${i}]`;
    const r = obj(item, p);
    num(r['fixYears'], `${p}.fixYears`, 1, 10);
    oneOf(r['ltv'], LTV_BANDS, `${p}.ltv`);
    num(r['rate'], `${p}.rate`, 0, 0.25);
    str(r['series'], `${p}.series`);
    optional(r, 'asOf', (x, q) => str(x, q, MONTH), p);
  });
  return o as unknown as RatesFile;
}

export function parseSourcesFile(value: unknown, path = 'sources.json'): SourcesFile {
  const o = obj(value, path);
  schemaVersion(o, path);
  str(o['generatedAt'], `${path}.generatedAt`, DATE);
  arr(o['sources'], `${path}.sources`).forEach((item, i) => {
    const p = `${path}.sources[${i}]`;
    const s = obj(item, p);
    for (const key of ['id', 'dataset', 'publisher', 'url', 'licence']) str(s[key], `${p}.${key}`);
    str(s['asOf'], `${p}.asOf`, MONTH);
  });
  return o as unknown as SourcesFile;
}

function bands(value: unknown, path: string): TaxBand[] {
  const list = arr(value, path);
  if (list.length === 0) throw new DataError(path, 'expected at least one band');
  let expectedFrom = 0;
  list.forEach((item, i) => {
    const p = `${path}[${i}]`;
    const b = obj(item, p);
    const from = num(b['from'], `${p}.from`, 0);
    if (from !== expectedFrom) {
      throw new DataError(`${p}.from`, `expected ${expectedFrom} (bands must be contiguous)`);
    }
    num(b['rate'], `${p}.rate`, 0, 1);
    const last = i === list.length - 1;
    if (last) {
      if (b['to'] !== null) throw new DataError(`${p}.to`, 'the last band must have to: null');
    } else {
      expectedFrom = num(b['to'], `${p}.to`, from + 1);
    }
  });
  return list as TaxBand[];
}

export function parseTaxRules(value: unknown, path = 'taxRules.json'): TaxRules {
  const o = obj(value, path);
  schemaVersion(o, path);
  str(o['effectiveFrom'], `${path}.effectiveFrom`, DATE);
  str(o['taxYear'], `${path}.taxYear`, /^\d{4}\/\d{2}$/);
  const regimeIds = ['sdlt', 'lbtt', 'ltt'] as const;
  const nations = obj(o['nations'], `${path}.nations`);
  for (const nation of NATIONS) oneOf(nations[nation], regimeIds, `${path}.nations.${nation}`);
  const regimes = obj(o['regimes'], `${path}.regimes`);
  for (const id of regimeIds) {
    const p = `${path}.regimes.${id}`;
    const r = obj(regimes[id], p);
    for (const key of ['name', 'shortName', 'plainName']) str(r[key], `${p}.${key}`);
    bands(r['bands'], `${p}.bands`);
    if (r['firstTimeBuyer'] !== null) {
      const f = obj(r['firstTimeBuyer'], `${p}.firstTimeBuyer`);
      bands(f['bands'], `${p}.firstTimeBuyer.bands`);
      if (f['maxPrice'] !== null) num(f['maxPrice'], `${p}.firstTimeBuyer.maxPrice`, 0);
    }
    const a = obj(r['additional'], `${p}.additional`);
    const kind = oneOf(
      a['kind'],
      ['wholePriceSurcharge', 'higherRatesTable'] as const,
      `${p}.additional.kind`,
    );
    num(a['minPrice'], `${p}.additional.minPrice`, 0);
    if (kind === 'wholePriceSurcharge') num(a['rate'], `${p}.additional.rate`, 0, 1);
    else bands(a['bands'], `${p}.additional.bands`);
    arr(r['sources'], `${p}.sources`).forEach((s, i) => {
      const q = `${p}.sources[${i}]`;
      const so = obj(s, q);
      str(so['title'], `${q}.title`);
      str(so['url'], `${q}.url`, /^https:\/\//);
      str(so['checked'], `${q}.checked`, DATE);
    });
  }
  return o as unknown as TaxRules;
}

export function parseDefaults(value: unknown, path = 'defaults.json'): DefaultsFile {
  const o = obj(value, path);
  schemaVersion(o, path);
  const fields = obj(o['fields'], `${path}.fields`);
  for (const key of NUMERIC_INPUT_KEYS) {
    const p = `${path}.fields.${key}`;
    const f = obj(fields[key], p);
    str(f['label'], `${p}.label`);
    oneOf(
      f['unit'],
      ['gbp', 'gbpPerMonth', 'gbpPerYear', 'percent', 'percentPerYear', 'years'] as const,
      `${p}.unit`,
    );
    oneOf(f['level'], ['simple', 'advanced'] as const, `${p}.level`);
    const min = num(f['min'], `${p}.min`);
    const max = num(f['max'], `${p}.max`, min);
    num(f['step'], `${p}.step`, Number.MIN_VALUE);
    if (f['default'] !== null) num(f['default'], `${p}.default`, min, max);
    else if (!DERIVED_INPUT_KEYS.includes(key)) {
      throw new DataError(`${p}.default`, 'expected a number (only derived fields may be null)');
    }
    optional(
      f,
      'byNation',
      (v, q) => {
        const b = obj(v, q);
        for (const n of Object.keys(b)) {
          oneOf(n, NATIONS, `${q}.${n}`);
          num(b[n], `${q}.${n}`, min, max);
        }
      },
      p,
    );
    str(f['source'], `${p}.source`);
  }
  for (const key of Object.keys(fields)) {
    oneOf(key, NUMERIC_INPUT_KEYS, `${path}.fields.${key}`);
  }
  num(o['depositFraction'], `${path}.depositFraction`, Number.MIN_VALUE, 1);
  const clamps = obj(o['areaClamps'], `${path}.areaClamps`);
  for (const key of ['houseGrowth', 'rentGrowth']) {
    const c = obj(clamps[key], `${path}.areaClamps.${key}`);
    const min = num(c['min'], `${path}.areaClamps.${key}.min`);
    num(c['max'], `${path}.areaClamps.${key}.max`, min);
  }
  const presets = obj(o['presets'], `${path}.presets`);
  for (const name of PRESET_NAMES) {
    const p = `${path}.presets.${name}`;
    const s = obj(presets[name], p);
    str(s['label'], `${p}.label`);
    str(s['description'], `${p}.description`);
    for (const key of ['houseGrowth', 'rentGrowth']) {
      const adj = obj(s[key], `${p}.${key}`);
      num(adj['add'], `${p}.${key}.add`);
      if (adj['cap'] !== null) num(adj['cap'], `${p}.${key}.cap`);
    }
    num(s['investmentReturn'], `${p}.investmentReturn`, -1, 1);
    num(s['rateAfterFixDelta'], `${p}.rateAfterFixDelta`, -1, 1);
  }
  oneOf(o['defaultPreset'], PRESET_NAMES, `${path}.defaultPreset`);
  oneOf(o['defaultBuyerType'], BUYER_TYPES, `${path}.defaultBuyerType`);
  oneOf(o['defaultNation'], NATIONS, `${path}.defaultNation`);
  return o as unknown as DefaultsFile;
}
