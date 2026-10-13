import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import defaultsJson from '../../data/defaults.json';
import { parseDefaults } from './schema';
import { fieldDecimals, formatFieldValue } from '../components/calculator/ui/units';
import {
  INPUT_PARAMS,
  SELECTION_PARAMS,
  canonicalInput,
  decodeState,
  encodeNumber,
  encodeState,
} from './state';
import type { CalculatorState } from './state';
import {
  BUYER_TYPES,
  NATIONS,
  NUMERIC_INPUT_KEYS,
  PRESET_NAMES,
  type Inputs,
  type NumericInputKey,
  type Overrides,
  type Selection,
} from './types';

const defaults = parseDefaults(structuredClone(defaultsJson));

/** A made-up set of derived defaults for an English area. Test fixture only, not real data. */
const base: Inputs = {
  nation: 'eng',
  buyerType: 'first',
  price: 250000,
  deposit: 25000,
  rent: 1000,
  mortgageRate: 0.045,
  houseGrowth: 0.03,
  termYears: 30,
  fixYears: 5,
  rateAfterFix: 0.045,
  productFee: 999,
  legalBuying: 1800,
  survey: 500,
  moving: 800,
  maintenanceRate: 0.01,
  insurance: 350,
  serviceCharge: 0,
  rentGrowth: 0.03,
  investmentReturn: 0.05,
  inflation: 0.025,
  agentFeeRate: 0.014,
  legalSelling: 1500,
  homeReport: 0,
  years: 25,
};

const defaultSelection: Selection = {
  areaSlug: null,
  buyerType: defaults.defaultBuyerType,
  outlook: defaults.defaultPreset,
  nationOverride: null,
};

const state = (selection: Partial<Selection> = {}, overrides: Overrides = {}): CalculatorState => ({
  selection: { ...defaultSelection, ...selection },
  overrides,
});

const known = new Set(['leeds', 'glasgow-city', 'isles-of-scilly', 'westminster']);

describe('parameter keys', () => {
  it('has a short, unique key for every numeric input and selection field', () => {
    const numeric = NUMERIC_INPUT_KEYS.map((key) => INPUT_PARAMS[key]);
    const selection = Object.values(SELECTION_PARAMS);
    const all = [...selection, ...numeric];
    expect(numeric).toHaveLength(NUMERIC_INPUT_KEYS.length);
    expect(new Set(all).size).toBe(all.length);
    for (const key of all) expect(key).toMatch(/^[a-z]{1,3}$/);
  });

  it('keeps the keys suggested by the phase lead', () => {
    expect(SELECTION_PARAMS).toEqual({
      areaSlug: 'a',
      buyerType: 'b',
      outlook: 'o',
      nationOverride: 'n',
    });
    expect(INPUT_PARAMS.price).toBe('p');
    expect(INPUT_PARAMS.deposit).toBe('d');
    expect(INPUT_PARAMS.rent).toBe('r');
    expect(INPUT_PARAMS.mortgageRate).toBe('mr');
    expect(INPUT_PARAMS.houseGrowth).toBe('g');
  });
});

