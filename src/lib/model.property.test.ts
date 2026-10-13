/**
 * The brief's four model invariants, as property-based tests.
 *
 * The rent-up and selling-costs-up invariants hold everywhere, so they are drawn over the full UI
 * bounds (every field's min, max and step from data/defaults.json, via `uiBoundsInputs`). The
 * growth invariant and the zero-growth identity use realistic ranges (narrower than the UI's) for
 * the reasons given on `realisticInputs` and in the identity test.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import defaultsJson from '../../data/defaults.json';
import taxRulesJson from '../../data/taxRules.json';
import { runModel } from './model';
import { parseDefaults, parseTaxRules } from './schema';
import {
  BUYER_TYPES,
  NATIONS,
  NUMERIC_INPUT_KEYS,
  type Inputs,
  type NumericInputKey,
} from './types';

const taxRules = parseTaxRules(taxRulesJson);
const defaults = parseDefaults(defaultsJson);
const NO_SENSITIVITY = { sensitivity: false } as const;

/** A decimal in [min, max] with 4 decimal places, so shrunk counterexamples stay readable. */
const decimal = (min: number, max: number) =>
  fc.integer({ min: Math.round(min * 10000), max: Math.round(max * 10000) }).map((n) => n / 10000);

/**
 * Realistic scenarios. The growth invariant is only true where the value gained from faster
 * growth outweighs the maintenance it costs: maintenance is a share of the (growing) value, and
 * the renter invests the extra. With 5% maintenance, 15% investment returns and 40 years (all
 * allowed by the UI bounds) faster growth can lose money for the buyer, so the invariants are
 * stated over the ranges a real scenario sits in: maintenance up to 2%, returns up to 8%.
 */
const realisticInputs: fc.Arbitrary<Inputs> = fc
  .record({
    nation: fc.constantFrom(...NATIONS),
    buyerType: fc.constantFrom(...BUYER_TYPES),
    price: fc.integer({ min: 50, max: 1500 }).map((n) => n * 1000),
    depositShare: decimal(0.05, 1),
    rent: fc.integer({ min: 30, max: 500 }).map((n) => n * 10),
    mortgageRate: decimal(0, 0.1),
    rateAfterFix: decimal(0, 0.1),
    houseGrowth: decimal(-0.03, 0.08),
    termYears: fc.integer({ min: 5, max: 40 }),
    fixYears: fc.integer({ min: 1, max: 10 }),
    productFee: fc.integer({ min: 0, max: 3000 }),
    legalBuying: fc.integer({ min: 0, max: 5000 }),
    survey: fc.integer({ min: 0, max: 2000 }),
    moving: fc.integer({ min: 0, max: 5000 }),
    maintenanceRate: decimal(0, 0.02),
    insurance: fc.integer({ min: 0, max: 2000 }),
    serviceCharge: fc.integer({ min: 0, max: 5000 }),
    rentGrowth: decimal(-0.02, 0.08),
    investmentReturn: decimal(0, 0.08),
    inflation: decimal(0, 0.06),
    agentFeeRate: decimal(0, 0.03),
    legalSelling: fc.integer({ min: 0, max: 5000 }),
    homeReport: fc.integer({ min: 0, max: 1000 }),
    years: fc.integer({ min: 1, max: 40 }),
  })
  .map(({ depositShare, ...rest }) => ({
    ...rest,
    deposit: Math.round(rest.price * depositShare),
  }));

/** Every value the UI allows for a field: min to max in steps of `step`, from defaults.json. */
const uiValue = (key: NumericInputKey) => {
  const { min, max, step } = defaults.fields[key];
  const steps = Math.floor((max - min) / step + 1e-9);
  return fc.integer({ min: 0, max: steps }).map((n) => Math.round((min + n * step) * 1e10) / 1e10);
};

/** Two UI values for a field, lower first (they may be equal). */
const uiPair = (key: NumericInputKey): fc.Arbitrary<readonly [number, number]> =>
  fc.tuple(uiValue(key), uiValue(key)).map(([a, b]) => [Math.min(a, b), Math.max(a, b)] as const);

/**
 * Any scenario the UI can produce: every numeric input across its full min/max at its step. The
 * deposit is a share of the price, because the UI clamps it to the price ("Deposit can't be more
 * than the price").
 */
const uiBoundsInputs: fc.Arbitrary<Inputs> = fc
  .record({
    nation: fc.constantFrom(...NATIONS),
    buyerType: fc.constantFrom(...BUYER_TYPES),
    depositShare: decimal(0, 1),
    ...(Object.fromEntries(
      NUMERIC_INPUT_KEYS.filter((key) => key !== 'deposit').map((key) => [key, uiValue(key)]),
    ) as Record<Exclude<NumericInputKey, 'deposit'>, fc.Arbitrary<number>>),
  })
  .map(({ depositShare, ...rest }) => ({
    ...rest,
    deposit: Math.round(rest.price * depositShare),
  }));

/** Break-even year with "never" as +Infinity, so later/earlier compare numerically. */
const breakEven = (inputs: Inputs): number =>
  runModel(inputs, taxRules, NO_SENSITIVITY).breakEvenYear ?? Infinity;

