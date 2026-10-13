import { describe, expect, it } from 'vitest';
import {
  allAreas,
  areaMonths,
  areaSummary,
  areaTableRow,
  areasByNation,
  nationSpreadFor,
  nationFigureRows,
  nationOverview,
  nationPageNotes,
  nationTax,
  summarySources,
  typicalAssumptions,
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

describe('page summaries (committed data)', () => {
  const voice = (text: string) => {
    expect(text).not.toMatch(/[—!]/);
    expect(text).not.toMatch(/\byou should\b/i);
  };

  it('builds a summary for every area in the brief voice, with five figure rows', () => {
    for (const a of allAreas()) {
      const summary = areaSummary(a);
      expect(summary.rows).toHaveLength(5);
      for (const row of summary.rows) {
        expect(row.area.text).not.toBe('');
        expect(row.nation.text).not.toBe('');
      }
      [summary.comparison, summary.assumptions, summary.middle, ...summary.notes].forEach(voice);
      expect(summary.assumptions).toContain(`over ${typicalAnswer(a).derived.inputs.years} years`);
    }
  });

  it("gives Leeds its own figures, months and England's", () => {
    const summary = areaSummary(getArea('leeds')!);
    expect(summary.rows[0]).toMatchObject({
      label: 'Average price',
      month: 'Jul 2026',
      area: { text: '£247,695', fallback: false },
      nation: { text: '£293,479' },
    });
    expect(summary.rows[2]).toMatchObject({ month: 'Aug 2026', area: { text: '£1,145' } });
    expect(summary.comparison).toMatch(/^An average home in Leeds costs \d+% less than/);
    expect(summary.middle).toMatch(/^Across England's 296 areas, the middle answer/);
    expect(summary.notes).toEqual([]);
  });

  it('says plainly when prices fell and the calculator floors growth', () => {
    const notes = areaSummary(getArea('aberdeen-city')!).notes.join(' ');
    expect(notes).toContain('Average prices in Aberdeen City fell by 3.92% a year');
    expect(notes).toContain('floors house price growth at 0%');
    expect(notes).toContain('Rents fell by 0.52%');
    expect(notes).toContain('Aberdeen and Shire');
  });

  it('labels fallback figures as the nation figure', () => {
    const scilly = areaSummary(getArea('isles-of-scilly')!);
    expect(scilly.rows.filter((row) => row.area.fallback).map((row) => row.key)).toEqual([
      'price',
      'growth10y',
      'rent',
      'rentGrowth',
      'priceToRent',
    ]);
    expect(scilly.comparison).toBe('');
    expect(scilly.notes.join(' ')).toContain("these are England's figures");
    const city = areaSummary(getArea('city-of-london')!);
    expect(city.rows.filter((row) => row.area.fallback).map((row) => row.key)).toEqual([
      'rent',
      'rentGrowth',
      'priceToRent',
    ]);
  });

  it('names the ONS name and the NI quarter', () => {
    expect(areaSummary(getArea('bristol')!).notes).toContain(
      'ONS lists Bristol as "Bristol, City of".',
    );
    expect(areaSummary(getArea('belfast')!).notes.join(' ')).toContain('April to June 2026');
  });

  it('gives table rows that agree with the typical answer', () => {
    for (const a of areasByNation('wal')) {
      const row = areaTableRow(a);
      const year = typicalAnswer(a).result.breakEvenYear;
      const words = year === null ? 'None in 25 years' : year === 1 ? '1 year' : `${year} years`;
      expect(row.breakEven).toBe(words);
      expect(row.href).toMatch(new RegExp(`/rent-vs-buy/${a.slug}/$`));
    }
    expect(areaTableRow(getArea('isles-of-scilly')!)).toMatchObject({
      priceFallback: true,
      rentFallback: true,
    });
  });

  it('spreads the answers across each nation', () => {
    for (const nation of NATIONS) {
      const spread = nationSpreadFor(nation);
      expect(spread.count).toBe(areasByNation(nation).length);
      expect(spread.withinCount + spread.noneCount).toBeLessThanOrEqual(spread.count);
    }
  });

  it('gives each nation an overview row and a figures table', () => {
    const rows = nationOverview();
    expect(rows.map((row) => row.name)).toEqual([
      'England',
      'Scotland',
      'Wales',
      'Northern Ireland',
    ]);
    expect(rows.reduce((sum, row) => sum + row.count, 0)).toBe(allAreas().length);
    expect(rows[0]).toMatchObject({ price: '£293,479', rent: '£1,459' });
    expect(nationFigureRows('ni')[0]).toMatchObject({
      month: 'Jun 2026',
      nation: { text: '£202,487' },
    });
    expect(nationPageNotes('eng')).toEqual([]);
    expect(nationPageNotes('sco')).toHaveLength(1);
    expect(nationPageNotes('ni')[0]).toContain('April to June 2026');
    expect(typicalAssumptions()).toMatch(
      /^Typical assumptions: a first-time buyer with a 10% deposit/,
    );
  });

  it('names the sources of the figures', () => {
    expect(summarySources()).toMatch(
      /^Figures from the UK House Price Index \(HM Land Registry with ONS\), the Price Index of Private Rents \(Office for National Statistics\) and .*\(Bank of England\)\.$/,
    );
  });

  it('describes each nation tax from taxRules.json', () => {
    expect(nationTax('eng').label).toBe('Stamp duty (SDLT)');
    expect(nationTax('ni').lines[0]).toContain('the same tax as in England');
    expect(nationTax('eng').lines[0]).toContain('the same tax as in Northern Ireland');
    expect(nationTax('sco').label).toBe('Land and Buildings Transaction Tax (LBTT)');
    expect(nationTax('sco').lines.join(' ')).toContain('Home Report');
    expect(nationTax('wal').lines.join(' ')).toContain('no first-time buyer relief');
    for (const nation of NATIONS) nationTax(nation).lines.forEach(voice);
  });
});