describe('encodeState', () => {
  it('is empty when everything is default', () => {
    expect(encodeState(state(), base, defaults)).toBe('');
  });

  it('writes the area, then only the values that differ', () => {
    expect(
      encodeState(
        state(
          { areaSlug: 'leeds' },
          { price: 300000, deposit: 30000, rent: 1250, mortgageRate: 0.043, houseGrowth: 0.03 },
        ),
        base,
        defaults,
      ),
    ).toBe('a=leeds&p=300000&d=30000&r=1250&mr=4.3');
  });

  it('writes non-default selection values', () => {
    expect(
      encodeState(
        state({ buyerType: 'additional', outlook: 'cautious', nationOverride: 'sco' }),
        base,
        defaults,
      ),
    ).toBe('b=additional&o=cautious&n=sco');
  });

  it('writes percentages as percentages and money as plain numbers', () => {
    expect(
      encodeState(
        state(
          {},
          {
            houseGrowth: 0.035,
            rentGrowth: 0.0125,
            maintenanceRate: 0.015,
            agentFeeRate: 0.012,
            investmentReturn: -0.01,
            productFee: 1499.5,
            years: 10,
          },
        ),
        base,
        defaults,
      ),
    ).toBe('g=3.5&pf=1499.5&mt=1.5&rg=1.25&ir=-1&ag=1.2&y=10');
  });

  it('removes float noise', () => {
    expect(encodeState(state({}, { mortgageRate: 0.1 + 0.2 - 0.25 }), base, defaults)).toBe('mr=5');
    expect(encodeState(state({}, { price: 0.1 + 0.2 + 299999.7 }), base, defaults)).toBe(
      'p=300000',
    );
  });

  it('leaves out overrides equal to the base value, even with float noise', () => {
    expect(encodeState(state({}, { price: 250000, rent: 1000 }), base, defaults)).toBe('');
    expect(encodeState(state({}, { mortgageRate: 0.045000000000000005 }), base, defaults)).toBe('');
  });

  it('skips values that are not finite numbers', () => {
    expect(
      encodeState(state({}, { price: Number.NaN, rent: Number.POSITIVE_INFINITY }), base, defaults),
    ).toBe('');
  });

  it('clamps to the field range so every link decodes', () => {
    expect(encodeState(state({}, { price: 1e30, years: 99 }), base, defaults)).toBe(
      `p=${defaults.fields.price.max}&y=${defaults.fields.years.max}`,
    );
  });

  it('rounds years to whole numbers and money to pence', () => {
    expect(encodeState(state({}, { years: 9.6, rent: 1250.555 }), base, defaults)).toBe(
      'r=1250.56&y=10',
    );
  });

  it('escapes nothing it does not need to', () => {
    expect(encodeState(state({ areaSlug: 'glasgow-city' }), base, defaults)).toBe('a=glasgow-city');
  });
});

