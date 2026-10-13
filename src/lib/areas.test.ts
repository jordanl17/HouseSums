import { describe, expect, it } from 'vitest';
import {
  allAreas,
  areaMonths,
  areasByNation,
  closestByPrice,
  getArea,
  nationFigures,
  relatedAreas,
  rentVsBuyPaths,
  sortByName,
  typicalAnswer,
  typicalAnswerSentence,
} from './areas';
import { calculatorData, areasFile } from './calculator-data';
import { deriveInputs } from './defaults';
import { runModel } from './model';
import { NATION_SLUGS, isNationSlug, nationFromSlug } from './nations';
import { NATIONS, type Area } from './types';

const area = (code: string, name: string, price: number, nation: Area['nation'] = 'eng'): Area => ({
  code,
  slug: name.toLowerCase(),
  name,
  nation,
  price,
  growth10y: 0.03,
  rent: 1000,
  rentGrowth: 0.03,
  fallbacks: [],
});

describe('pure helpers', () => {
  const list = [
    area('E1', 'Cee', 200000),
    area('E2', 'Bee', 210000),
    area('E3', 'Aye', 190000),
    area('E4', 'Dee', 400000),
    area('S1', 'Scot', 200000, 'sco'),
  ];

  it('sorts by name', () => {
    expect(sortByName(list).map((a) => a.name)).toEqual(['Aye', 'Bee', 'Cee', 'Dee', 'Scot']);
  });

  it('finds the closest prices in the same nation, nearest first, never itself', () => {
    const picked = closestByPrice(list, list[0]!, 2).map((a) => a.name);
    // Aye and Bee are both £10,000 away; the tie goes to the earlier name.
    expect(picked).toEqual(['Aye', 'Bee']);
    expect(closestByPrice(list, list[0]!, 10).map((a) => a.name)).toEqual(['Aye', 'Bee', 'Dee']);
  });

  it('uses the area month when it has one', () => {
    const file = { asOf: { price: '2026-07', rent: '2026-08' } };
    expect(areaMonths({}, file)).toEqual({ price: '2026-07', rent: '2026-08' });
    expect(areaMonths({ asOf: { price: '2026-06' } }, file)).toEqual({
      price: '2026-06',
      rent: '2026-08',
    });
  });

  it('words the typical answer for each case', () => {
    expect(typicalAnswerSentence('Leeds', 2, 25)).toBe(
      'At typical assumptions, buying in Leeds pulls ahead after 2 years.',
    );
    expect(typicalAnswerSentence('Leeds', 1, 25)).toBe(
      'At typical assumptions, buying in Leeds pulls ahead after 1 year.',
    );
    expect(typicalAnswerSentence('Westminster', null, 25)).toBe(
      'At typical assumptions, renting in Westminster comes out ahead for all 25 years.',
    );
  });

  it('maps nation slugs both ways', () => {
    for (const nation of NATIONS) expect(nationFromSlug(NATION_SLUGS[nation])).toBe(nation);
    expect(isNationSlug('leeds')).toBe(false);
  });
});

describe('committed data', () => {
  it('has one page per area and per nation, with no slug used twice', () => {
    const paths = rentVsBuyPaths();
    expect(paths).toHaveLength(allAreas().length + 4);
    const slugs = paths.map((p) => p.params.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(allAreas().some((a) => isNationSlug(a.slug))).toBe(false);
  });

  it('lists every area under its nation, alphabetically', () => {
    const total = NATIONS.reduce((sum, nation) => sum + areasByNation(nation).length, 0);
    expect(total).toBe(allAreas().length);
    const welsh = areasByNation('wal').map((a) => a.name);
    expect(welsh).toEqual([...welsh].sort((a, b) => a.localeCompare(b, 'en-GB')));
  });

  it('gives six related areas from the same nation', () => {
    const leeds = getArea('leeds')!;
    const related = relatedAreas(leeds);
    expect(related).toHaveLength(6);
    expect(related.every((a) => a.nation === 'eng' && a.slug !== 'leeds')).toBe(true);
  });

  it('gives nation figures with months', () => {
    expect(nationFigures('ni').months).toEqual({ price: '2026-06', rent: '2026-06' });
  });

  it('computes the typical answer exactly as deriveInputs + runModel', () => {
    const data = calculatorData();
    for (const slug of ['leeds', 'westminster', 'glasgow-city', 'cardiff', 'belfast']) {
      const a = getArea(slug)!;
      const derived = deriveInputs({
        area: a,
        areas: areasFile(),
        rates: data.rates,
        defaults: data.defaults,
        selection: {
          areaSlug: slug,
          buyerType: data.defaults.defaultBuyerType,
          outlook: data.defaults.defaultPreset,
          nationOverride: null,
        },
      });
      const expected = runModel(derived.inputs, data.taxRules);
      const answer = typicalAnswer(a);
      expect(answer.result.breakEvenYear).toBe(expected.breakEvenYear);
      expect(answer.copy.headline).toContain(a.name);
    }
  });
});
