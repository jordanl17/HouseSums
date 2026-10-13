/**
 * Build-time loader for the calculator island's data (phase 4). Imports the JSON under data/,
 * validates it once with src/lib/schema.ts and returns exactly what the island needs: defaults,
 * tax rules, rates and the nation-level part of areas.json (not the area list, which the island
 * fetches from data/area-list.json).
 *
 * Phase 6 (perf): the data is no longer a prop serialised into every page. This module hands it
 * to the island's server render (provideIslandData below), src/pages/data/calculator.json.ts
 * writes it to one cacheable file for the browser, and calculatorLinks().data points at that
 * file with a hash of its content.
 *
 * Only Astro pages and endpoints import this (it pulls in the JSON); never import it from the
 * island or any client code. Phase 5's area pages use it too, with areaForPage() for the
 * area's own figures.
 */
import { createHash } from 'node:crypto';
import areaNamesJson from '../../data/area-names.json';
import areasJson from '../../data/areas.json';
import defaultsJson from '../../data/defaults.json';
import ratesJson from '../../data/rates.json';
import taxRulesJson from '../../data/taxRules.json';
import {
  ISLAND_DATA_VERSION,
  provideIslandData,
  type IslandDataFile,
} from '../components/calculator/island-data';
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
import type { Preload } from './preload';
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

/** The island's data, validated (the server render and data/calculator.json both use it). */
export function calculatorData(): CalculatorData {
  return load().data;
}

// The island's server render reads its data from here (src/components/calculator/island-data.ts).
provideIslandData(calculatorData);

let fileText: string | null = null;

/** The text of data/calculator.json: the island's data plus the format version, minified. */
export function calculatorDataText(): string {
  const file: IslandDataFile = { v: ISLAND_DATA_VERSION, ...calculatorData() };
  fileText ??= JSON.stringify(file);
  return fileText;
}

/** The first 10 hex digits of the SHA-256 of data/calculator.json, for its URL. */
export function calculatorDataHash(): string {
  return createHash('sha256').update(calculatorDataText()).digest('hex').slice(0, 10);
}

/**
 * Props for <CalculatorIsland links={...} />: the same on every page that has the island
 * (phase 6), so pages never spell the URLs out by hand. `data` carries the content hash, so a
 * page always asks for the data it was built with.
 */
export function calculatorLinks(): CalculatorLinks & { data: string } {
  return {
    areaList: url('data/area-list.json'),
    howItWorks: url('how-it-works'),
    areaPages: url('rent-vs-buy'),
    data: `${url('data/calculator.json')}?v=${calculatorDataHash()}`,
  };
}

/**
 * Base.astro `preloads` for a page with the island (phase 6): data/calculator.json, so it
 * downloads alongside the island's JavaScript instead of after it.
 */
export function calculatorPreloads(): readonly Preload[] {
  return [{ href: calculatorLinks().data, as: 'fetch' }];
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
