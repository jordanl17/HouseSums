import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import defaultsJson from '../../data/defaults.json';
import taxRulesJson from '../../data/taxRules.json';
import {
  ADVANCED_GROUPS,
  advancedCount,
  advancedKeys,
  areaHint,
  clampToSpec,
  depositHint,
  depositNote,
  filterAreas,
  mortgageRateLabel,
  NATION_NAMES,
  nationOptionLabel,
  normaliseName,
  rangeNote,
  roundToStep,
  sliderRange,
  SLIDER_KEYS,
} from './inputs';
import { parseDefaults, parseTaxRules } from './schema';
import { NUMERIC_INPUT_KEYS, type Nation, type NumericInputKey } from './types';

const defaults = parseDefaults(defaultsJson);
const taxRules = parseTaxRules(taxRulesJson);
const spec = (key: NumericInputKey) => defaults.fields[key];

const area = (name: string, nation: Nation = 'eng') => ({
  slug: name.toLowerCase().replace(/[^a-z]+/g, '-'),
  name,
  nation,
});

describe('normaliseName', () => {
  it('ignores case, diacritics, punctuation and extra spaces', () => {
    expect(normaliseName('Ynys Môn')).toBe('ynys mon');
    expect(normaliseName('  Kingston upon Hull, City of ')).toBe('kingston upon hull city of');
    expect(normaliseName("King's Lynn")).toBe('kings lynn');
    expect(normaliseName('St. Helens')).toBe('st helens');
    expect(normaliseName('Rhondda Cynon Taf')).toBe('rhondda cynon taf');
  });
});

describe('filterAreas', () => {
  const list = [
    area('Bradford'),
    area('Leeds'),
    area('Leicester'),
    area('Kingston upon Hull, City of'),
    area('North East Lincolnshire'),
    area('Ynys Môn', 'wal'),
    area('Eilean Siar', 'sco'),
  ];

  it('returns everything, in order, for an empty query', () => {
    expect(filterAreas(list, '  ')).toEqual(list);
  });

  it('ranks exact, then starts-with, then word-start, then anywhere', () => {
    expect(filterAreas(list, 'le').map((a) => a.name)).toEqual([
      'Leeds',
      'Leicester',
      'Eilean Siar',
    ]);
    expect(filterAreas(list, 'leeds').map((a) => a.name)).toEqual(['Leeds']);
    expect(filterAreas(list, 'hull').map((a) => a.name)).toEqual(['Kingston upon Hull, City of']);
    expect(filterAreas(list, 'linc').map((a) => a.name)).toEqual(['North East Lincolnshire']);
    expect(filterAreas(list, 'ford').map((a) => a.name)).toEqual(['Bradford']);
  });

  it('matches without diacritics or case', () => {
    expect(filterAreas(list, 'YNYS MON').map((a) => a.name)).toEqual(['Ynys Môn']);
    expect(filterAreas(list, 'ynys môn').map((a) => a.name)).toEqual(['Ynys Môn']);
  });

  it('returns nothing for a query that matches no name', () => {
    expect(filterAreas(list, 'zzz')).toEqual([]);
  });

  it('never returns an area that does not contain the query', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 6 }), (query) => {
        const q = normaliseName(query);
        for (const found of filterAreas(list, query)) {
          expect(normaliseName(found.name)).toContain(q);
        }
      }),
    );
  });
});

describe('clampToSpec', () => {
  it('keeps values in range and reports which end was hit', () => {
    expect(clampToSpec(300000, spec('price'))).toEqual({ value: 300000, hit: null });
    expect(clampToSpec(4, spec('price'))).toEqual({ value: 10000, hit: 'min' });
    expect(clampToSpec(2e9, spec('price'))).toEqual({ value: 10000000, hit: 'max' });
  });

  it('rounds years to whole numbers', () => {
    expect(clampToSpec(29.6, spec('termYears'))).toEqual({ value: 30, hit: null });
    expect(clampToSpec(0, spec('years'))).toEqual({ value: 1, hit: 'min' });
    expect(clampToSpec(41, spec('years'))).toEqual({ value: 40, hit: 'max' });
  });

  it('always lands inside the bounds', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...NUMERIC_INPUT_KEYS),
        fc.double({ noNaN: true, noDefaultInfinity: true, min: -1e12, max: 1e12 }),
        (key, value) => {
          const { value: clamped } = clampToSpec(value, spec(key));
          expect(clamped).toBeGreaterThanOrEqual(spec(key).min);
          expect(clamped).toBeLessThanOrEqual(spec(key).max);
        },
      ),
    );
  });
});

describe('rangeNote', () => {
  it('names the limit in the field unit', () => {
    expect(rangeNote('min', spec('price'))).toBe('The lowest this takes is £10,000');
    expect(rangeNote('max', spec('price'))).toBe('The highest this takes is £10,000,000');
    expect(rangeNote('max', spec('mortgageRate'))).toBe('The highest this takes is 15.00%');
    expect(rangeNote('max', spec('years'))).toBe('The highest this takes is 40 years');
    expect(rangeNote('min', spec('rent'))).toBe('The lowest this takes is £100 a month');
  });
});

