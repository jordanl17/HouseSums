import { describe, expect, it } from 'vitest';
import areas from '../../data/areas.json';
import defaults from '../../data/defaults.json';
import rates from '../../data/rates.json';
import sources from '../../data/sources.json';
import taxRules from '../../data/taxRules.json';
import {
  DataError,
  parseAreasFile,
  parseDefaults,
  parseRatesFile,
  parseSourcesFile,
  parseTaxRules,
} from './schema';

const clone = <T>(value: T): T => structuredClone(value);

describe('committed data files match the contracts', () => {
  it('areas.json', () => expect(() => parseAreasFile(areas)).not.toThrow());
  it('rates.json', () => expect(() => parseRatesFile(rates)).not.toThrow());
  it('sources.json', () => expect(() => parseSourcesFile(sources)).not.toThrow());
  it('taxRules.json', () => expect(() => parseTaxRules(taxRules)).not.toThrow());
  it('defaults.json', () => expect(() => parseDefaults(defaults)).not.toThrow());
});

describe('validators reject bad data with a path', () => {
  it('duplicate slugs', () => {
    const bad = clone(areas);
    const first = bad.areas[0];
    const second = bad.areas[1];
    if (!first || !second) throw new Error('fixture needs two areas');
    second.slug = first.slug;
    expect(() => parseAreasFile(bad)).toThrow(/areas\[1\]\.slug: duplicate slug/);
  });

  it('a missing price', () => {
    const bad = clone(areas) as { areas: Record<string, unknown>[] };
    delete bad.areas[0]?.['price'];
    expect(() => parseAreasFile(bad)).toThrow(DataError);
  });

  it('a malformed month', () => {
    const bad = clone(rates);
    bad.asOf = '2026-13';
    expect(() => parseRatesFile(bad)).toThrow(/rates\.json\.asOf/);
  });

  it('gaps between tax bands', () => {
    const bad = clone(taxRules);
    const band = bad.regimes.sdlt.bands[1];
    if (!band) throw new Error('fixture needs bands');
    band.from += 1;
    expect(() => parseTaxRules(bad)).toThrow(/bands must be contiguous/);
  });

  it('a default outside its own bounds', () => {
    const bad = clone(defaults);
    bad.fields.years.default = 99;
    expect(() => parseDefaults(bad)).toThrow(/fields\.years\.default/);
  });

  it('a percentage field without whole decimals, or decimals on another field', () => {
    const missing = clone(defaults);
    delete (missing.fields.houseGrowth as { decimals?: number }).decimals;
    expect(() => parseDefaults(missing)).toThrow(/fields\.houseGrowth\.decimals/);
    const fractional = clone(defaults);
    fractional.fields.mortgageRate.decimals = 1.5;
    expect(() => parseDefaults(fractional)).toThrow(/fields\.mortgageRate\.decimals/);
    const tooMany = clone(defaults);
    tooMany.fields.inflation.decimals = 5;
    expect(() => parseDefaults(tooMany)).toThrow(/fields\.inflation\.decimals/);
    const money = clone(defaults);
    (money.fields.price as { decimals?: number }).decimals = 0;
    expect(() => parseDefaults(money)).toThrow(/fields\.price\.decimals/);
  });

  it('every percentage field in defaults.json has its decimals', () => {
    for (const field of Object.values(parseDefaults(defaults).fields)) {
      const percent = field.unit === 'percent' || field.unit === 'percentPerYear';
      expect(field.decimals === undefined).toBe(!percent);
    }
  });
});
