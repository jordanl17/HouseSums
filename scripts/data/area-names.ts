/**
 * Display names and slugs for the few local authorities whose ONS name is in the "X, City of" or
 * "X, County of" form (phase 5). The mapping is data/area-names.json, keyed by ONS code, so the
 * slugs stay the same on every refresh.
 *
 * - applyAreaNames: the pipeline step. buildAreas writes ONS names and slugify()'d slugs; this
 *   swaps in the mapped name and slug, keeps the ONS name as `onsName`, and re-sorts by name. It
 *   is idempotent, so it also migrated the committed areas.json without a refetch
 *   (npm run data:names).
 * - checkAreaNames: fails when an area's ONS name has the awkward form but no entry, when an
 *   alias would shadow a live slug or a nation slug, or when an alias points nowhere.
 */
import type { Area, AreaNamesFile, AreasFile } from '../../src/lib/types.ts';
import { NATIONS } from '../../src/lib/types.ts';
import { NATION_SLUGS } from '../../src/lib/nations.ts';
import { slugify } from './util.ts';
import type { CheckResult } from './validate.ts';

/** ONS names that make awkward slugs: "Bristol, City of", "Herefordshire, County of". */
export const AWKWARD_NAME = /,\s*(?:city|county)(?: and county)? of$/i;

/** The area's ONS name, whether or not the mapping has been applied. */
export function onsNameOf(area: Pick<Area, 'name' | 'onsName'>): string {
  return area.onsName ?? area.name;
}

export interface NameResult {
  file: AreasFile;
  /** For the job summary: entries whose ONS name no longer matches what ONS publishes. */
  notes: string[];
}

/** Apply the mapping by ONS code. Pure and idempotent. */
export function applyAreaNames(file: AreasFile, names: AreaNamesFile): NameResult {
  const byCode = new Map(names.areas.map((entry) => [entry.code, entry]));
  const notes: string[] = [];
  const areas = file.areas.map((area): Area => {
    const entry = byCode.get(area.code);
    if (!entry) return area;
    const ons = onsNameOf(area);
    if (ons !== entry.ons) {
      notes.push(
        `${area.code}: ONS now names it "${ons}", not "${entry.ons}"; display name "${entry.name}" and slug "${entry.slug}" kept. Check data/area-names.json.`,
      );
    }
    const { onsName: _old, ...rest } = area;
    const next: Area = { ...rest, slug: entry.slug, name: entry.name };
    if (ons !== entry.name) next.onsName = ons;
    return next;
  });
  areas.sort((a, b) => a.name.localeCompare(b.name, 'en-GB') || a.code.localeCompare(b.code));
  return { file: { ...file, areas }, notes };
}

/** Old slug -> current slug, for the URL state decoder. */
export function aliasMap(names: AreaNamesFile): Record<string, string> {
  return { ...names.aliases };
}

export function checkAreaNames(file: AreasFile, names: AreaNamesFile): CheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const mapped = new Set(names.areas.map((entry) => entry.code));
  const slugs = new Set(file.areas.map((area) => area.slug));
  const nationSlugs = new Set(NATIONS.map((nation) => NATION_SLUGS[nation]));

  for (const area of file.areas) {
    const ons = onsNameOf(area);
    if (AWKWARD_NAME.test(ons) && !mapped.has(area.code)) {
      errors.push(
        `${ons} (${area.code}): ONS name ends in ", City of" or ", County of"; add a display name and slug to data/area-names.json`,
      );
    }
    if (nationSlugs.has(area.slug)) {
      errors.push(`${area.name}: slug "${area.slug}" is a nation page slug`);
    }
  }
  for (const entry of names.areas) {
    const area = file.areas.find((candidate) => candidate.code === entry.code);
    if (!area) {
      warnings.push(`data/area-names.json: ${entry.code} (${entry.name}) is not in areas.json`);
      continue;
    }
    if (area.slug !== entry.slug || area.name !== entry.name) {
      errors.push(
        `${entry.code}: areas.json does not carry the name and slug from area-names.json`,
      );
    }
    const legacy = slugify(entry.ons);
    if (legacy !== entry.slug && names.aliases[legacy] !== entry.slug) {
      errors.push(
        `data/area-names.json: add the alias "${legacy}" -> "${entry.slug}" so older links keep working`,
      );
    }
  }
  for (const [from, to] of Object.entries(names.aliases)) {
    if (slugs.has(from)) errors.push(`alias "${from}" is also a live area slug`);
    if (nationSlugs.has(from)) errors.push(`alias "${from}" is a nation page slug`);
    if (!slugs.has(to)) errors.push(`alias "${from}" points at "${to}", which is not an area`);
  }
  return { errors, warnings };
}
