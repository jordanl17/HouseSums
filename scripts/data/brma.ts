/**
 * data/brma-map.json: which Broad Rental Market Area supplies the rent for each Scottish council
 * area and Northern Ireland district. See the file's own "method" and docs/decisions.md.
 */

export interface BrmaMapEntry {
  /** Local authority code (S12... or N09...). */
  code: string;
  /** ONS local authority name, for people reading the file. */
  name: string;
  /** BRMA name as ONS private rents publishes it, without the trailing "BRMA". */
  rentArea: string;
  /** The BRMA's GSS code where ONS gives one (Scotland, S33...); null in Northern Ireland. */
  rentAreaCode: string | null;
  /** Northern Ireland: every BRMA the district overlaps, best match first. */
  overlaps?: string[];
}

export interface BrmaMap {
  schemaVersion: 1;
  description: string;
  method: string;
  source: { title: string; url: string; checked: string };
  areas: BrmaMapEntry[];
}

export function parseBrmaMap(value: unknown): BrmaMap {
  const o = value as Partial<BrmaMap>;
  if (o?.schemaVersion !== 1) throw new Error('brma-map.json: schemaVersion must be 1');
  if (typeof o.method !== 'string' || !o.method) throw new Error('brma-map.json: method missing');
  if (!o.source || typeof o.source.url !== 'string')
    throw new Error('brma-map.json: source missing');
  if (!Array.isArray(o.areas)) throw new Error('brma-map.json: areas must be an array');
  const seen = new Set<string>();
  o.areas.forEach((a, i) => {
    const p = `brma-map.json.areas[${i}]`;
    if (typeof a?.code !== 'string' || !/^(S12|N09)\d{6}$/.test(a.code)) {
      throw new Error(`${p}.code: expected a Scottish or NI local authority code`);
    }
    if (seen.has(a.code)) throw new Error(`${p}.code: duplicate ${a.code}`);
    seen.add(a.code);
    if (typeof a.rentArea !== 'string' || !a.rentArea) throw new Error(`${p}.rentArea missing`);
    if (a.rentAreaCode !== null && !/^S33\d{6}$/.test(String(a.rentAreaCode))) {
      throw new Error(`${p}.rentAreaCode: expected S33... or null`);
    }
  });
  return o as BrmaMap;
}
