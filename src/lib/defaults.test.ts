import { describe, expect, it } from 'vitest';
import areasJson from '../../data/areas.json';
import defaultsJson from '../../data/defaults.json';
import ratesJson from '../../data/rates.json';
import { deriveInputs, findArea, pickMortgageRate, type DeriveOptions } from './defaults';
import { parseAreasFile, parseDefaults, parseRatesFile } from './schema';
import type {
  Area,
  AreasFile,
  DefaultsFile,
  NumericInputKey,
  QuotedRate,
  RatesFile,
  Selection,
} from './types';
import { DERIVED_INPUT_KEYS, NUMERIC_INPUT_KEYS } from './types';

const defaults = parseDefaults(defaultsJson);

/** Test fixtures with deliberately odd figures, so no test leans on the sample data. */
const nations: AreasFile['nations'] = {
  eng: { price: 290000, growth10y: 0.032, rent: 1300, rentGrowth: 0.045 },
  sco: { price: 190000, growth10y: 0.021, rent: 950, rentGrowth: 0.055 },
  wal: { price: 210000, growth10y: 0.035, rent: 850, rentGrowth: 0.04 },
  ni: { price: 180000, growth10y: 0.044, rent: 820, rentGrowth: 0.07 },
};

const leeds: Area = {
  code: 'E08000035',
  slug: 'leeds',
  name: 'Leeds',
  nation: 'eng',
  price: 245000,
  growth10y: 0.041,
  rent: 1180,
  rentGrowth: 0.052,
  fallbacks: [],
};

const hot: Area = {
  code: 'E09000033',
  slug: 'hot-town',
  name: 'Hot Town',
  nation: 'eng',
  price: 900000,
  growth10y: 0.081,
  rent: 3000,
  rentGrowth: 0.091,
  fallbacks: [],
};

const cold: Area = {
  code: 'S12000049',
  slug: 'cold-city',
  name: 'Cold City',
  nation: 'sco',
  price: 150000,
  growth10y: -0.012,
  rent: 800,
  rentGrowth: 0.004,
  fallbacks: ['rent'],
  rentArea: 'Greater Cold',
  asOf: { price: '2026-06' },
};

const areas: AreasFile = {
  schemaVersion: 1,
  generatedAt: '2026-10-01T00:00:00Z',
  asOf: { price: '2026-07', rent: '2026-08' },
  nations,
  areas: [cold, hot, leeds],
};

const rate = (fixYears: number, ltv: QuotedRate['ltv'], value: number): QuotedRate => ({
  fixYears,
  ltv,
  rate: value,
  series: `T${fixYears}${ltv * 100}`,
});

const rates: RatesFile = {
  schemaVersion: 1,
  generatedAt: '2026-10-01T00:00:00Z',
  asOf: '2026-09',
  source: 'Bank of England, quoted household interest rates',
  rates: [
    rate(2, 0.6, 0.041),
    rate(2, 0.75, 0.0425),
    rate(2, 0.85, 0.0445),
    rate(2, 0.9, 0.0465),
    rate(2, 0.95, 0.0505),
    rate(5, 0.6, 0.0405),
    rate(5, 0.75, 0.042),
    rate(5, 0.85, 0.044),
    rate(5, 0.9, 0.046),
    rate(5, 0.95, 0.05),
  ],
};

const selection = (overrides: Partial<Selection> = {}): Selection => ({
  areaSlug: 'leeds',
  buyerType: 'first',
  outlook: 'typical',
  nationOverride: null,
  ...overrides,
});

const options = (overrides: Partial<DeriveOptions> = {}): DeriveOptions => ({
  area: leeds,
  areas,
  rates,
  defaults,
  selection: selection(),
  ...overrides,
});

describe('findArea', () => {
  it('finds by slug', () => {
    expect(findArea(areas, 'hot-town')).toBe(hot);
  });

  it('returns null for an unknown slug or none', () => {
    expect(findArea(areas, 'atlantis')).toBeNull();
    expect(findArea(areas, null)).toBeNull();
  });
});

