/**
 * The engine, run in the test process on the same data files the site was built from, so specs
 * can assert that the numbers on screen are exactly what runModel gives for a link (followups
 * teammate). Same flow as the island: decodeState, the area, deriveInputs, runModel.
 *
 * Against the live site this still holds, because the deploy builds from the same commit.
 */
import { readFileSync } from 'node:fs';
import { deriveInputs } from '../../src/lib/defaults';
import { runModel } from '../../src/lib/model';
import { parseAreasFile, parseDefaults, parseRatesFile, parseTaxRules } from '../../src/lib/schema';
import { decodeState } from '../../src/lib/state';
import type { Area, DerivedInputs, ModelResult } from '../../src/lib/types';

const read = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`../../data/${name}`, import.meta.url), 'utf8'));

export const defaults = parseDefaults(read('defaults.json'));
export const taxRules = parseTaxRules(read('taxRules.json'));
export const rates = parseRatesFile(read('rates.json'));
export const areas = parseAreasFile(read('areas.json'));

export interface Expected {
  area: Area | null;
  derived: DerivedInputs;
  result: ModelResult;
}

/** What the island should show for a query such as REFERENCE_QUERY. */
export function expectedFor(query: string): Expected {
  const slugs = new Set(areas.areas.map((a) => a.slug));
  const { selection, overrides } = decodeState(query, defaults, slugs);
  const area = areas.areas.find((a) => a.slug === selection.areaSlug) ?? null;
  const derived = deriveInputs({ area, areas, rates, defaults, selection, overrides });
  return { area, derived, result: runModel(derived.inputs, taxRules) };
}
