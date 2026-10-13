import { describe, expect, it } from 'vitest';
import defaultsJson from '../../data/defaults.json';
import taxRulesJson from '../../data/taxRules.json';
import { monthlyPayment, runModel, sellingCosts, upfrontCosts } from './model';
import { parseDefaults, parseTaxRules } from './schema';
import type { Inputs, NumericInputKey } from './types';
import { NUMERIC_INPUT_KEYS } from './types';

const defaults = parseDefaults(defaultsJson);
const taxRules = parseTaxRules(taxRulesJson);

/** Every input at its default from data/defaults.json (Typical outlook), England. */
function defaultInputs(): Inputs {
  const values = {} as Record<NumericInputKey, number>;
  for (const key of NUMERIC_INPUT_KEYS) {
    const field = defaults.fields[key];
    values[key] = field.byNation?.eng ?? field.default ?? Number.NaN;
  }
  return {
    ...values,
    investmentReturn: defaults.presets.typical.investmentReturn,
    nation: 'eng',
    buyerType: 'first',
  };
}

/**
 * The brief's reference scenario: England, first-time buyer, £300k price, £30k deposit, £1,250
 * rent, 4.3% for 5 years then 4.3%, 30-year term, 3% growth, every other input at its default,
 * Typical outlook.
 *
 * The brief does not state the rent growth. 3.5% a year is the value that reproduces its
 * expected 10-year figures (see docs/decisions.md, "Model conventions (phase 3)").
 */
function reference(overrides: Partial<Inputs> = {}): Inputs {
  return {
    ...defaultInputs(),
    price: 300000,
    deposit: 30000,
    rent: 1250,
    mortgageRate: 0.043,
    fixYears: 5,
    rateAfterFix: 0.043,
    termYears: 30,
    houseGrowth: 0.03,
    rentGrowth: 0.035,
    ...overrides,
  };
}

describe('defaults the reference scenario relies on', () => {
  it('match the brief', () => {
    const inputs = defaultInputs();
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
      investmentReturn: 0.05,
      inflation: 0.025,
      agentFeeRate: 0.014,
      legalSelling: 1500,
      homeReport: 0,
      years: 25,
    });
  });
});

describe('brief model test cases (reference scenario)', () => {
  const result = runModel(reference(), taxRules);

  it('monthly mortgage payment is £1,336.15', () => {
    expect(monthlyPayment(270000, 0.043, 360)).toBeCloseTo(1336.15, 2);
    expect(result.firstMonth.mortgage).toBeCloseTo(1336.15, 2);
  });

  it('first-month owning cost is £1,615.32', () => {
    expect(result.firstMonth.owning).toBeCloseTo(1615.32, 2);
    expect(result.firstMonth.maintenance).toBeCloseTo(250, 6);
    expect(result.firstMonth.insuranceAndCharges).toBeCloseTo(350 / 12, 6);
    expect(result.firstMonth.rent).toBe(1250);
  });

  it('upfront costs on top of the deposit are £4,099', () => {
    expect(result.upfront).toEqual({
      deposit: 30000,
      tax: 0,
      legal: 1800,
      survey: 500,
      moving: 800,
      productFee: 999,
      costs: 4099,
      cashNeeded: 34099,
    });
    expect(upfrontCosts(reference(), taxRules).costs).toBe(4099);
  });

  it('break-even years at 0-5% growth are 11, 5, 3, 2, 1, 1', () => {
    const years = [0, 0.01, 0.02, 0.03, 0.04, 0.05].map(
      (houseGrowth) => runModel(reference({ houseGrowth }), taxRules).breakEvenYear,
    );
    expect(years).toEqual([11, 5, 3, 2, 1, 1]);
  });

  it('buy vs rent wealth after 10 years is £181,200 vs £87,864 (±£1)', () => {
    const year10 = result.series[10];
    expect(year10?.year).toBe(10);
    expect(Math.abs((year10?.buyWealth ?? 0) - 181200)).toBeLessThanOrEqual(1);
    expect(Math.abs((year10?.rentWealth ?? 0) - 87864)).toBeLessThanOrEqual(1);
  });

  it('the growth sensitivity rows give the same break-even years', () => {
    const growthRows = result.sensitivity.filter((row) => row.kind === 'growth');
    expect(growthRows.map((row) => row.value)).toEqual([0, 0.01, 0.02, 0.03, 0.04, 0.05]);
    expect(growthRows.map((row) => row.breakEvenYear)).toEqual([11, 5, 3, 2, 1, 1]);
  });
});

describe('monthlyPayment', () => {
  it('is 0 with no loan', () => {
    expect(monthlyPayment(0, 0.05, 360)).toBe(0);
  });

  it('is principal / months at 0%', () => {
    expect(monthlyPayment(120000, 0, 240)).toBe(500);
  });

  it('repays the loan exactly over the term', () => {
    const payment = monthlyPayment(200000, 0.05, 300);
    let balance = 200000;
    for (let m = 0; m < 300; m++) balance = balance * (1 + 0.05 / 12) - payment;
    expect(balance).toBeCloseTo(0, 6);
  });
});

