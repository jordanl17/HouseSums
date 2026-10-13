import { describe, expect, it } from 'vitest';
import areaNamesJson from '../../data/area-names.json';
import areasJson from '../../data/areas.json';
import { parseAreaNames, parseAreasFile } from '../../src/lib/schema.ts';
import { decodeState } from '../../src/lib/state.ts';
import { parseDefaults } from '../../src/lib/schema.ts';
import defaultsJson from '../../data/defaults.json';
import type { AreaNamesFile, AreasFile } from '../../src/lib/types.ts';
import { AWKWARD_NAME, aliasMap, applyAreaNames, checkAreaNames } from './area-names.ts';
import { areasFile } from './fixtures.ts';
import { slugify } from './util.ts';

const NAMES: AreaNamesFile = {
  schemaVersion: 1,
  description: 'test',
  method: 'test',
  areas: [
    {
      code: 'E06000010',
      ons: 'Kingston upon Hull, City of',
      name: 'Kingston upon Hull',
      slug: 'kingston-upon-hull',
    },
  ],
  aliases: { 'kingston-upon-hull-city-of': 'kingston-upon-hull' },
};

/** A fixture file with Hull as buildAreas writes it: ONS name, slugify()'d slug. */
function withHull(): AreasFile {
  const file = areasFile();
  const leeds = file.areas.find((a) => a.slug === 'leeds')!;
  const hull = {
    ...leeds,
    code: 'E06000010',
    name: 'Kingston upon Hull, City of',
    slug: slugify('Kingston upon Hull, City of'),
  };
  return { ...file, areas: [...file.areas, hull] };
}

describe('AWKWARD_NAME', () => {
  it('matches the "X, City of" and "X, County of" forms only', () => {
    expect(AWKWARD_NAME.test('Bristol, City of')).toBe(true);
    expect(AWKWARD_NAME.test('Herefordshire, County of')).toBe(true);
    expect(AWKWARD_NAME.test('Kingston upon Hull, City of')).toBe(true);
    expect(AWKWARD_NAME.test('City of London')).toBe(false);
    expect(AWKWARD_NAME.test('City of Edinburgh')).toBe(false);
    expect(AWKWARD_NAME.test('Glasgow City')).toBe(false);
    expect(AWKWARD_NAME.test('Armagh City, Banbridge and Craigavon')).toBe(false);
  });
});

describe('applyAreaNames', () => {
  it('swaps in the display name and slug and keeps the ONS name', () => {
    const { file, notes } = applyAreaNames(withHull(), NAMES);
    const hull = file.areas.find((a) => a.code === 'E06000010')!;
    expect(hull.slug).toBe('kingston-upon-hull');
    expect(hull.name).toBe('Kingston upon Hull');
    expect(hull.onsName).toBe('Kingston upon Hull, City of');
    expect(notes).toEqual([]);
    expect(() => parseAreasFile(file)).not.toThrow();
  });

  it('keeps the file sorted by name', () => {
    const { file } = applyAreaNames(withHull(), NAMES);
    const names = file.areas.map((a) => a.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'en-GB')));
  });

  it('is idempotent', () => {
    const once = applyAreaNames(withHull(), NAMES).file;
    const twice = applyAreaNames(once, NAMES).file;
    expect(twice).toEqual(once);
  });

  it('leaves areas without an entry alone', () => {
    const before = withHull();
    const after = applyAreaNames(before, NAMES).file;
    expect(after.areas.find((a) => a.slug === 'leeds')).toEqual(
      before.areas.find((a) => a.slug === 'leeds'),
    );
  });

  it('notes an ONS rename but keeps the slug stable', () => {
    const renamed = withHull();
    renamed.areas.at(-1)!.name = 'Hull, City of';
    const { file, notes } = applyAreaNames(renamed, NAMES);
    expect(file.areas.find((a) => a.code === 'E06000010')!.slug).toBe('kingston-upon-hull');
    expect(file.areas.find((a) => a.code === 'E06000010')!.onsName).toBe('Hull, City of');
    expect(notes.join('\n')).toMatch(/ONS now names it "Hull, City of"/);
  });
});

describe('checkAreaNames', () => {
  it('passes once the mapping is applied', () => {
    const { file } = applyAreaNames(withHull(), NAMES);
    expect(checkAreaNames(file, NAMES).errors).toEqual([]);
  });

  it('fails while an awkward ONS name has no entry', () => {
    const { errors } = checkAreaNames(withHull(), { ...NAMES, areas: [], aliases: {} });
    expect(errors.join('\n')).toMatch(
      /Kingston upon Hull, City of \(E06000010\).*area-names\.json/,
    );
  });

  it('fails when the old slug is not kept as an alias', () => {
    const names = { ...NAMES, aliases: {} };
    const { file } = applyAreaNames(withHull(), names);
    expect(checkAreaNames(file, names).errors.join('\n')).toMatch(
      /add the alias "kingston-upon-hull-city-of"/,
    );
  });

  it('fails when an alias shadows a live slug, a nation slug or points nowhere', () => {
    const names = {
      ...NAMES,
      aliases: { ...NAMES.aliases, leeds: 'kingston-upon-hull', scotland: 'leeds', old: 'gone' },
    };
    const { file } = applyAreaNames(withHull(), names);
    const errors = checkAreaNames(file, names).errors.join('\n');
    expect(errors).toMatch(/alias "leeds" is also a live area slug/);
    expect(errors).toMatch(/alias "scotland" is a nation page slug/);
    expect(errors).toMatch(/alias "old" points at "gone", which is not an area/);
  });

  it('fails when an area slug is a nation slug', () => {
    const file = areasFile();
    file.areas[0]!.slug = 'wales';
    expect(checkAreaNames(file, { ...NAMES, areas: [], aliases: {} }).errors.join('\n')).toMatch(
      /slug "wales" is a nation page slug/,
    );
  });
});

describe('committed data/area-names.json', () => {
  const names = parseAreaNames(areaNamesJson);
  const areas = parseAreasFile(areasJson);

  it('is applied to the committed areas.json', () => {
    expect(checkAreaNames(areas, names)).toEqual({ errors: [], warnings: [] });
    expect(applyAreaNames(areas, names).file).toEqual(areas);
  });

  it('gives the friendly slugs and display names', () => {
    const bySlug = (slug: string) => areas.areas.find((a) => a.slug === slug);
    expect(bySlug('bristol')).toMatchObject({ name: 'Bristol', onsName: 'Bristol, City of' });
    expect(bySlug('kingston-upon-hull')).toMatchObject({
      name: 'Kingston upon Hull',
      onsName: 'Kingston upon Hull, City of',
    });
    expect(bySlug('herefordshire')).toMatchObject({
      name: 'Herefordshire',
      onsName: 'Herefordshire, County of',
    });
    expect(areas.areas.filter((a) => /-(city|county)-of$/.test(a.slug))).toEqual([]);
  });

  it('keeps the old slugs as aliases that decode to the new ones', () => {
    const defaults = parseDefaults(defaultsJson);
    const known = new Set(areas.areas.map((a) => a.slug));
    const aliases = aliasMap(names);
    for (const [old, current] of Object.entries(aliases)) {
      expect(decodeState(`a=${old}`, defaults, known, aliases).selection.areaSlug).toBe(current);
      expect(decodeState(`a=${old}`, defaults, undefined, aliases).selection.areaSlug).toBe(
        current,
      );
    }
    expect(Object.keys(aliases).sort()).toEqual([
      'bristol-city-of',
      'herefordshire-county-of',
      'kingston-upon-hull-city-of',
    ]);
  });
});
