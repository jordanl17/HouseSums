/**
 * ONS Open Geography Portal: local authority district (LAD) names and codes, from the ArcGIS
 * feature service "LAD_<MON>_<YEAR>_UK_NC" (UK, names and codes). The pipeline lists the
 * services and takes the newest, so a new boundary year is picked up without a code change.
 */
import { LOCAL_AUTHORITY_CODE } from './util.ts';

export const ARCGIS_ROOT = 'https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export interface LocalAuthority {
  code: string;
  name: string;
}

/** The newest "LAD_<MON>_<YEAR>_UK_NC[_vN]" service name, or null. */
export function latestLadService(names: readonly string[]): string | null {
  let best: { name: string; rank: number } | null = null;
  for (const name of names) {
    const m = /^LAD_([A-Z]{3})_(\d{4})_UK_NC(?:_v(\d+))?$/i.exec(name);
    if (!m?.[1] || !m[2]) continue;
    const month = MONTHS.indexOf(m[1].toUpperCase());
    if (month < 0) continue;
    const rank = Number(m[2]) * 10000 + month * 100 + Number(m[3] ?? 1);
    if (!best || rank > best.rank) best = { name, rank };
  }
  return best?.name ?? null;
}

export function serviceListUrl(): string {
  return `${ARCGIS_ROOT}?f=json`;
}

export function ladQueryUrl(service: string): string {
  const params = new URLSearchParams({
    where: '1=1',
    outFields: '*',
    returnGeometry: 'false',
    f: 'json',
    resultRecordCount: '2000',
  });
  return `${ARCGIS_ROOT}/${service}/FeatureServer/0/query?${params.toString()}`;
}

export function parseServiceList(json: unknown): string[] {
  const services = (json as { services?: { name?: unknown }[] }).services;
  if (!Array.isArray(services)) throw new Error('ONS geography: no services in the list');
  return services.map((s) => s.name).filter((n): n is string => typeof n === 'string');
}

/** LAD codes and names from a feature query. Fields are found by pattern (LAD25CD, LAD25NM...). */
export function parseLadQuery(json: unknown): LocalAuthority[] {
  const body = json as {
    features?: { attributes?: Record<string, unknown> }[];
    exceededTransferLimit?: boolean;
  };
  if (!Array.isArray(body.features)) throw new Error('ONS geography: no features in the response');
  if (body.exceededTransferLimit) throw new Error('ONS geography: response truncated');
  const out: LocalAuthority[] = [];
  for (const f of body.features) {
    const attrs = f.attributes ?? {};
    const codeKey = Object.keys(attrs).find((k) => /^LAD\d{2}CD$/i.test(k));
    const nameKey = Object.keys(attrs).find((k) => /^LAD\d{2}NM$/i.test(k));
    const code = codeKey ? attrs[codeKey] : undefined;
    const name = nameKey ? attrs[nameKey] : undefined;
    if (typeof code === 'string' && typeof name === 'string' && LOCAL_AUTHORITY_CODE.test(code)) {
      out.push({ code, name: name.trim() });
    }
  }
  if (out.length === 0) throw new Error('ONS geography: no local authorities found');
  return out.sort((a, b) => a.code.localeCompare(b.code));
}
