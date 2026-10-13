/**
 * Area and nation helpers for the phase 5 pages (build time only).
 *
 * Two layers:
 * - Pure helpers that take the data as arguments (`sortByName`, `closestByPrice`, `areaMonths`,
 *   `typicalAnswerSentence`...), unit tested in areas.test.ts with fixtures.
 * - Build-time wrappers (`getArea`, `areasByNation`, `relatedAreas`, `typicalAnswer`...) over
 *   the committed data, loaded and validated once through src/lib/calculator-data.ts.
 *
 * Never import this module from the island or any client code: through calculator-data it pulls
 * in the JSON under data/. Pages, Astro components, endpoints and build-time tests only.
 *
 * "Typical assumptions" means exactly what the calculator shows for the area before anything is
 * changed: the default buyer type and Outlook preset from defaults.json, no overrides, no nation
 * override. So the answer a page states always equals the island's server-rendered answer.
 */
import { answerCopy, answerFacts, type AnswerCopy } from './copy';
import { areaForPage, areasFile, calculatorData } from './calculator-data';
import { deriveInputs } from './defaults';
import { runModel } from './model';
import { NATION_NAMES, NATION_SLUGS } from './nations';
import { NATIONS } from './types';
import type {
  Area,
  AreaFigures,
  AreasFile,
  DerivedInputs,
  ModelResult,
  Month,
  Nation,
  Selection,
} from './types';
import { url } from './url';

export { NATION_NAMES, NATION_SLUGS, nationFromSlug, isNationSlug } from './nations';

// ---------------------------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------------------------

/** Alphabetical by display name (en-GB collation), then by code for a stable order. */
export function sortByName<T extends Pick<Area, 'name' | 'code'>>(areas: readonly T[]): T[] {
  return [...areas].sort(
    (a, b) => a.name.localeCompare(b.name, 'en-GB') || a.code.localeCompare(b.code),
  );
}

/**
 * The `count` other areas in the same nation with the closest average price (absolute
 * difference), nearest first; ties go to the alphabetically earlier name. Never includes the
 * area itself. Fewer than `count` when the nation has fewer areas.
 */
export function closestByPrice(areas: readonly Area[], area: Area, count = 6): Area[] {
  return areas
    .filter((other) => other.nation === area.nation && other.code !== area.code)
    .map((other) => ({ other, gap: Math.abs(other.price - area.price) }))
    .sort((a, b) => a.gap - b.gap || a.other.name.localeCompare(b.other.name, 'en-GB'))
    .slice(0, count)
    .map(({ other }) => other);
}

/** The months an area's price and rent are for: its own (NI is quarterly) or the file's. */
export function areaMonths(
  area: Pick<Area, 'asOf'>,
  file: Pick<AreasFile, 'asOf'>,
): { price: Month; rent: Month } {
  return {
    price: area.asOf?.price ?? file.asOf.price,
    rent: area.asOf?.rent ?? file.asOf.rent,
  };
}

/** The months a nation's figures are for. */
export function nationMonths(
  nation: Nation,
  file: Pick<AreasFile, 'asOf' | 'nations'>,
): { price: Month; rent: Month } {
  return areaMonths(file.nations[nation], file);
}

/** The ONS name (e.g. "Bristol, City of"); the display name when they are the same. */
export function onsName(area: Pick<Area, 'name' | 'onsName'>): string {
  return area.onsName ?? area.name;
}

/** True when this figure is the nation's, not the area's own (label it so). */
export function isFallback(area: Pick<Area, 'fallbacks'>, field: Area['fallbacks'][number]) {
  return area.fallbacks.includes(field);
}

/**
 * The one-sentence answer at typical assumptions, shared by the area summary and the meta
 * description so they always agree:
 * "At typical assumptions, buying in Leeds pulls ahead after 2 years."
 * "At typical assumptions, renting in Westminster comes out ahead for all 25 years."
 */
export function typicalAnswerSentence(
  name: string,
  breakEvenYear: number | null,
  horizon: number,
): string {
  if (breakEvenYear === null) {
    const span = horizon === 1 ? 'over 1 year' : `for all ${horizon} years`;
    return `At typical assumptions, renting in ${name} comes out ahead ${span}.`;
  }
  const span = breakEvenYear === 1 ? '1 year' : `${breakEvenYear} years`;
  return `At typical assumptions, buying in ${name} pulls ahead after ${span}.`;
}

// ---------------------------------------------------------------------------------------------
// Paths (always through url(), so they work under any base path)
// ---------------------------------------------------------------------------------------------

