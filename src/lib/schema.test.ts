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
});