describe('upfrontCosts', () => {
  it('drops the product fee when there is no loan', () => {
    const upfront = upfrontCosts(reference({ deposit: 300000 }), taxRules);
    expect(upfront.productFee).toBe(0);
    expect(upfront.costs).toBe(1800 + 500 + 800);
    expect(upfront.cashNeeded).toBe(300000 + 3100);
  });

  it('caps the deposit at the price', () => {
    const upfront = upfrontCosts(reference({ deposit: 400000 }), taxRules);
    expect(upfront.deposit).toBe(300000);
    expect(upfront.productFee).toBe(0);
  });

  it('includes the property tax from the tax rules', () => {
    const upfront = upfrontCosts(reference(), taxRules);
    expect(upfront.tax).toBe(0);
    expect(upfront.costs).toBe(
      upfront.tax + upfront.legal + upfront.survey + upfront.moving + upfront.productFee,
    );
  });
});

describe('sellingCosts', () => {
  it('is agent fee + legal fees outside Scotland, ignoring the Home Report input', () => {
    const selling = sellingCosts(400000, 10, reference({ homeReport: 600 }));
    expect(selling).toEqual({
      year: 10,
      value: 400000,
      agentFee: 5600,
      legal: 1500,
      homeReport: 0,
      total: 7100,
    });
  });

  it('adds the Home Report in Scotland', () => {
    const selling = sellingCosts(400000, 10, reference({ nation: 'sco', homeReport: 600 }));
    expect(selling.homeReport).toBe(600);
    expect(selling.total).toBe(5600 + 1500 + 600);
  });
});