describe('deposit copy', () => {
  it('shows the share of the price and explains loan-to-value', () => {
    expect(depositHint(30000, 300000)).toBe(
      "10% of the price, so 90% loan-to-value (how much of the price you're borrowing)",
    );
    expect(depositHint(24769.5, 247695)).toBe(
      "10% of the price, so 90% loan-to-value (how much of the price you're borrowing)",
    );
    expect(depositHint(37500, 300000)).toBe(
      "12.5% of the price, so 87.5% loan-to-value (how much of the price you're borrowing)",
    );
    expect(depositHint(300000, 300000)).toBe('All of the price, so no mortgage');
    expect(depositHint(0, 300000)).toBe(
      "No deposit, so 100% loan-to-value (how much of the price you're borrowing)",
    );
  });

  it('notes deposits under 5% and deposits above the price', () => {
    expect(depositNote(14000, 300000)).toBe('Few lenders offer loans above 95% loan-to-value');
    expect(depositNote(15000, 300000)).toBeNull();
    expect(depositNote(400000, 300000)).toBe("Deposit can't be more than the price");
    expect(depositNote(300000, 300000)).toBeNull();
  });
});

describe('sliderRange', () => {
  it('centres price and rent on the local figure with round ends', () => {
    expect(sliderRange('price', 247695, spec('price'))).toEqual({
      min: 90000,
      max: 620000,
      step: 1000,
    });
    expect(sliderRange('rent', 1145, spec('rent'))).toEqual({ min: 450, max: 2900, step: 10 });
  });

  it('never goes outside the field bounds', () => {
    expect(sliderRange('price', 12000, spec('price')).min).toBe(10000);
    expect(sliderRange('price', 9000000, spec('price')).max).toBe(10000000);
  });

  it('uses fixed ranges for the rate and growth', () => {
    expect(sliderRange('mortgageRate', 0.05, spec('mortgageRate'))).toEqual({
      min: 0,
      max: 0.1,
      step: 0.0005,
    });
    expect(sliderRange('houseGrowth', 0.03, spec('houseGrowth'))).toEqual({
      min: -0.05,
      max: 0.1,
      step: 0.001,
    });
  });

  it('covers the four key inputs', () => {
    expect([...SLIDER_KEYS].sort()).toEqual(['houseGrowth', 'mortgageRate', 'price', 'rent']);
  });
});

describe('roundToStep', () => {
  it('removes float noise from slider values', () => {
    expect(roundToStep(0.043500000000000004, 0.0005)).toBe(0.0435);
    expect(roundToStep(0.030000000000000002, 0.001)).toBe(0.03);
    expect(roundToStep(247000.00000001, 1000)).toBe(247000);
  });
});

describe('labels', () => {
  it('labels the mortgage rate with the fix length', () => {
    expect(mortgageRateLabel('Mortgage rate', 5)).toBe('Mortgage rate, 5-year fix');
    expect(mortgageRateLabel('Mortgage rate', 2)).toBe('Mortgage rate, 2-year fix');
  });

  it('names nations and their tax', () => {
    expect(NATION_NAMES.sco).toBe('Scotland');
    expect(nationOptionLabel('eng', taxRules)).toBe('England: stamp duty (SDLT)');
    expect(nationOptionLabel('sco', taxRules)).toBe('Scotland: LBTT');
    expect(nationOptionLabel('wal', taxRules)).toBe('Wales: LTT');
    expect(nationOptionLabel('ni', taxRules)).toBe('Northern Ireland: stamp duty (SDLT)');
  });

  it('gives a one-line area hint for each case', () => {
    expect(areaHint({ status: 'empty', nation: 'eng', taxRules })).toBe(
      'A local authority, such as Leeds',
    );
    expect(areaHint({ status: 'ready', nation: 'eng', taxRules })).toBe(
      'Stamp duty (SDLT) applies',
    );
    expect(areaHint({ status: 'ready', nation: 'sco', taxRules })).toBe(
      "LBTT: Scotland's stamp duty",
    );
    expect(areaHint({ status: 'ready', nation: 'wal', taxRules })).toBe("LTT: Wales's stamp duty");
    expect(areaHint({ status: 'error', nation: 'eng', taxRules, problem: 'unknown-area' })).toBe(
      "That link's place isn't on our list",
    );
    for (const nation of ['eng', 'sco', 'wal', 'ni'] as const) {
      // Short enough for one line at 360px, so the field never changes height.
      expect(areaHint({ status: 'ready', nation, taxRules }).length).toBeLessThanOrEqual(38);
    }
  });
});

describe('advanced panel', () => {
  it('holds every advanced input exactly once, in groups', () => {
    const grouped = ADVANCED_GROUPS.flatMap((group) => group.keys);
    const advanced = NUMERIC_INPUT_KEYS.filter((key) => spec(key).level === 'advanced');
    expect([...grouped].sort()).toEqual([...advanced].sort());
  });

  it('shows the Home Report only in Scotland and counts what it shows', () => {
    expect(advancedKeys('eng', defaults)).not.toContain('homeReport');
    expect(advancedKeys('sco', defaults)).toContain('homeReport');
    // Every advanced numeric input, plus the tax rules, less the Home Report outside Scotland.
    expect(advancedCount('eng', defaults)).toBe(17);
    expect(advancedCount('sco', defaults)).toBe(18);
  });
});
