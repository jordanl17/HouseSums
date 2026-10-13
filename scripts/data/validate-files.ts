/**
 * Validates a directory of data files (by default the committed data/): the schema of every
 * JSON file, then the brief's checks that need no previous month (prices and rents present,
 * fallbacks hold nation figures, unique slugs, BRMA map coverage, every rate series present).
 * Optionally compares with a previous directory for the month-on-month and count checks.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AreasFile, RatesFile, SourcesFile } from '../../src/lib/types.ts';
import { parseAreaNames, parseDefaults, parseTaxRules } from '../../src/lib/schema.ts';
import { checkAreaNames } from './area-names.ts';
import { parseBrmaMap } from './brma.ts';
import {
  checkAreas,
  checkBrmaMap,
  checkRates,
  checkSources,
  mergeResults,
  type CheckOptions,
  type CheckResult,
} from './validate.ts';

async function readJson(dir: string, name: string): Promise<unknown> {
  return JSON.parse(await readFile(join(dir, name), 'utf8'));
}

function attempt(label: string, fn: () => CheckResult | void): CheckResult {
  try {
    return fn() ?? { errors: [], warnings: [] };
  } catch (error) {
    return {
      errors: [`${label}: ${error instanceof Error ? error.message : String(error)}`],
      warnings: [],
    };
  }
}

export async function validateDirectory(
  dir: string,
  previousDir?: string,
  options: CheckOptions = {},
): Promise<CheckResult> {
  const results: CheckResult[] = [];
  const load = async (name: string) => {
    try {
      return await readJson(dir, name);
    } catch (error) {
      results.push({
        errors: [`${name}: ${error instanceof Error ? error.message : String(error)}`],
        warnings: [],
      });
      return null;
    }
  };
  const [areas, rates, sources, taxRules, defaults, brmaMap, areaNames] = await Promise.all(
    [
      'areas.json',
      'rates.json',
      'sources.json',
      'taxRules.json',
      'defaults.json',
      'brma-map.json',
      'area-names.json',
    ].map(load),
  );
  let prevAreas: AreasFile | null = null;
  let prevRates: RatesFile | null = null;
  if (previousDir) {
    prevAreas = (await readJson(previousDir, 'areas.json').catch(() => null)) as AreasFile | null;
    prevRates = (await readJson(previousDir, 'rates.json').catch(() => null)) as RatesFile | null;
  }
  if (areas)
    results.push(attempt('areas.json', () => checkAreas(areas as AreasFile, prevAreas, options)));
  if (rates)
    results.push(attempt('rates.json', () => checkRates(rates as RatesFile, prevRates, options)));
  if (sources) results.push(attempt('sources.json', () => checkSources(sources as SourcesFile)));
  if (taxRules) results.push(attempt('taxRules.json', () => void parseTaxRules(taxRules)));
  if (defaults) results.push(attempt('defaults.json', () => void parseDefaults(defaults)));
  if (brmaMap) {
    results.push(
      attempt('brma-map.json', () => {
        const map = parseBrmaMap(brmaMap);
        return areas ? checkBrmaMap(areas as AreasFile, map) : undefined;
      }),
    );
  }
  if (areaNames) {
    results.push(
      attempt('area-names.json', () => {
        const names = parseAreaNames(areaNames);
        return areas ? checkAreaNames(areas as AreasFile, names) : undefined;
      }),
    );
  }
  return mergeResults(...results);
}
