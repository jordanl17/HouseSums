import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import taxRulesJson from '../../data/taxRules.json';
import { parseTaxRules } from './schema';
import { propertyTax, regimeFor } from './tax';
import { BUYER_TYPES, NATIONS, type BuyerType, type Nation, type TaxRules } from './types';

const rules = parseTaxRules(taxRulesJson);
const tax = (nation: Nation, buyerType: BuyerType, price: number) =>
  propertyTax({ nation, buyerType, price }, rules);
const total = (nation: Nation, buyerType: BuyerType, price: number) =>
  tax(nation, buyerType, price).total;

describe('brief: tax test cases (2026/27)', () => {
  it.each([
    ['eng', 'first', 300_000, 0],
    ['eng', 'first', 450_000, 7_500],
    ['eng', 'first', 550_000, 17_500],
    ['eng', 'moving', 300_000, 5_000],
    ['eng', 'additional', 300_000, 20_000],
    ['sco', 'moving', 300_000, 4_600],
    ['sco', 'first', 300_000, 4_000],
    ['sco', 'additional', 300_000, 28_600],
    ['wal', 'moving', 300_000, 4_500],
    ['wal', 'first', 300_000, 4_500],
    ['wal', 'additional', 300_000, 19_950],
  ] as const)('%s, %s buyer, £%i: £%i', (nation, buyerType, price, expected) => {
    expect(total(nation, buyerType, price)).toBe(expected);
  });

  it('England first-time buyer above £500k loses the relief entirely', () => {
    const result = tax('eng', 'first', 550_000);
    expect(result.reliefApplied).toBe(false);
    expect(result.total).toBe(total('eng', 'moving', 550_000));
  });
});

describe('regimes', () => {
  it('maps each nation to its tax, NI using SDLT', () => {
    expect(regimeFor('eng', rules)).toBe('sdlt');
    expect(regimeFor('ni', rules)).toBe('sdlt');
    expect(regimeFor('sco', rules)).toBe('lbtt');
    expect(regimeFor('wal', rules)).toBe('ltt');
    expect(tax('wal', 'moving', 300_000).regime).toBe('ltt');
  });

  it('Northern Ireland pays the same as England', () => {
    for (const buyerType of BUYER_TYPES) {
      for (const price of [0, 39_999, 40_000, 300_000, 500_001, 2_000_000]) {
        expect(tax('ni', buyerType, price)).toEqual(tax('eng', buyerType, price));
      }
    }
  });
});

describe('band boundaries (moving buyer)', () => {
  it.each([
    // England and NI: 0% to £125k, 2% to £250k, 5% to £925k, 10% to £1.5m, 12% above
    ['eng', 125_000, 0],
    ['eng', 125_001, 0], // 2p, rounded down to whole pounds
    ['eng', 250_000, 2_500],
    ['eng', 250_001, 2_500],
    ['eng', 925_000, 36_250],
    ['eng', 1_500_000, 93_750],
    ['eng', 2_000_000, 153_750],
    // Scotland: 0% to £145k, 2% to £250k, 5% to £325k, 10% to £750k, 12% above
    ['sco', 145_000, 0],
    ['sco', 250_000, 2_100],
    ['sco', 325_000, 5_850],
    ['sco', 750_000, 48_350],
    ['sco', 1_000_000, 78_350],
    // Wales: 0% to £225k, 6% to £400k, 7.5% to £750k, 10% to £1.5m, 12% above
    ['wal', 225_000, 0],
    ['wal', 400_000, 10_500],
    ['wal', 750_000, 36_750],
    ['wal', 1_500_000, 111_750],
    ['wal', 2_000_000, 171_750],
  ] as const)('%s £%i: £%i', (nation, price, expected) => {
    expect(total(nation, 'moving', price)).toBe(expected);
  });
});