describe('decodeState', () => {
  it('gives the default state for an empty search', () => {
    expect(decodeState('', defaults)).toEqual(state());
    expect(decodeState('?', defaults)).toEqual(state());
  });

  it('reads the example link', () => {
    expect(
      decodeState('?a=leeds&p=300000&d=30000&r=1250&mr=4.3&g=3&o=cautious', defaults, known),
    ).toEqual(
      state(
        { areaSlug: 'leeds', outlook: 'cautious' },
        { price: 300000, deposit: 30000, rent: 1250, mortgageRate: 0.043, houseGrowth: 0.03 },
      ),
    );
  });

  it('reads an old slug through the alias table (phase 5)', () => {
    const aliases = { 'old-leeds': 'leeds' };
    expect(decodeState('a=old-leeds', defaults, known, aliases).selection.areaSlug).toBe('leeds');
    expect(decodeState('a=OLD-LEEDS', defaults, undefined, aliases).selection.areaSlug).toBe(
      'leeds',
    );
    // Without the table the old slug is unknown; inherited keys never resolve.
    expect(decodeState('a=old-leeds', defaults, known).selection.areaSlug).toBeNull();
    expect(decodeState('a=constructor', defaults, known, aliases).selection.areaSlug).toBeNull();
  });

  it('accepts URLSearchParams, a search without "?" and a whole URL', () => {
    const expected = state({ areaSlug: 'leeds' }, { price: 300000 });
    expect(decodeState(new URLSearchParams('a=leeds&p=300000'), defaults)).toEqual(expected);
    expect(decodeState('a=leeds&p=300000', defaults)).toEqual(expected);
    expect(
      decodeState('https://example.org/rent-vs-buy/?a=leeds&p=300000#chart', defaults),
    ).toEqual(expected);
  });

  it('reads every buyer type, outlook and nation', () => {
    for (const buyerType of BUYER_TYPES) {
      expect(decodeState(`b=${buyerType}`, defaults).selection.buyerType).toBe(buyerType);
    }
    for (const outlook of PRESET_NAMES) {
      expect(decodeState(`o=${outlook}`, defaults).selection.outlook).toBe(outlook);
    }
    for (const nation of NATIONS) {
      expect(decodeState(`n=${nation}`, defaults).selection.nationOverride).toBe(nation);
    }
  });

  it('falls back to the defaults for unknown enum values', () => {
    expect(decodeState('b=landlord&o=custom&n=france', defaults)).toEqual(state());
    expect(decodeState('b=&o=&n=', defaults)).toEqual(state());
    expect(decodeState('o=__proto__&b=toString', defaults)).toEqual(state());
  });

  it('drops area slugs that are malformed or not known', () => {
    expect(decodeState('a=bristol', defaults, known).selection.areaSlug).toBeNull();
    expect(decodeState('a=bristol', defaults).selection.areaSlug).toBe('bristol');
    for (const slug of ['', '-leeds', 'leeds-', 'lee--ds', 'leeds/../x', '<script>', 'a b']) {
      expect(
        decodeState(`a=${encodeURIComponent(slug)}`, defaults).selection.areaSlug,
        slug,
      ).toBeNull();
    }
    expect(decodeState(`a=${'x'.repeat(200)}`, defaults).selection.areaSlug).toBeNull();
  });

  it('lowercases and trims the area slug', () => {
    expect(decodeState('a=%20Leeds%20', defaults, known).selection.areaSlug).toBe('leeds');
  });

  it('ignores unknown keys, including prototype names', () => {
    const decoded = decodeState(
      'utm_source=x&__proto__=1&constructor=2&toString=3&price=300000&P=5',
      defaults,
    );
    expect(decoded).toEqual(state());
    expect(Object.keys(decoded.overrides)).toEqual([]);
  });

  it('drops values that are not numbers', () => {
    expect(decodeState('p=abc&r=&mr=%25&d=Infinity&y=NaN&g=1e2&t=--5', defaults)).toEqual(state());
  });

  it('accepts the lenient forms people type', () => {
    expect(decodeState('p=300k&d=%C2%A330%2C000&mr=4.3%25&g=+3', defaults).overrides).toEqual({
      price: 300000,
      deposit: 30000,
      mortgageRate: 0.043,
      houseGrowth: 0.03,
    });
  });

  it('clamps numbers to the field range', () => {
    const { fields } = defaults;
    expect(decodeState('p=1&mr=99&y=100&ir=-50', defaults).overrides).toEqual({
      price: fields.price.min,
      mortgageRate: fields.mortgageRate.max,
      investmentReturn: fields.investmentReturn.min,
      years: fields.years.max,
    });
  });

  it('rounds years to whole numbers', () => {
    expect(decodeState('y=2.6&t=24.4&fx=2.5', defaults).overrides).toEqual({
      years: 3,
      termYears: 24,
      fixYears: 3,
    });
  });

  it('uses the last value when a key is repeated', () => {
    expect(decodeState('p=200000&p=300000', defaults).overrides).toEqual({ price: 300000 });
    expect(decodeState('p=200000&p=junk', defaults).overrides).toEqual({ price: 200000 });
    expect(decodeState('o=optimistic&o=cautious&o=junk', defaults).selection.outlook).toBe(
      'cautious',
    );
    expect(decodeState('a=leeds&a=nowhere', defaults, known).selection.areaSlug).toBe('leeds');
  });

  it('survives malformed percent-encoding', () => {
    expect(decodeState('a=%E0%A4%A&p=%&mr=%zz', defaults)).toEqual(state());
  });

  it('never throws, for any input', () => {
    const keys = [...Object.values(SELECTION_PARAMS), ...Object.values(INPUT_PARAMS)];
    const pair = fc.tuple(fc.oneof(fc.constantFrom(...keys), fc.string()), fc.string());
    const search = fc.oneof(
      fc.string(),
      fc.array(pair).map((pairs) => pairs.map(([k, v]) => `${k}=${v}`).join('&')),
    );
    fc.assert(
      fc.property(search, (text) => {
        const { selection, overrides } = decodeState(text, defaults, known);
        expect(BUYER_TYPES).toContain(selection.buyerType);
        expect(PRESET_NAMES).toContain(selection.outlook);
        expect(
          selection.nationOverride === null || NATIONS.includes(selection.nationOverride),
        ).toBe(true);
        expect(selection.areaSlug === null || known.has(selection.areaSlug)).toBe(true);
        for (const [key, value] of Object.entries(overrides)) {
          const field = defaults.fields[key as NumericInputKey];
          expect(field).toBeDefined();
          expect(Number.isFinite(value)).toBe(true);
          expect(value).toBeGreaterThanOrEqual(field.min);
          expect(value).toBeLessThanOrEqual(field.max);
        }
      }),
      { numRuns: 500 },
    );
  });
});