describe('model invariants (fast-check)', () => {
  it('raising house price growth never makes the break-even year later', () => {
    fc.assert(
      fc.property(realisticInputs, decimal(0.0001, 0.05), (inputs, extra) => {
        const higher = { ...inputs, houseGrowth: inputs.houseGrowth + extra };
        expect(breakEven(higher)).toBeLessThanOrEqual(breakEven(inputs));
      }),
      { numRuns: 500 },
    );
  });

  it('documents why the growth invariant needs realistic ranges', () => {
    // Found by grid search at the edges of the UI bounds: 5% maintenance, 15% returns, 15% rent
    // growth, falling prices. Faster growth raises maintenance (a share of value) by more than
    // the buyer gains, because the renter invests that extra at 15%. Not a model bug: it is what
    // the brief's formulas imply at these settings.
    const extreme: Inputs = {
      nation: 'eng',
      buyerType: 'first',
      price: 300000,
      deposit: 15000,
      rent: 525,
      mortgageRate: 0.043,
      rateAfterFix: 0.043,
      houseGrowth: -0.03,
      termYears: 30,
      fixYears: 5,
      productFee: 999,
      legalBuying: 1800,
      survey: 500,
      moving: 800,
      maintenanceRate: 0.05,
      insurance: 350,
      serviceCharge: 0,
      rentGrowth: 0.15,
      investmentReturn: 0.15,
      inflation: 0.025,
      agentFeeRate: 0.014,
      legalSelling: 1500,
      homeReport: 0,
      years: 40,
    };
    expect(breakEven(extreme)).toBe(39);
    expect(breakEven({ ...extreme, houseGrowth: -0.02 })).toBe(40);
  });

  it('raising rent never makes the break-even year later (full UI bounds)', () => {
    fc.assert(
      fc.property(uiBoundsInputs, uiPair('rent'), (inputs, [low, high]) => {
        const lower = { ...inputs, rent: low };
        const higher = { ...inputs, rent: high };
        expect(breakEven(higher)).toBeLessThanOrEqual(breakEven(lower));
      }),
      { numRuns: 1000 },
    );
  });

  it('raising selling costs never makes the break-even year earlier (full UI bounds)', () => {
    fc.assert(
      fc.property(
        uiBoundsInputs,
        uiPair('agentFeeRate'),
        uiPair('legalSelling'),
        uiPair('homeReport'),
        (inputs, agent, legal, homeReport) => {
          const lower = {
            ...inputs,
            agentFeeRate: agent[0],
            legalSelling: legal[0],
            homeReport: homeReport[0],
          };
          const higher = {
            ...inputs,
            agentFeeRate: agent[1],
            legalSelling: legal[1],
            homeReport: homeReport[1],
          };
          expect(breakEven(higher)).toBeGreaterThanOrEqual(breakEven(lower));
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('draws the UI-bounds scenarios from the edges of every field too', () => {
    // A guard on the generator itself: the corners the realistic ranges leave out (5%
    // maintenance, 15% returns, 40 years, £10m prices) must be reachable.
    const seen = { maxMaintenance: false, maxReturn: false, minReturn: false, maxPrice: false };
    fc.assert(
      fc.property(uiBoundsInputs, (inputs) => {
        const { fields } = defaults;
        expect(inputs.deposit).toBeLessThanOrEqual(inputs.price);
        for (const key of NUMERIC_INPUT_KEYS) {
          expect(inputs[key]).toBeGreaterThanOrEqual(fields[key].min);
          expect(inputs[key]).toBeLessThanOrEqual(fields[key].max);
        }
        seen.maxMaintenance ||= inputs.maintenanceRate > 0.045;
        seen.maxReturn ||= inputs.investmentReturn > 0.13;
        seen.minReturn ||= inputs.investmentReturn < 0;
        seen.maxPrice ||= inputs.price > 5_000_000;
      }),
      { numRuns: 1000 },
    );
    expect(seen).toEqual({
      maxMaintenance: true,
      maxReturn: true,
      minReturn: true,
      maxPrice: true,
    });
  });

  it('zero-growth identity: buy minus rent = principal repaid - upfront costs - selling costs', () => {
    // 0% growth, 0% investment return, and rent equal to the owning cost every month. Owning cost
    // is constant when nothing grows: no inflation, the same rate after the fix, and a horizon
    // inside the mortgage term. Rent is then set to the first month's owning cost.
    const scenario = realisticInputs
      .filter((inputs) => inputs.years <= inputs.termYears)
      .map((inputs): Inputs => ({
        ...inputs,
        houseGrowth: 0,
        investmentReturn: 0,
        inflation: 0,
        rentGrowth: 0,
        rateAfterFix: inputs.mortgageRate,
      }));
    fc.assert(
      fc.property(scenario, (base) => {
        const owning = runModel(base, taxRules, NO_SENSITIVITY).firstMonth.owning;
        const inputs = { ...base, rent: owning };
        const result = runModel(inputs, taxRules, NO_SENSITIVITY);
        const loan = Math.max(0, inputs.price - inputs.deposit);
        for (const point of result.series) {
          const repaid = loan - point.mortgageBalance;
          const expected = repaid - result.upfront.costs - point.sellingCosts;
          expect(point.buyWealth - point.rentWealth).toBeCloseTo(expected, 4);
        }
      }),
      { numRuns: 300 },
    );
  });
});
