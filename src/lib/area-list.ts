/**
 * The compact area list the calculator fetches at runtime (phase 4).
 *
 * data/areas.json is about 90KB and carries fields the browser never needs (ONS codes, the
 * pipeline timestamp). The build writes a smaller file, `data/area-list.json` under the site's
 * base path (src/pages/data/area-list.json.ts), holding only what the area picker and
 * deriveInputs read. The island fetches it from our own origin, so the list is never bundled
 * as JavaScript.
 *
 * Shape (version 1): one row per area, in the same order as areas.json (sorted by name):
 *
 *   { "v": 1, "areas": [[slug, name, nation, price, growth10y, rent, rentGrowth, extra?], ...] }
 *
 * `extra` is present only when the area has fallbacks, per-area months, a rental area or
 * sample flags: { fallbacks?, asOf?, rentArea?, sample? } with the same meaning as in Area.
 * The file's months and the nation figures are not in the list: the page passes them to the
 * island as props (AreasMeta), because deriveInputs needs them before any area is picked.
 *
 * Pure: no DOM, no JSON imports.
 */
import type { DeriveArea } from './defaults';
import { AREA_FIELDS, NATIONS, type AreaField, type AreasFile, type Nation } from './types';

/** An area as the client holds it: everything deriveInputs needs, without the ONS code. */
export type ClientArea = DeriveArea;

type Extra = Partial<Pick<ClientArea, 'fallbacks' | 'asOf' | 'rentArea' | 'sample'>>;

export type AreaListRow =
  | [string, string, Nation, number, number, number, number]
  | [string, string, Nation, number, number, number, number, Extra];

export interface AreaListFile {
  v: 1;
  areas: AreaListRow[];
}

/** Build the compact list from a validated areas.json. Used at build time by the endpoint. */
export function toAreaList(file: AreasFile): AreaListFile {
  return {
    v: 1,
    areas: file.areas.map((area): AreaListRow => {
      const row: AreaListRow = [
        area.slug,
        area.name,
        area.nation,
        area.price,
        area.growth10y,
        area.rent,
        area.rentGrowth,
      ];
      const extra: Extra = {};
      if (area.fallbacks.length > 0) extra.fallbacks = [...area.fallbacks];
      if (area.asOf && Object.keys(area.asOf).length > 0) extra.asOf = { ...area.asOf };
      if (area.rentArea !== undefined) extra.rentArea = area.rentArea;
      if (area.sample && area.sample.length > 0) extra.sample = [...area.sample];
      return Object.keys(extra).length > 0 ? [...row, extra] : row;
    }),
  };
}

export class AreaListError extends Error {
  constructor(message: string) {
    super(`area-list.json: ${message}`);
    this.name = 'AreaListError';
  }
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isMonth = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);

function fieldList(value: unknown, where: string): AreaField[] {
  if (!Array.isArray(value) || !value.every((f) => AREA_FIELDS.includes(f as AreaField))) {
    throw new AreaListError(`${where} must be a list of area fields`);
  }
  return value as AreaField[];
}

/**
 * Validate and expand the fetched JSON into ClientArea objects. Throws AreaListError with the
 * row number on anything malformed, so a broken deploy fails loudly in the e2e tests rather
 * than quietly giving wrong figures.
 */
export function parseAreaList(json: unknown): ClientArea[] {
  if (typeof json !== 'object' || json === null) throw new AreaListError('not an object');
  const file = json as Partial<AreaListFile>;
  if (file.v !== 1) throw new AreaListError(`unsupported version ${String(file.v)}`);
  if (!Array.isArray(file.areas)) throw new AreaListError('areas must be a list');

  return file.areas.map((row: unknown, index): ClientArea => {
    const where = `areas[${index}]`;
    if (!Array.isArray(row) || row.length < 7 || row.length > 8) {
      throw new AreaListError(`${where} must have 7 or 8 entries`);
    }
    const [slug, name, nation, price, growth10y, rent, rentGrowth, extra] = row as unknown[];
    if (typeof slug !== 'string' || slug === '') throw new AreaListError(`${where} slug`);
    if (typeof name !== 'string' || name === '') throw new AreaListError(`${where} name`);
    if (!NATIONS.includes(nation as Nation)) throw new AreaListError(`${where} nation`);
    for (const [label, value] of [
      ['price', price],
      ['growth10y', growth10y],
      ['rent', rent],
      ['rentGrowth', rentGrowth],
    ] as const) {
      if (!isFiniteNumber(value)) throw new AreaListError(`${where} ${label}`);
    }
    const area: ClientArea = {
      slug,
      name,
      nation: nation as Nation,
      price: price as number,
      growth10y: growth10y as number,
      rent: rent as number,
      rentGrowth: rentGrowth as number,
      fallbacks: [],
    };
    if (extra !== undefined) {
      if (typeof extra !== 'object' || extra === null) throw new AreaListError(`${where} extra`);
      const more = extra as Record<string, unknown>;
      if (more.fallbacks !== undefined) area.fallbacks = fieldList(more.fallbacks, where);
      if (more.sample !== undefined) area.sample = fieldList(more.sample, where);
      if (more.rentArea !== undefined) {
        if (typeof more.rentArea !== 'string') throw new AreaListError(`${where} rentArea`);
        area.rentArea = more.rentArea;
      }
      if (more.asOf !== undefined) {
        const asOf = more.asOf as Record<string, unknown>;
        if (typeof asOf !== 'object' || asOf === null) throw new AreaListError(`${where} asOf`);
        area.asOf = {};
        for (const key of ['price', 'rent'] as const) {
          if (asOf[key] === undefined) continue;
          if (!isMonth(asOf[key])) throw new AreaListError(`${where} asOf.${key}`);
          area.asOf[key] = asOf[key];
        }
      }
    }
    return area;
  });
}

/** Find an area by slug in the client list. */
export function findClientArea(
  list: readonly ClientArea[],
  slug: string | null,
): ClientArea | null {
  if (slug === null) return null;
  return list.find((area) => area.slug === slug) ?? null;
}