describe('first-time buyer relief', () => {
  it('England: 0% to £300k, 5% to £500k, and £500,000 itself still qualifies', () => {
    const at = tax('eng', 'first', 500_000);
    expect(at.total).toBe(10_000);
    expect(at.reliefApplied).toBe(true);
    expect(at.bands.map((b) => b.rate)).toEqual(
      rules.regimes.sdlt.firstTimeBuyer?.bands.map((b) => b.rate),
    );
  });

  it('England: £500,001 is the cliff edge, back to main rates', () => {
    const over = tax('eng', 'first', 500_001);
    expect(over.total).toBe(15_000);
    expect(over.reliefApplied).toBe(false);
    expect(over.bands.map((b) => b.rate)).toEqual(rules.regimes.sdlt.bands.map((b) => b.rate));
  });

  it('England: relief applied below the main nil band only when it lowers the bill', () => {
    expect(tax('eng', 'first', 100_000).reliefApplied).toBe(false);
    expect(tax('eng', 'first', 200_000)).toMatchObject({ total: 0, reliefApplied: true });
  });

  it('Scotland: nil band raised to £175k, worth up to £600, with no price cap', () => {
    expect(tax('sco', 'first', 175_000)).toMatchObject({ total: 0, reliefApplied: true });
    expect(total('sco', 'moving', 175_000)).toBe(600);
    expect(tax('sco', 'first', 1_000_000)).toMatchObject({ total: 77_750, reliefApplied: true });
    expect(tax('sco', 'first', 100_000)).toMatchObject({ total: 0, reliefApplied: false });
  });

  it('Wales: no relief, first-time buyers pay main rates', () => {
    for (const price of [100_000, 225_000, 300_000, 1_000_000]) {
      const result = tax('wal', 'first', price);
      expect(result.reliefApplied).toBe(false);
      expect(result.total).toBe(total('wal', 'moving', price));
    }
  });

  it('first-time buyers and movers never pay a surcharge', () => {
    for (const nation of NATIONS) {
      for (const price of [40_000, 300_000, 2_000_000]) {
        expect(tax(nation, 'first', price).surcharge).toBe(0);
        expect(tax(nation, 'moving', price).surcharge).toBe(0);
      }
    }
  });
});

describe('additional property', () => {
  it('surcharge is total minus what a mover pays', () => {
    expect(tax('eng', 'additional', 300_000).surcharge).toBe(15_000);
    expect(tax('sco', 'additional', 300_000).surcharge).toBe(24_000);
    expect(tax('wal', 'additional', 300_000).surcharge).toBe(15_450);
    expect(tax('eng', 'moving', 300_000).surcharge).toBe(0);
  });

  it('Wales: the official £260,000 higher-rates example is £15,950', () => {
    expect(total('wal', 'additional', 260_000)).toBe(15_950);
  });

  it('Wales: higher rates use their own table from £0', () => {
    const result = tax('wal', 'additional', 300_000);
    const table = rules.regimes.ltt.additional;
    if (table.kind !== 'higherRatesTable') throw new Error('expected a higher-rates table');
    expect(result.bands.map((b) => b.rate)).toEqual(table.bands.map((b) => b.rate));
  });

  it('England and Scotland: bands show the main table, the surcharge is on the whole price', () => {
    const result = tax('eng', 'additional', 300_000);
    expect(result.bands.map((b) => b.rate)).toEqual(rules.regimes.sdlt.bands.map((b) => b.rate));
    const bandTax = result.bands.reduce((sum, b) => sum + b.tax, 0);
    expect(bandTax + result.surcharge).toBe(result.total);
  });

  it.each([
    ['eng', 2_000],
    ['ni', 2_000],
    ['sco', 3_200],
    ['wal', 2_000],
  ] as const)('%s: no surcharge under £40,000, surcharge from £40,000 (£%i)', (nation, at40k) => {
    expect(tax(nation, 'additional', 39_999)).toMatchObject({ total: 0, surcharge: 0 });
    expect(tax(nation, 'additional', 40_000)).toMatchObject({ total: at40k, surcharge: at40k });
  });
});

describe('the bands breakdown', () => {
  it('lists the whole table, with tax only on the slices the price reaches', () => {
    const result = tax('eng', 'moving', 300_000);
    expect(result.bands).toEqual([
      { from: 0, to: 125_000, rate: 0, tax: 0 },
      { from: 125_000, to: 250_000, rate: 0.02, tax: 2_500 },
      { from: 250_000, to: 925_000, rate: 0.05, tax: 2_500 },
      { from: 925_000, to: 1_500_000, rate: 0.1, tax: 0 },
      { from: 1_500_000, to: null, rate: 0.12, tax: 0 },
    ]);
  });

  it('band tax adds up to the total within the £1 rounding', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...NATIONS),
        fc.constantFrom(...BUYER_TYPES),
        fc.integer({ min: 0, max: 5_000_000 }),
        (nation, buyerType, price) => {
          const result = tax(nation, buyerType, price);
          const additional = rules.regimes[result.regime].additional;
          const wholePrice = additional.kind === 'wholePriceSurcharge' ? result.surcharge : 0;
          const sum = result.bands.reduce((s, b) => s + b.tax, 0) + wholePrice;
          return result.total <= sum + 1e-6 && sum - result.total < 1;
        },
      ),
    );
  });
});