describe('round trip', () => {
  const isPercent = (key: NumericInputKey): boolean =>
    defaults.fields[key].unit === 'percent' || defaults.fields[key].unit === 'percentPerYear';

  /** Values as the UI produces them: pennies for money, 0.0001% for rates, whole years. */
  const value = (key: NumericInputKey): fc.Arbitrary<number> => {
    const { min, max, unit } = defaults.fields[key];
    if (unit === 'years') return fc.integer({ min, max });
    if (isPercent(key)) {
      return fc
        .integer({ min: Math.round(min * 1e6), max: Math.round(max * 1e6) })
        .map((n) => n / 1e6);
    }
    return fc
      .integer({ min: Math.round(min * 100), max: Math.round(max * 100) })
      .map((n) => n / 100);
  };

  const overrides: fc.Arbitrary<Overrides> = fc.record(
    Object.fromEntries(NUMERIC_INPUT_KEYS.map((key) => [key, value(key)])) as Record<
      NumericInputKey,
      fc.Arbitrary<number>
    >,
    { requiredKeys: [] },
  );

  const selection: fc.Arbitrary<Selection> = fc.record({
    areaSlug: fc.option(fc.constantFrom(...known), { nil: null }),
    buyerType: fc.constantFrom(...BUYER_TYPES),
    outlook: fc.constantFrom(...PRESET_NAMES),
    nationOverride: fc.option(fc.constantFrom(...NATIONS), { nil: null }),
  });

  const withoutBase = (o: Overrides): Overrides =>
    Object.fromEntries(Object.entries(o).filter(([key, v]) => v !== base[key as NumericInputKey]));

  it('decodes to the same state, minus overrides equal to the base', () => {
    fc.assert(
      fc.property(selection, overrides, (sel, ovr) => {
        const encoded = encodeState({ selection: sel, overrides: ovr }, base, defaults);
        const decoded = decodeState(encoded, defaults, known);
        expect(decoded.selection).toEqual(sel);
        expect(decoded.overrides).toEqual(withoutBase(ovr));
      }),
      { numRuns: 500 },
    );
  });

  it('is stable: encoding what was decoded gives the same string', () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        const once = encodeState(decodeState(text, defaults), base, defaults);
        expect(encodeState(decodeState(once, defaults), base, defaults)).toBe(once);
      }),
    );
  });

  it('gets close to any value in range, and is exact on a second pass', () => {
    const anyOverride = fc.constantFrom(...NUMERIC_INPUT_KEYS).chain((key) =>
      fc
        .double({
          min: defaults.fields[key].min,
          max: defaults.fields[key].max,
          noNaN: true,
        })
        .map((v) => ({ key, v })),
    );
    fc.assert(
      fc.property(anyOverride, ({ key, v }) => {
        const encoded = encodeState(state({}, { [key]: v }), base, defaults);
        const decoded = decodeState(encoded, defaults).overrides[key] ?? base[key];
        const unit = defaults.fields[key].unit;
        const tolerance = unit === 'years' ? 0.5 : isPercent(key) ? 5e-7 : 0.005;
        expect(Math.abs(decoded - v)).toBeLessThanOrEqual(tolerance + 1e-9);
        const again = decodeState(
          encodeState(state({}, { [key]: decoded }), base, defaults),
          defaults,
        );
        expect(again.overrides[key] ?? base[key]).toBe(decoded);
      }),
      { numRuns: 1000 },
    );
  });
});

