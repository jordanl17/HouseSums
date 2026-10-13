/**
 * Build-time data for the content pages (/how-it-works/, /sources/, /about/). Loads the files
 * under data/ through their schema parsers once: defaults, tax rules, rates and areas come from
 * src/lib/calculator-data.ts (the same validated objects the calculator gets); sources.json and
 * brma-map.json are parsed here.
 *
 * Astro pages and components only; never import this from client code (it pulls in the JSON).
 */
import brmaMapJson from '../../../data/brma-map.json';
import sourcesJson from '../../../data/sources.json';
import { parseBrmaMap, type BrmaMap } from '../../../scripts/data/brma';
import { areasFile, calculatorData } from '../../lib/calculator-data';
import { parseSourcesFile } from '../../lib/schema';
import type { AreasFile, DefaultsFile, RatesFile, SourcesFile, TaxRules } from '../../lib/types';

export interface ContentData {
  defaults: DefaultsFile;
  taxRules: TaxRules;
  rates: RatesFile;
  areas: AreasFile;
  sources: SourcesFile;
  brmaMap: BrmaMap;
}

let cached: ContentData | null = null;

export function contentData(): ContentData {
  if (cached) return cached;
  const { defaults, taxRules, rates } = calculatorData();
  cached = {
    defaults,
    taxRules,
    rates,
    areas: areasFile(),
    sources: parseSourcesFile(sourcesJson),
    brmaMap: parseBrmaMap(brmaMapJson),
  };
  return cached;
}