/** "/HouseSums/rent-vs-buy/leeds/" */
export function areaPath(area: Pick<Area, 'slug'>): string {
  return url(`rent-vs-buy/${area.slug}`);
}

/** "/HouseSums/rent-vs-buy/scotland/" */
export function nationPath(nation: Nation): string {
  return url(`rent-vs-buy/${NATION_SLUGS[nation]}`);
}

/** "/HouseSums/rent-vs-buy/" */
export function nationsIndexPath(): string {
  return url('rent-vs-buy');
}

// ---------------------------------------------------------------------------------------------
// Build-time wrappers over the committed data
// ---------------------------------------------------------------------------------------------

/** Every area, sorted by name (areas.json order). */
export function allAreas(): readonly Area[] {
  return areasFile().areas;
}

/** The area with this slug, or null. Page slugs only; aliases are for the URL state. */
export function getArea(slug: string): Area | null {
  return allAreas().find((area) => area.slug === slug) ?? null;
}

/** Every area in a nation, alphabetical. */
export function areasByNation(nation: Nation): Area[] {
  return sortByName(allAreas().filter((area) => area.nation === nation));
}

/** Six (by default) areas in the same nation with the closest average price. */
export function relatedAreas(area: Area, count = 6): Area[] {
  return closestByPrice(allAreas(), area, count);
}

/** A nation's typical figures (the fallback figures) with their months. */
export function nationFigures(
  nation: Nation,
): AreaFigures & { months: { price: Month; rent: Month } } {
  const file = areasFile();
  const { price, growth10y, rent, rentGrowth } = file.nations[nation];
  return { price, growth10y, rent, rentGrowth, months: nationMonths(nation, file) };
}

/** An area's price and rent months. */
export function monthsFor(area: Area): { price: Month; rent: Month } {
  return areaMonths(area, areasFile());
}

export interface TypicalAnswer {
  /** deriveInputs output: inputs, base and provenance (Local or Typical, source and month). */
  derived: DerivedInputs;
  /** runModel(derived.inputs, taxRules), the same call the island makes. */
  result: ModelResult;
  /** The answer card's words for this result (src/lib/copy.ts). */
  copy: AnswerCopy;
  /** "At typical assumptions, buying in Leeds pulls ahead after 2 years." */
  sentence: string;
}

/** The selection the calculator starts from: default buyer and preset, nothing overridden. */
export function typicalSelection(area: Pick<Area, 'slug'>): Selection {
  const { defaults } = calculatorData();
  return {
    areaSlug: area.slug,
    buyerType: defaults.defaultBuyerType,
    outlook: defaults.defaultPreset,
    nationOverride: null,
  };
}

const answers = new Map<string, TypicalAnswer>();

/**
 * The calculator's answer for the area at typical assumptions, computed exactly as the island
 * does it (deriveInputs with no overrides, then runModel). Cached per slug for the build.
 */
export function typicalAnswer(area: Area): TypicalAnswer {
  const cached = answers.get(area.slug);
  if (cached) return cached;
  const data = calculatorData();
  const derived = deriveInputs({
    area,
    areas: areasFile(),
    rates: data.rates,
    defaults: data.defaults,
    selection: typicalSelection(area),
  });
  const result = runModel(derived.inputs, data.taxRules);
  const horizon = derived.inputs.years;
  const copy = answerCopy(answerFacts(result, horizon, area.name));
  const answer: TypicalAnswer = {
    derived,
    result,
    copy,
    sentence: typicalAnswerSentence(area.name, result.breakEvenYear, horizon),
  };
  answers.set(area.slug, answer);
  return answer;
}

/** The island's `initialArea` prop for an area (no ONS code). */
export function islandArea(area: Area) {
  return areaForPage(area.slug);
}

/** getStaticPaths entries for /rent-vs-buy/[slug]/: every area, then the four nations. */
export type RentVsBuyPage = { kind: 'area'; area: Area } | { kind: 'nation'; nation: Nation };

export function rentVsBuyPaths(): { params: { slug: string }; props: RentVsBuyPage }[] {
  return [
    ...allAreas().map((area) => ({
      params: { slug: area.slug },
      props: { kind: 'area' as const, area },
    })),
    ...NATIONS.map((nation) => ({
      params: { slug: NATION_SLUGS[nation] },
      props: { kind: 'nation' as const, nation },
    })),
  ];
}

/** "England", "Northern Ireland". */
export function nationName(nation: Nation): string {
  return NATION_NAMES[nation];
}