describe('canonicalInput (typed values as the calculator keeps them)', () => {
  const { fields } = defaults;

  it('keeps two decimals of a percent, pence and whole years', () => {
    expect(canonicalInput(0.0433333333, fields.mortgageRate)).toBe(0.0433);
    expect(canonicalInput(0.0333333, fields.houseGrowth)).toBe(0.0333);
    expect(canonicalInput(312345.678, fields.price)).toBe(312345.68);
    expect(canonicalInput(1234.567, fields.rent)).toBe(1234.57);
    expect(canonicalInput(25.4, fields.years)).toBe(25);
  });

  it('clamps to the field', () => {
    expect(canonicalInput(5, fields.price)).toBe(fields.price.min);
    expect(canonicalInput(1, fields.mortgageRate)).toBe(fields.mortgageRate.max);
  });

  it('survives the URL exactly, so a shared link computes the same figures', () => {
    const keys = Object.keys(INPUT_PARAMS) as (keyof typeof INPUT_PARAMS)[];
    fc.assert(
      fc.property(
        fc.constantFrom(...keys),
        fc.double({ min: -1e7, max: 1e7, noNaN: true }),
        (key, raw) => {
          const field = fields[key];
          const kept = canonicalInput(raw, field);
          const state: CalculatorState = {
            selection: {
              areaSlug: null,
              buyerType: defaults.defaultBuyerType,
              outlook: defaults.defaultPreset,
              nationOverride: null,
            },
            overrides: { [key]: kept },
          };
          // Against a base it can't equal, so the override is always written.
          const base = Object.fromEntries(
            Object.keys(fields).map((k) => [k, Number.NaN]),
          ) as unknown as Parameters<typeof encodeState>[1];
          const decoded = decodeState(`?${encodeState(state, base, defaults)}`, defaults);
          expect(decoded.overrides[key]).toBe(kept);
          expect(encodeNumber(kept, field)).not.toBeNull();
        },
      ),
    );
  });

  it("keeps a percentage at its field's decimals from defaults.json", () => {
    expect(canonicalInput(0.05251, fields.investmentReturn)).toBe(0.053);
    expect(canonicalInput(0.01444, fields.agentFeeRate)).toBe(0.0144);
    expect(canonicalInput(0.02549, fields.inflation)).toBe(0.025);
  });

  it('matches what the field shows, at one precision whatever the value', () => {
    // Leeds 4.19, Belfast 5.10 (was "5.1"), Westminster 0.00 (was "0.0"): same decimals.
    expect(formatFieldValue(0.041901, fields.houseGrowth)).toBe('4.19');
    expect(formatFieldValue(0.050991, fields.houseGrowth)).toBe('5.10');
    expect(formatFieldValue(0, fields.houseGrowth)).toBe('0.00');
    expect(formatFieldValue(0.01, fields.rentGrowth)).toBe('1.00');
    expect(formatFieldValue(0.014, fields.agentFeeRate)).toBe('1.40');
    expect(formatFieldValue(0.05, fields.investmentReturn)).toBe('5.0');
    expect(formatFieldValue(0.0433, fields.mortgageRate)).toBe('4.33');
    for (const field of Object.values(fields)) {
      if (field.unit !== 'percent' && field.unit !== 'percentPerYear') continue;
      fc.assert(
        fc.property(fc.double({ min: field.min, max: field.max, noNaN: true }), (raw) => {
          const kept = canonicalInput(raw, field);
          const shown = formatFieldValue(kept, field);
          // Every value shows the field's decimals, and what is shown is what is kept.
          expect(shown.split('.')[1]?.length ?? 0).toBe(fieldDecimals(field));
          expect(Number(shown.replace(/[^\d.]/g, '')) / 100).toBeCloseTo(Math.abs(kept), 10);
        }),
        { numRuns: 200 },
      );
    }
  });
});
