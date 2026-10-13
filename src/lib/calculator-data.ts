/**
 * Build-time loader for the calculator island's data props (phase 4). Imports the JSON under
 * data/, validates it once with src/lib/schema.ts and returns exactly what the island needs:
 * defaults, tax rules, rates and the nation-level part of areas.json (not the area list, which
 * the island fetches from data/area-list.json).
 *
 * Only Astro pages and endpoints import this (it pulls in the JSON); never import it from the
 * island or any client code. Phase 5's area pages use it too, with areaForPage() for the
 * area's own figures.
 */
import areaNamesJson from '../../data/area-names.json';
import areasJson from '../../data/areas.json';
import defaultsJson from '../../data/defaults.json';
import ratesJson from '../../data/rates.json';
import taxRulesJson from '../../data/taxRules.json';
import type { CalculatorData, CalculatorLinks } from '../components/calculator/types';
import type { ClientArea } from './area-list';
import {
  parseAreaNames,
  parseAreasFile,
  parseDefaults,
  parseRatesFile,
  parseTaxRules,
} from './schema';
import type { AreasFile } from './types';
import { url } from './url';

let cached: { data: CalculatorData; areas: AreasFile } | null = null;

function load(): { data: CalculatorData; areas: AreasFile } {
  if (cached) return cached;
  const areas = parseAreasFile(areasJson);
  cached = {
    areas,
    data: {
      defaults: parseDefaults(defaultsJson),
      taxRules: parseTaxRules(taxRulesJson),
      rates: parseRatesFile(ratesJson),
      areasMeta: { asOf: areas.asOf, nations: areas.nations },
      slugAliases: { ...parseAreaNames(areaNamesJson).aliases },
    },
  };
  return cached;
}

/** Props for <Calculator data={...} />. */
export function calculatorData(): CalculatorData {
  return load().data;
}

/**
 * Props for <Calculator links={...} />: the same on every page that has the island (phase 6), so
 * pages never spell the URLs out by hand.
 */
export function calculatorLinks(): CalculatorLinks {
  return {
    areaList: url('data/area-list.json'),
    howItWorks: url('how-it-works'),
    areaPages: url('rent-vs-buy'),
  };
}

/** The validated areas file, for build-time pages (phase 5 area pages). */
export function areasFile(): AreasFile {
  return load().areas;
}

/** An area as the island takes it in `initialArea` (no ONS code). Null for an unknown slug. */
export function areaForPage(slug: string): ClientArea | null {
  const area = load().areas.areas.find((candidate) => candidate.slug === slug);
  if (!area) return null;
  const { code: _code, ...rest } = area;
  return rest;
}