describe('pickMortgageRate', () => {
  it('picks the smallest band at or above the loan-to-value', () => {
    expect(pickMortgageRate(rates, 0.9, 5)?.ltv).toBe(0.9);
    expect(pickMortgageRate(rates, 0.86, 5)?.ltv).toBe(0.9);
    expect(pickMortgageRate(rates, 0.8, 2)?.ltv).toBe(0.85);
    expect(pickMortgageRate(rates, 0.75, 2)?.ltv).toBe(0.75);
  });

  it('uses the 60% band at or below 60%, and 95% above 95%', () => {
    expect(pickMortgageRate(rates, 0, 5)?.ltv).toBe(0.6);
    expect(pickMortgageRate(rates, 0.4, 5)?.ltv).toBe(0.6);
    expect(pickMortgageRate(rates, 0.6, 5)?.ltv).toBe(0.6);
    expect(pickMortgageRate(rates, 0.99, 5)?.ltv).toBe(0.95);
    expect(pickMortgageRate(rates, 1.2, 5)?.ltv).toBe(0.95);
  });

  it('tolerates floating-point loan-to-values on a band edge', () => {
    // (300000 - 30000) / 300000 and friends should land in their own band, not the next.
    expect(pickMortgageRate(rates, (100000 - 10000) / 100000, 5)?.ltv).toBe(0.9);
    expect(pickMortgageRate(rates, 1 - 0.25, 5)?.ltv).toBe(0.75);
  });

  it('picks the nearest fix length, ties to the shorter', () => {
    expect(pickMortgageRate(rates, 0.9, 2)?.rate).toBe(0.0465);
    expect(pickMortgageRate(rates, 0.9, 1)?.fixYears).toBe(2);
    expect(pickMortgageRate(rates, 0.9, 3)?.fixYears).toBe(2);
    expect(pickMortgageRate(rates, 0.9, 4)?.fixYears).toBe(5);
    expect(pickMortgageRate(rates, 0.9, 10)?.fixYears).toBe(5);
    const withThree = { ...rates, rates: [...rates.rates, rate(3, 0.9, 0.0475)] };
    expect(pickMortgageRate(withThree, 0.9, 4)?.fixYears).toBe(3);
  });

  it('falls back to the largest band when a fix length lacks the higher ones', () => {
    const partial = { ...rates, rates: [rate(2, 0.6, 0.04), rate(2, 0.75, 0.045)] };
    expect(pickMortgageRate(partial, 0.9, 2)?.ltv).toBe(0.75);
  });

  it('returns null with no rates', () => {
    expect(pickMortgageRate({ ...rates, rates: [] }, 0.9, 5)).toBeNull();
  });
});

describe('deriveInputs: an area with local figures, Typical outlook', () => {
  const { inputs, base, provenance } = deriveInputs(options());

  it('takes price, rent, growth and rent growth from the area', () => {
    expect(inputs).toMatchObject({
      nation: 'eng',
      buyerType: 'first',
      price: 245000,
      rent: 1180,
      houseGrowth: 0.041,
      rentGrowth: 0.052,
    });
  });

  it('sets the deposit to 10% and picks the 90% LTV, 5-year rate', () => {
    expect(inputs.deposit).toBe(24500);
    expect(inputs.mortgageRate).toBe(0.046);
    expect(inputs.rateAfterFix).toBe(0.046);
    expect(inputs.investmentReturn).toBe(0.05);
  });

  it('uses the fixed defaults from defaults.json', () => {
    expect(inputs).toMatchObject({
      termYears: 30,
      fixYears: 5,
      productFee: 999,
      legalBuying: 1800,
      survey: 500,
      moving: 800,
      maintenanceRate: 0.01,
      insurance: 350,
      serviceCharge: 0,
      inflation: 0.025,
      agentFeeRate: 0.014,
      legalSelling: 1500,
      homeReport: 0,
      years: 25,
    });
  });

  it('has base equal to inputs with no overrides', () => {
    expect(base).toEqual(inputs);
  });

  it('tags the area figures local, with source and month', () => {
    expect(provenance.price).toEqual({
      kind: 'local',
      source: 'UK House Price Index',
      month: '2026-07',
    });
    expect(provenance.houseGrowth.kind).toBe('local');
    expect(provenance.houseGrowth.month).toBe('2026-07');
    expect(provenance.rent).toMatchObject({ kind: 'local', month: '2026-08' });
    expect(provenance.rentGrowth).toMatchObject({ kind: 'local', month: '2026-08' });
  });

  it('tags everything else typical', () => {
    const local: NumericInputKey[] = ['price', 'rent', 'houseGrowth', 'rentGrowth'];
    for (const key of NUMERIC_INPUT_KEYS) {
      if (local.includes(key)) continue;
      expect(provenance[key].kind, key).toBe('typical');
      expect(provenance[key].source.length, key).toBeGreaterThan(0);
    }
    expect(provenance.mortgageRate.month).toBe('2026-09');
    expect(provenance.mortgageRate.source).toContain('Bank of England');
    expect(provenance.termYears).toEqual({
      kind: 'typical',
      source: defaults.fields.termYears.source,
      month: null,
    });
  });
});

