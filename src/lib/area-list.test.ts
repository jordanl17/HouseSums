import { describe, expect, it } from 'vitest';
import areasJson from '../../data/areas.json';
import { deriveInputs } from './defaults';
import defaultsJson from '../../data/defaults.json';
import ratesJson from '../../data/rates.json';
import { parseAreaList, toAreaList, findClientArea, AreaListError } from './area-list';
import { parseAreasFile, parseDefaults, parseRatesFile } from './schema';

const areas = parseAreasFile(areasJson);
const defaults = parseDefaults(defaultsJson);
const rates = parseRatesFile(ratesJson);

describe('area list', () => {
  const list = toAreaList(areas);

  it('keeps every area, in order, and round-trips through JSON', () => {
    const parsed = parseAreaList(JSON.parse(JSON.stringify(list)));
    expect(parsed.map((a) => a.slug)).toEqual(areas.areas.map((a) => a.slug));
    expect(parsed).toHaveLength(361);
  });

  it('is much smaller than areas.json', () => {
    expect(JSON.stringify(list).length).toBeLessThan(JSON.stringify(areasJson).length * 0.6);
  });

  it('gives deriveInputs exactly what the full file gives it, for every area', () => {
    const parsed = parseAreaList(JSON.parse(JSON.stringify(list)));
    const selection = {
      areaSlug: null,
      buyerType: defaults.defaultBuyerType,
      outlook: defaults.defaultPreset,
      nationOverride: null,
    };
    const meta = { asOf: areas.asOf, nations: areas.nations };
    for (const full of areas.areas) {
      const client = findClientArea(parsed, full.slug);
      expect(client).not.toBeNull();
      const s = { ...selection, areaSlug: full.slug };
      const fromFull = deriveInputs({ area: full, areas, rates, defaults, selection: s });
      const fromClient = deriveInputs({ area: client, areas: meta, rates, defaults, selection: s });
      expect(fromClient).toEqual(fromFull);
    }
  });

  it('rejects malformed rows with the row number', () => {
    expect(() => parseAreaList({ v: 1, areas: [['x', 'X', 'eng', 1, 0, 1]] })).toThrow(
      /areas\[0\]/,
    );
    expect(() => parseAreaList({ v: 1, areas: [['x', 'X', 'mars', 1, 0, 1, 0]] })).toThrow(
      AreaListError,
    );
    expect(() =>
      parseAreaList({ v: 1, areas: [['x', 'X', 'eng', 1, 0, 1, 0, { fallbacks: ['nope'] }]] }),
    ).toThrow(AreaListError);
    expect(() => parseAreaList({ v: 2, areas: [] })).toThrow(/version/);
    expect(() => parseAreaList(null)).toThrow(AreaListError);
  });
});
