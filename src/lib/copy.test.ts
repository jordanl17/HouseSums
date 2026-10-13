import { describe, expect, it } from 'vitest';
import defaultsJson from '../../data/defaults.json';
import taxRulesJson from '../../data/taxRules.json';
import {
  answerCopy,
  answerFacts,
  breakEvenText,
  flipHint,
  hasNoMortgage,
  keyNumbersCopy,
  shortPercent,
  type AnswerFacts,
} from './copy';
import { chartSummary, growthTable, rateTable, taxName, taxNote } from './copy-details';
import { runModel } from './model';
import { parseDefaults, parseTaxRules } from './schema';
import { propertyTax } from './tax';
import type { Inputs, NumericInputKey } from './types';
import { NUMERIC_INPUT_KEYS } from './types';

const defaults = parseDefaults(defaultsJson);
const taxRules = parseTaxRules(taxRulesJson);

/** The brief's reference scenario (rent growth 3.5%, as in model.test.ts). */
function reference(overrides: Partial<Inputs> = {}): Inputs {
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
    price: 300000,
    deposit: 30000,
    rent: 1250,
    mortgageRate: 0.043,
    rateAfterFix: 0.043,
    houseGrowth: 0.03,
    rentGrowth: 0.035,
    ...overrides,
  };
}

const run = (inputs: Inputs) => runModel(inputs, taxRules);
const breakEven = (inputs: Inputs) =>
  runModel(inputs, taxRules, { sensitivity: false }).breakEvenYear;

const facts = (patch: Partial<AnswerFacts> = {}): AnswerFacts => ({
  breakEvenYear: 6,
  rentingOvertakesAgainYear: null,
  years: 25,
  areaName: 'Leeds',
  noMortgage: false,
  ...patch,
});

/** Copy rules from the brief that apply to every string the results show. */
function expectHouseStyle(text: string) {
  expect(text).not.toMatch(/—|–/); // no em or en dashes
  expect(text).not.toContain('!');
  expect(text).not.toMatch(/\byou should\b|\bwe recommend\b|\bunlock\b/i);
}