describe('runModel', () => {
  it('starts on day one with the deposit and costs in the renter portfolio', () => {
    const { series } = runModel(reference(), taxRules);
    const day1 = series[0];
    expect(day1).toMatchObject({
      year: 0,
      rentWealth: 34099,
      homeValue: 300000,
      mortgageBalance: 270000,
      buyPortfolio: 0,
      owningPaid: 0,
      rentPaid: 0,
    });
    expect(day1?.sellingCosts).toBeCloseTo(300000 * 0.014 + 1500, 6);
    expect(day1?.buyWealth).toBeCloseTo(30000 - 5700, 6);
  });

  it('records one point per year-end, year 0 to the horizon', () => {
    const result = runModel(reference({ years: 40 }), taxRules);
    expect(result.series).toHaveLength(41);
    expect(result.series.map((p) => p.year)).toEqual(Array.from({ length: 41 }, (_, i) => i));
    expect(result.selling.year).toBe(40);
    expect(result.selling.value).toBe(result.series[40]?.homeValue);
  });

  it('pays the mortgage off at the end of the term', () => {
    const result = runModel(reference({ termYears: 25, years: 30 }), taxRules);
    expect(result.series[24]?.mortgageBalance).toBeGreaterThan(0);
    expect(result.series[25]?.mortgageBalance).toBe(0);
    expect(result.series[30]?.mortgageBalance).toBe(0);
  });

  it('grows the home value at the annual rate', () => {
    const result = runModel(reference(), taxRules);
    expect(result.series[1]?.homeValue).toBeCloseTo(309000, 6);
    expect(result.series[10]?.homeValue).toBeCloseTo(300000 * 1.03 ** 10, 6);
  });

  it('steps rent up once a year', () => {
    const result = runModel(reference(), taxRules);
    expect(result.series[1]?.rentPaid).toBeCloseTo(1250 * 12, 6);
    expect(result.series[2]?.rentPaid).toBeCloseTo(1250 * 1.035 * 12, 6);
  });

  it('uprates insurance and service charge by inflation each year', () => {
    const flat = reference({ houseGrowth: 0, maintenanceRate: 0, serviceCharge: 650 });
    const result = runModel(flat, taxRules);
    const payment = monthlyPayment(270000, 0.043, 360) * 12;
    expect(result.series[1]?.owningPaid).toBeCloseTo(payment + 1000, 6);
    expect(result.series[2]?.owningPaid).toBeCloseTo(payment + 1000 * 1.025, 6);
  });

  it('recomputes the payment at the end of the fix on the remaining balance and term', () => {
    const inputs = reference({ rateAfterFix: 0.063, houseGrowth: 0, maintenanceRate: 0 });
    const result = runModel(inputs, taxRules);
    const balance = result.series[5]?.mortgageBalance ?? 0;
    const after = monthlyPayment(balance, 0.063, 300);
    expect(after).toBeGreaterThan(monthlyPayment(270000, 0.043, 360));
    const fixed = 350 * 1.025 ** 5;
    expect(result.series[6]?.owningPaid).toBeCloseTo(after * 12 + fixed, 6);
  });

  it('keeps the same payment when the rate after the fix is unchanged', () => {
    const inputs = reference({ houseGrowth: 0, maintenanceRate: 0, insurance: 0 });
    const result = runModel(inputs, taxRules);
    const payment = monthlyPayment(270000, 0.043, 360) * 12;
    expect(result.series[5]?.owningPaid).toBeCloseTo(payment, 6);
    expect(result.series[6]?.owningPaid).toBeCloseTo(payment, 6);
  });

  it('works with no loan (deposit equals price)', () => {
    const result = runModel(reference({ deposit: 300000 }), taxRules);
    expect(result.firstMonth.mortgage).toBe(0);
    expect(result.upfront.productFee).toBe(0);
    expect(result.series.every((p) => p.mortgageBalance === 0)).toBe(true);
    expect(result.breakEvenYear).not.toBeNull();
  });

  it('returns null when renting wins for the whole horizon', () => {
    const result = runModel(reference({ houseGrowth: 0, rent: 600, rentGrowth: 0 }), taxRules);
    expect(result.breakEvenYear).toBeNull();
    expect(result.rentingOvertakesAgainYear).toBeNull();
  });

  it('reports when renting overtakes again after break-even', () => {
    // A cheap 2-year fix followed by a much higher rate: buying edges ahead early on the strength
    // of house price growth, then the higher payments and flat prices let renting catch up.
    const result = runModel(
      reference({
        mortgageRate: 0.01,
        fixYears: 2,
        rateAfterFix: 0.15,
        houseGrowth: 0.05,
        rentGrowth: 0.01,
        years: 40,
      }),
      taxRules,
    );
    expect(result.breakEvenYear).not.toBeNull();
    expect(result.rentingOvertakesAgainYear).not.toBeNull();
    const again = result.rentingOvertakesAgainYear ?? 0;
    expect(again).toBeGreaterThan(result.breakEvenYear ?? Infinity);
    const point = result.series[again];
    expect(point && point.rentWealth >= point.buyWealth).toBe(true);
  });

  it('breaks even at the first year-end with buy strictly ahead', () => {
    const result = runModel(reference(), taxRules);
    const year = result.breakEvenYear ?? 0;
    expect(year).toBe(2);
    for (const point of result.series.slice(1, year)) {
      expect(point.buyWealth).toBeLessThanOrEqual(point.rentWealth);
    }
    const at = result.series[year];
    expect(at && at.buyWealth > at.rentWealth).toBe(true);
  });

  it('builds sensitivity rows for growth 0-5% and rate -1/+1 point', () => {
    const result = runModel(reference(), taxRules);
    expect(result.sensitivity).toHaveLength(8);
    const rateRows = result.sensitivity.filter((row) => row.kind === 'rate');
    expect(rateRows.map((row) => row.value)).toEqual([-0.01, 0.01]);
    expect(rateRows[0]?.mortgageRate).toBeCloseTo(0.033, 10);
    expect(rateRows[1]?.mortgageRate).toBeCloseTo(0.053, 10);
    expect(rateRows.every((row) => row.houseGrowth === 0.03)).toBe(true);
    const lower = rateRows[0]?.breakEvenYear ?? Infinity;
    const higher = rateRows[1]?.breakEvenYear ?? Infinity;
    expect(lower).toBeLessThanOrEqual(2);
    expect(higher).toBeGreaterThanOrEqual(2);
    for (const row of result.sensitivity.filter((r) => r.kind === 'growth')) {
      expect(row.mortgageRate).toBe(0.043);
      expect(row.houseGrowth).toBe(row.value);
    }
  });

  it('floors the rate rows at 0', () => {
    const result = runModel(reference({ mortgageRate: 0.005, rateAfterFix: 0.005 }), taxRules);
    const lower = result.sensitivity.find((row) => row.kind === 'rate' && row.value < 0);
    expect(lower?.mortgageRate).toBe(0);
  });

  it('skips sensitivity when asked', () => {
    expect(runModel(reference(), taxRules, { sensitivity: false }).sensitivity).toEqual([]);
  });

  it('applies the Home Report only in Scotland', () => {
    const eng = runModel(reference({ homeReport: 600 }), taxRules);
    const sco = runModel(reference({ homeReport: 600, nation: 'sco' }), taxRules);
    expect(eng.selling.homeReport).toBe(0);
    expect(sco.selling.homeReport).toBe(600);
  });

  it('handles a zero price without NaN', () => {
    const result = runModel(reference({ price: 0, deposit: 0 }), taxRules);
    for (const point of result.series) {
      expect(Number.isFinite(point.buyWealth)).toBe(true);
      expect(Number.isFinite(point.rentWealth)).toBe(true);
    }
  });

  it('runs 40 years with sensitivity in well under 5ms', () => {
    const inputs = reference({ years: 40 });
    for (let i = 0; i < 20; i++) runModel(inputs, taxRules); // warm up
    const times: number[] = [];
    for (let i = 0; i < 50; i++) {
      const start = performance.now();
      runModel(inputs, taxRules);
      times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    expect(times[Math.floor(times.length / 2)]).toBeLessThan(5);
  });
});