describe('deriveInputs: clamps and nation specifics', () => {
  it('clamps growth to 0-6% and rent growth to 1-6%', () => {
    const high = deriveInputs(options({ area: hot })).inputs;
    expect(high.houseGrowth).toBe(0.06);
    expect(high.rentGrowth).toBe(0.06);
    const low = deriveInputs(
      options({ area: cold, selection: selection({ areaSlug: 'cold-city' }) }),
    );
    expect(low.inputs.houseGrowth).toBe(0);
    expect(low.inputs.rentGrowth).toBe(0.01); // only rent falls back, rent growth is local
  });

  it('uses the nation figure for a field listed in fallbacks, tagged typical', () => {
    const { inputs, provenance } = deriveInputs(options({ area: cold }));
    expect(inputs.rent).toBe(950);
    expect(provenance.rent.kind).toBe('typical');
    expect(provenance.rent.source).toContain('Scotland');
    expect(inputs.price).toBe(150000);
    expect(provenance.price).toMatchObject({ kind: 'local', month: '2026-06' });
  });

  it('sets survey 0 and Home Report 600 in Scotland', () => {
    const { inputs } = deriveInputs(options({ area: cold }));
    expect(inputs.nation).toBe('sco');
    expect(inputs.survey).toBe(0);
    expect(inputs.homeReport).toBe(600);
  });

  it('follows the nation override for tax and nation defaults, but keeps the area figures', () => {
    const { inputs } = deriveInputs(
      options({ area: cold, selection: selection({ nationOverride: 'eng' }) }),
    );
    expect(inputs.nation).toBe('eng');
    expect(inputs.survey).toBe(500);
    expect(inputs.homeReport).toBe(0);
    expect(inputs.price).toBe(150000);
    expect(inputs.rent).toBe(950);
  });

  it('uses the nation figures, tagged typical, when no area is picked', () => {
    const { inputs, provenance } = deriveInputs(
      options({ area: null, selection: selection({ areaSlug: null }) }),
    );
    expect(inputs.nation).toBe(defaults.defaultNation);
    expect(inputs.price).toBe(290000);
    expect(inputs.rent).toBe(1300);
    expect(inputs.houseGrowth).toBe(0.032);
    expect(inputs.rentGrowth).toBe(0.045);
    for (const key of ['price', 'rent', 'houseGrowth', 'rentGrowth'] as const) {
      expect(provenance[key].kind).toBe('typical');
    }
  });

  it('uses the overridden nation figures when no area is picked', () => {
    const { inputs } = deriveInputs(
      options({ area: null, selection: selection({ areaSlug: null, nationOverride: 'wal' }) }),
    );
    expect(inputs.nation).toBe('wal');
    expect(inputs.price).toBe(210000);
    expect(inputs.survey).toBe(500);
  });

  it('marks sample figures in the source', () => {
    const sampleAreas = parseAreasFile(areasJson);
    const sampleRates = parseRatesFile(ratesJson);
    const first = sampleAreas.areas[0] ?? null;
    const { provenance } = deriveInputs({
      area: first,
      areas: sampleAreas,
      rates: sampleRates,
      defaults,
      selection: selection({ areaSlug: first?.slug ?? null }),
    });
    expect(provenance.price.source).toMatch(/sample/i);
    expect(provenance.mortgageRate.source).toMatch(/sample/i);
  });
});

