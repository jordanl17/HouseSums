/**
 * Nation names and URL slugs (phase 5). Pure: no DOM, no JSON.
 *
 * Nation pages live at /rent-vs-buy/{slug}/ next to the area pages, so an area slug must never
 * equal a nation slug. The data checks (scripts/data/validate.ts) and src/lib/areas.ts both
 * enforce that.
 */
import { NATIONS, type Nation } from './types';

export const NATION_NAMES: Readonly<Record<Nation, string>> = {
  eng: 'England',
  sco: 'Scotland',
  wal: 'Wales',
  ni: 'Northern Ireland',
};

/** URL slugs, never renamed once live: /rent-vs-buy/england/ and so on. */
export const NATION_SLUGS: Readonly<Record<Nation, string>> = {
  eng: 'england',
  sco: 'scotland',
  wal: 'wales',
  ni: 'northern-ireland',
};

/** The nation a slug names, or null. */
export function nationFromSlug(slug: string): Nation | null {
  return NATIONS.find((nation) => NATION_SLUGS[nation] === slug) ?? null;
}

/** True when the slug is one of the four nation slugs. */
export function isNationSlug(slug: string): boolean {
  return nationFromSlug(slug) !== null;
}