describe('zero and nonsense prices', () => {
  it.each([0, -1, Number.NaN, Number.NEGATIVE_INFINITY])('price %s pays nothing', (price) => {
    for (const nation of NATIONS) {
      for (const buyerType of BUYER_TYPES) {
        const result = tax(nation, buyerType, price);
        expect(result.total).toBe(0);
        expect(result.surcharge).toBe(0);
        expect(result.reliefApplied).toBe(false);
        expect(result.bands.every((b) => b.tax === 0)).toBe(true);
      }
    }
  });
});

describe('invariants', () => {
  const nation = fc.constantFrom(...NATIONS);
  const buyerType = fc.constantFrom(...BUYER_TYPES);
  const price = fc.integer({ min: 0, max: 10_000_000 });

  it('total is a whole number of pounds and never negative', () => {
    fc.assert(
      fc.property(nation, buyerType, price, (n, b, p) => {
        const t = total(n, b, p);
        return Number.isInteger(t) && t >= 0;
      }),
    );
  });

  it('a higher price never means less tax', () => {
    fc.assert(
      fc.property(nation, buyerType, price, price, (n, b, p1, p2) => {
        const [lo, hi] = p1 <= p2 ? [p1, p2] : [p2, p1];
        return total(n, b, lo) <= total(n, b, hi);
      }),
    );
  });

  it('first-time buyer <= mover <= additional property', () => {
    fc.assert(
      fc.property(nation, price, (n, p) => {
        return (
          total(n, 'first', p) <= total(n, 'moving', p) &&
          total(n, 'moving', p) <= total(n, 'additional', p)
        );
      }),
    );
  });
});

describe('taxRules.json', () => {
  it('is the 2026/27 version and cites official sources for every regime', () => {
    expect(rules.taxYear).toBe('2026/27');
    expect(rules.effectiveFrom).toBe('2026-04-01');
    const officialHosts = ['www.gov.uk', 'revenue.scot', 'www.gov.scot', 'www.gov.wales'];
    for (const regime of Object.values(rules.regimes)) {
      expect(regime.sources.length).toBeGreaterThan(0);
      for (const source of regime.sources) {
        expect(officialHosts).toContain(new URL(source.url).host);
      }
    }
  });

  it('the validator refuses a regime with no sources', () => {
    const bad = structuredClone(taxRulesJson) as { regimes: { lbtt: { sources: unknown[] } } };
    bad.regimes.lbtt.sources = [];
    expect(() => parseTaxRules(bad)).toThrow(/regimes\.lbtt\.sources/);
  });
});

describe('rules are data', () => {
  it('uses the rules it is given, not figures in code', () => {
    const edited: TaxRules = structuredClone(rules);
    const sdlt = edited.regimes.sdlt;
    if (sdlt.additional.kind !== 'wholePriceSurcharge') throw new Error('expected a surcharge');
    sdlt.additional.rate = 0.03;
    sdlt.bands = [
      { from: 0, to: 100_000, rate: 0 },
      { from: 100_000, to: null, rate: 0.1 },
    ];
    expect(propertyTax({ nation: 'eng', buyerType: 'moving', price: 300_000 }, edited).total).toBe(
      20_000,
    );
    expect(
      propertyTax({ nation: 'eng', buyerType: 'additional', price: 300_000 }, edited).total,
    ).toBe(29_000);
  });

  it('a nation can be pointed at another regime', () => {
    const edited: TaxRules = structuredClone(rules);
    edited.nations.ni = 'ltt';
    expect(propertyTax({ nation: 'ni', buyerType: 'moving', price: 300_000 }, edited).total).toBe(
      4_500,
    );
  });

  it('a first-time buyer table that would cost more is not used', () => {
    const edited: TaxRules = structuredClone(rules);
    edited.regimes.ltt.firstTimeBuyer = {
      bands: [{ from: 0, to: null, rate: 0.5 }],
      maxPrice: null,
    };
    expect(tax('wal', 'first', 300_000).total).toBe(4_500);
    expect(
      propertyTax({ nation: 'wal', buyerType: 'first', price: 300_000 }, edited),
    ).toMatchObject({ total: 4_500, reliefApplied: false });
  });
});