describe('deriveInputs: outlook presets', () => {
  it('Cautious caps growth at 1.5% and rent growth at 2%, lowers returns, raises the later rate', () => {
    const { inputs, provenance } = deriveInputs(
      options({ selection: selection({ outlook: 'cautious' }) }),
    );
    expect(inputs.houseGrowth).toBe(0.015);
    expect(inputs.rentGrowth).toBe(0.02);
    expect(inputs.investmentReturn).toBe(0.035);
    expect(inputs.rateAfterFix).toBeCloseTo(0.051, 10);
    expect(provenance.houseGrowth.kind).toBe('typical');
    expect(provenance.houseGrowth.source).toContain('Cautious');
  });

  it('Cautious keeps a clamped area figure below its cap, never a negative one', () => {
    const { inputs, provenance } = deriveInputs(
      options({ area: cold, selection: selection({ outlook: 'cautious' }) }),
    );
    expect(inputs.houseGrowth).toBe(0);
    expect(provenance.houseGrowth.kind).toBe('local');
  });

  it('Optimistic adds a point to growth, capped at 6%, raises returns, lowers the later rate', () => {
    const { inputs } = deriveInputs(options({ selection: selection({ outlook: 'optimistic' }) }));
    expect(inputs.houseGrowth).toBeCloseTo(0.051, 10);
    expect(inputs.rentGrowth).toBe(0.052);
    expect(inputs.investmentReturn).toBe(0.065);
    expect(inputs.rateAfterFix).toBeCloseTo(0.041, 10);
    const capped = deriveInputs(
      options({ area: hot, selection: selection({ outlook: 'optimistic' }) }),
    );
    expect(capped.inputs.houseGrowth).toBe(0.06);
  });

  it('floors the rate after the fix at 0', () => {
    const { inputs } = deriveInputs(
      options({
        selection: selection({ outlook: 'optimistic' }),
        overrides: { mortgageRate: 0.002 },
      }),
    );
    expect(inputs.rateAfterFix).toBe(0);
  });
});

describe('deriveInputs: overrides', () => {
  it('re-derives the deposit from an overridden price, and base keeps the derived value', () => {
    const { inputs, base } = deriveInputs(options({ overrides: { price: 300000 } }));
    expect(inputs.price).toBe(300000);
    expect(base.price).toBe(245000);
    expect(inputs.deposit).toBe(30000);
    expect(base.deposit).toBe(30000);
  });

  it('re-picks the mortgage rate from an overridden deposit', () => {
    const { inputs, base } = deriveInputs(options({ overrides: { deposit: 73500 } }));
    expect(inputs.deposit).toBe(73500);
    expect(base.deposit).toBe(24500);
    expect(inputs.mortgageRate).toBe(0.042); // 70% LTV -> 75% band
    expect(base.mortgageRate).toBe(0.042);
  });

  it('re-picks the mortgage rate from an overridden fix length', () => {
    const { inputs } = deriveInputs(options({ overrides: { fixYears: 2 } }));
    expect(inputs.mortgageRate).toBe(0.0465);
  });

  it('sets the rate after the fix from an overridden mortgage rate', () => {
    const { inputs, base } = deriveInputs(options({ overrides: { mortgageRate: 0.039 } }));
    expect(inputs.mortgageRate).toBe(0.039);
    expect(base.mortgageRate).toBe(0.046);
    expect(inputs.rateAfterFix).toBe(0.039);
    expect(base.rateAfterFix).toBe(0.039);
  });

  it('keeps an overridden growth over the preset', () => {
    const { inputs, base } = deriveInputs(
      options({ selection: selection({ outlook: 'cautious' }), overrides: { houseGrowth: 0.05 } }),
    );
    expect(inputs.houseGrowth).toBe(0.05);
    expect(base.houseGrowth).toBe(0.015);
  });

  it('applies overrides to fixed fields', () => {
    const { inputs, base } = deriveInputs(options({ overrides: { years: 40, survey: 0 } }));
    expect(inputs.years).toBe(40);
    expect(base.years).toBe(25);
    expect(inputs.survey).toBe(0);
  });

  it('ignores non-finite overrides', () => {
    const { inputs } = deriveInputs(
      options({ overrides: { price: Number.NaN, rent: Number.POSITIVE_INFINITY } }),
    );
    expect(inputs.price).toBe(245000);
    expect(inputs.rent).toBe(1180);
  });

  it('never throws on a zero price', () => {
    const { inputs } = deriveInputs(options({ overrides: { price: 0 } }));
    expect(inputs.deposit).toBe(0);
    expect(Number.isFinite(inputs.mortgageRate)).toBe(true);
  });
});