describe('answerCopy', () => {
  it('break-even: "Buying pulls ahead after N years in {Area}" with one explaining sentence', () => {
    const copy = answerCopy(facts());
    expect(copy.kind).toBe('break-even');
    expect(copy.headline).toBe('Buying pulls ahead after 6 years in Leeds');
    expect([copy.lead, copy.numeral, copy.unit]).toEqual([
      'Buying pulls ahead after',
      '6',
      'years in Leeds',
    ]);
    expect(copy.note).toBe(
      'If you sold in year 6 or later, buying would leave you with more than renting and investing the difference.',
    );
    expect(copy.overtake).toBeNull();
  });

  it('break-even in year 1 is singular', () => {
    const copy = answerCopy(facts({ breakEvenYear: 1 }));
    expect(copy.headline).toBe('Buying pulls ahead after 1 year in Leeds');
    expect(copy.unit).toBe('year in Leeds');
    expect(copy.note).toMatch(/^Even if you sold after the first year, buying would/);
  });

  it('renting catches up again: the note gives the window and a second line says when', () => {
    const copy = answerCopy(facts({ breakEvenYear: 6, rentingOvertakesAgainYear: 19 }));
    expect(copy.headline).toBe('Buying pulls ahead after 6 years in Leeds');
    expect(copy.note).toMatch(/^If you sold between year 6 and year 18, buying would/);
    expect(copy.overtake).toBe('Renting catches up again in year 19.');
  });

  it('renting catches up the very next year: a one-year window', () => {
    const copy = answerCopy(facts({ breakEvenYear: 2, rentingOvertakesAgainYear: 3 }));
    expect(copy.note).toMatch(/^If you sold in year 2, buying would/);
    expect(copy.overtake).toBe('Renting catches up again in year 3.');
  });

  it('no break-even: "Renting comes out ahead for all N years", numeral is the horizon', () => {
    const copy = answerCopy(facts({ breakEvenYear: null, years: 25 }));
    expect(copy.kind).toBe('no-break-even');
    expect(copy.headline).toBe('Renting comes out ahead for all 25 years in Leeds');
    expect(copy.numeral).toBe('25');
    expect(copy.note).toBe(
      'At these settings, whenever you sold, you would have more by renting and investing the difference.',
    );
    expect(copy.overtake).toBeNull();
  });

  it('no break-even over a single year reads naturally', () => {
    const copy = answerCopy(facts({ breakEvenYear: null, years: 1 }));
    expect(copy.headline).toBe('Renting comes out ahead over 1 year in Leeds');
  });

  it('deposit equals price: says plainly there is no mortgage, in every case', () => {
    const yes = answerCopy(facts({ noMortgage: true, breakEvenYear: 3 }));
    expect(yes.note).toBe(
      "The deposit covers the whole price, so there's no mortgage. If you sold in year 3 or later, buying outright would leave you with more than renting and investing the same money.",
    );
    const no = answerCopy(facts({ noMortgage: true, breakEvenYear: null }));
    expect(no.note).toMatch(/^The deposit covers the whole price, so there's no mortgage\./);
  });

  it('every case keeps to the house style', () => {
    for (const breakEvenYear of [null, 1, 6]) {
      for (const rentingOvertakesAgainYear of [null, 9]) {
        for (const noMortgage of [false, true]) {
          const copy = answerCopy(facts({ breakEvenYear, rentingOvertakesAgainYear, noMortgage }));
          for (const text of [copy.headline, copy.note, copy.overtake ?? ''])
            expectHouseStyle(text);
        }
      }
    }
  });

  it('takes its facts from the model: the reference scenario pulls ahead after 2 years', () => {
    const result = run(reference());
    const copy = answerCopy(answerFacts(result, 25, 'Leeds'));
    expect(copy.headline).toBe('Buying pulls ahead after 2 years in Leeds');
    expect(hasNoMortgage(result)).toBe(false);
  });
});

describe('hasNoMortgage', () => {
  it('is true when the deposit covers the price, including a deposit above it', () => {
    expect(hasNoMortgage(run(reference({ deposit: 300000 })))).toBe(true);
    expect(hasNoMortgage(run(reference({ deposit: 400000 })))).toBe(true);
    expect(hasNoMortgage(run(reference({ deposit: 299999 })))).toBe(false);
  });
});

describe('flipHint (re-runs the model)', () => {
  it('names the house price growth that flips it, and that growth really does', () => {
    // Cheap rent and flat prices: renting wins for all 25 years.
    const inputs = reference({ rent: 700, houseGrowth: 0 });
    expect(breakEven(inputs)).toBeNull();
    const hint = flipHint(inputs, breakEven);
    expect(hint.key).toBe('houseGrowth');
    expect(hint.text).toMatch(
      /^At \d+(\.5)?% house price growth a year, buying would pull ahead after \d+ years?\.$/,
    );
    const growth = Number(/At ([\d.]+)%/.exec(hint.text)?.[1]) / 100;
    expect(breakEven({ ...inputs, houseGrowth: growth })).toBe(hint.breakEvenYear);
    // Half a point less does not flip it: the hint names the smallest step that does.
    expect(breakEven({ ...inputs, houseGrowth: growth - 0.005 })).toBeNull();
    expectHouseStyle(hint.text);
  });

  it('falls back to a longer comparison when growth up to 6% is not enough', () => {
    const inputs = reference({
      rent: 400,
      houseGrowth: 0.06,
      mortgageRate: 0.07,
      rateAfterFix: 0.07,
      years: 10,
    });
    expect(breakEven(inputs)).toBeNull();
    const hint = flipHint(inputs, breakEven);
    expect(hint.key).toBe('years');
    expect(hint.text).toMatch(
      /^Compared over 40 years, buying would pull ahead after \d+ years\.$/,
    );
    expect(breakEven({ ...inputs, years: 40 })).toBe(hint.breakEvenYear);
  });

  it('tries rent, then the mortgage rate, using the runner it is given', () => {
    const rentHint = flipHint(reference({ houseGrowth: 0.06, years: 40 }), (inputs) =>
      inputs.rent > 1300 ? 12 : null,
    );
    expect(rentHint.key).toBe('rent');
    expect(rentHint.text).toBe(
      'If rent for a similar home were £1,310 a month, buying would pull ahead after 12 years.',
    );
    const rateHint = flipHint(reference({ houseGrowth: 0.06, years: 40 }), (inputs) =>
      inputs.rent === 1250 && inputs.mortgageRate < 0.0386 ? 20 : null,
    );
    expect(rateHint.key).toBe('mortgageRate');
    expect(rateHint.text).toBe('At a 3.8% mortgage rate, buying would pull ahead after 20 years.');
  });

  it('skips the mortgage rate when there is no mortgage, and says so when nothing flips it', () => {
    const tried: Inputs[] = [];
    const hint = flipHint(
      reference({ houseGrowth: 0.06, years: 40 }),
      (inputs) => {
        tried.push(inputs);
        return null;
      },
      true,
    );
    expect(hint.key).toBeNull();
    expect(tried.every((inputs) => inputs.mortgageRate === 0.043)).toBe(true);
    expectHouseStyle(hint.text);
  });

  it('starts above the current growth, never at or below it', () => {
    const seen: number[] = [];
    flipHint(reference({ houseGrowth: 0.042 }), (inputs) => {
      seen.push(inputs.houseGrowth);
      return null;
    });
    expect(seen[0]).toBe(0.045);
    expect(Math.max(...seen)).toBe(0.06);
  });
});

describe('key numbers', () => {
  it('reference scenario: cash, first month own v rent, and the signed 10-year difference', () => {
    const copy = keyNumbersCopy(run(reference()));
    expect(copy.cash).toBe('£34,099');
    expect(copy.firstMonth).toBe('£1,615 / £1,250');
    expect(copy.afterLabel).toBe('After 10 years');
    expect(copy.after).toBe('+£93,335');
    expect(copy.afterUnit).toBe('buying ahead');
  });

  it('uses the horizon when it is shorter than 10 years, and a true minus when renting is ahead', () => {
    const copy = keyNumbersCopy(run(reference({ years: 1, houseGrowth: 0 })));
    expect(copy.afterLabel).toBe('After 1 year');
    expect(copy.after.startsWith('−£')).toBe(true);
    expect(copy.afterUnit).toBe('renting ahead');
  });
});

describe('sensitivity tables', () => {
  it('growth: 0-5% with the current row marked', () => {
    const inputs = reference();
    const table = growthTable(run(inputs), inputs);
    expect(table.rows.map((row) => row.setting)).toEqual([
      '0% a year',
      '1% a year',
      '2% a year',
      '3% a year',
      '4% a year',
      '5% a year',
    ]);
    // The brief's break-even years at 0-5% growth.
    expect(table.rows.map((row) => row.answer)).toEqual([
      '11 years',
      '5 years',
      '3 years',
      '2 years',
      '1 year',
      '1 year',
    ]);
    expect(table.current).toBe(3);
  });

  it('growth off the grid gets its own row, in order, as the current one', () => {
    const inputs = reference({ houseGrowth: 0.042 });
    const result = run(inputs);
    const table = growthTable(result, inputs);
    expect(table.rows).toHaveLength(7);
    expect(table.current).toBe(5);
    expect(table.rows[5]).toEqual({
      setting: '4.2% a year',
      answer: breakEvenText(result.breakEvenYear, 25),
    });
  });

  it('rate: 1 point lower, as entered, 1 point higher', () => {
    const inputs = reference();
    const table = rateTable(run(inputs), inputs);
    expect(table.rows.map((row) => row.setting)).toEqual([
      '3.30% (1 point lower)',
      '4.30%',
      '5.30% (1 point higher)',
    ]);
    expect(table.current).toBe(1);
  });

  it('rate: a lower row floored to the current rate is left out', () => {
    const inputs = reference({ mortgageRate: 0, rateAfterFix: 0 });
    const table = rateTable(run(inputs), inputs);
    expect(table.rows.map((row) => row.setting)).toEqual(['0.00%', '1.00% (1 point higher)']);
    expect(table.current).toBe(0);
  });

  it('no break-even reads "None in N years"', () => {
    expect(breakEvenText(null, 25)).toBe('None in 25 years');
    expect(breakEvenText(1, 25)).toBe('1 year');
  });
});

describe('property tax names and notes', () => {
  it('names each tax plain words first', () => {
    expect(taxName(taxRules.regimes.sdlt)).toBe('Stamp duty (SDLT)');
    expect(taxName(taxRules.regimes.lbtt)).toBe('Land and Buildings Transaction Tax (LBTT)');
    expect(taxName(taxRules.regimes.ltt)).toBe('Land Transaction Tax (LTT)');
  });

  const note = (nation: Inputs['nation'], buyerType: Inputs['buyerType'], price: number) => {
    const tax = propertyTax({ nation, buyerType, price }, taxRules);
    return taxNote(tax, taxRules.regimes[tax.regime], buyerType, price);
  };

  it('notes first-time buyer relief, or why there is none', () => {
    expect(note('eng', 'first', 450000)).toBe('First-time buyer relief applied');
    expect(note('eng', 'first', 550000)).toBe('No first-time buyer relief above £500,000');
    expect(note('wal', 'first', 300000)).toBe('No first-time buyer relief on LTT');
    expect(note('sco', 'first', 300000)).toBe('First-time buyer relief applied');
    expect(note('eng', 'first', 100000)).toBeNull();
  });

  it('notes the surcharge on an additional property by its name', () => {
    expect(note('eng', 'additional', 300000)).toBe(
      'Includes £15,000 for the higher rates for an additional property',
    );
    expect(note('sco', 'additional', 300000)).toBe(
      'Includes £24,000 for the Additional Dwelling Supplement (ADS)',
    );
    expect(note('wal', 'additional', 300000)).toBe(
      'Includes £15,450 for the higher rates for an additional property',
    );
    expect(note('eng', 'additional', 39999)).toBe(
      'No extra charge for an additional property under £40,000',
    );
    expect(note('eng', 'moving', 300000)).toBeNull();
  });
});

describe('small formatters', () => {
  it('shortPercent drops trailing zeros', () => {
    expect(shortPercent(0.04)).toBe('4%');
    expect(shortPercent(0.045)).toBe('4.5%');
    expect(shortPercent(0.0325)).toBe('3.25%');
    expect(shortPercent(0.1)).toBe('10%');
    expect(shortPercent(0)).toBe('0%');
  });
});

describe('chartSummary', () => {
  it('describes the start, the crossing and the end in words', () => {
    const summary = chartSummary(run(reference()));
    expect(summary).toMatch(
      /^If you sold, buying starts £[\d,]+ behind renting, pulls ahead in year 2 and ends £[\d,]+ ahead of renting after 25 years\.$/,
    );
    expectHouseStyle(summary);
  });
});