describe('deriveInputs with the committed data', () => {
  it('derives finite inputs for every area and outlook', () => {
    const realAreas = parseAreasFile(areasJson);
    const realRates = parseRatesFile(ratesJson);
    const presets = ['cautious', 'typical', 'optimistic'] as const;
    for (const area of [null, ...realAreas.areas]) {
      for (const outlook of presets) {
        const { inputs } = deriveInputs({
          area,
          areas: realAreas,
          rates: realRates,
          defaults: defaults as DefaultsFile,
          selection: selection({ areaSlug: area?.slug ?? null, outlook }),
        });
        for (const key of NUMERIC_INPUT_KEYS) {
          expect(Number.isFinite(inputs[key]), `${area?.slug ?? 'none'} ${key}`).toBe(true);
        }
      }
    }
  });
});

describe('parseDefaults (defaults.json contract)', () => {
  it('requires a fixed default for every field that is not derived', () => {
    const bad = structuredClone(defaultsJson) as { fields: { years: { default: number | null } } };
    bad.fields.years.default = null;
    expect(() => parseDefaults(bad)).toThrow(/fields\.years\.default: expected a number/);
  });

  it('leaves the derived fields null in the committed file', () => {
    for (const key of DERIVED_INPUT_KEYS) expect(defaults.fields[key].default, key).toBeNull();
  });

  it('holds the Outlook presets from docs/decisions.md', () => {
    expect(defaults.presets).toMatchObject({
      cautious: {
        houseGrowth: { add: 0, cap: 0.015 },
        rentGrowth: { add: 0, cap: 0.02 },
        investmentReturn: 0.035,
        rateAfterFixDelta: 0.005,
      },
      typical: {
        houseGrowth: { add: 0, cap: null },
        rentGrowth: { add: 0, cap: null },
        investmentReturn: 0.05,
        rateAfterFixDelta: 0,
      },
      optimistic: {
        houseGrowth: { add: 0.01, cap: 0.06 },
        rentGrowth: { add: 0, cap: null },
        investmentReturn: 0.065,
        rateAfterFixDelta: -0.005,
      },
    });
    expect(defaults.depositFraction).toBe(0.1);
    expect(defaults.areaClamps).toEqual({
      houseGrowth: { min: 0, max: 0.06 },
      rentGrowth: { min: 0.01, max: 0.06 },
    });
    expect(defaults.defaultPreset).toBe('typical');
    expect(defaults.defaultBuyerType).toBe('first');
  });

  it('gives every field a label, bounds and a step that its defaults sit on', () => {
    for (const key of NUMERIC_INPUT_KEYS) {
      const field = defaults.fields[key];
      expect(field.label.length, key).toBeGreaterThan(0);
      expect(field.min, key).toBeLessThan(field.max);
      expect(field.step, key).toBeGreaterThan(0);
      const values = [field.default, ...Object.values(field.byNation ?? {})];
      for (const value of values) {
        if (value === null || value === undefined) continue;
        const steps = (value - field.min) / field.step;
        expect(Math.abs(steps - Math.round(steps)), `${key} ${value}`).toBeLessThan(1e-6);
      }
    }
  });
});
