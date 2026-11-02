import { describe, expect, it } from 'vitest';
import { monthlyPayment } from './model';
import { balanceAfter, gainSeries, sellLater, type SellLaterInputs } from './sell-later';

const inputs: SellLaterInputs = {
  price: 300000,
  deposit: 30000,
  mortgageRate: 0.045,
  termYears: 30,
  yearsHeld: 5,
  agentFeeRate: 0.014,
  legalSelling: 1500,
};

describe('balanceAfter', () => {
  it('matches stepping the loan month by month', () => {
    const loan = 270000;
    const payment = monthlyPayment(loan, 0.045, 360);
    let balance = loan;
    for (let m = 0; m < 60; m += 1) balance = balance * (1 + 0.045 / 12) - payment;
    expect(balanceAfter(loan, 0.045, 360, 60)).toBeCloseTo(balance, 6);
  });

  it('is zero at the end of the term and handles a 0% rate', () => {
    expect(balanceAfter(270000, 0.045, 360, 360)).toBe(0);
    expect(balanceAfter(120000, 0, 120, 60)).toBeCloseTo(60000, 6);
  });
});

describe('sellLater', () => {
  const result = sellLater(inputs, [-0.1, 0, 0.1]);

  it('splits payments into interest and principal', () => {
    expect(result.payments).toBeCloseTo(result.payment * 60, 6);
    expect(result.interestPaid + result.principalPaid).toBeCloseTo(result.payments, 6);
    expect(result.balance).toBeCloseTo(result.loan - result.principalPaid, 6);
    expect(result.putIn).toBeCloseTo(30000 + result.payments, 6);
  });

  it('works out cash back and gain', () => {
    const flat = result.scenarios[1]!;
    expect(flat.salePrice).toBe(300000);
    expect(flat.sellingCosts).toBeCloseTo(300000 * 0.014 + 1500, 6);
    expect(flat.cashBack).toBeCloseTo(300000 - flat.sellingCosts - result.balance, 6);
    // Selling at the same price loses the interest and the selling costs.
    expect(flat.gain).toBeCloseTo(-(result.interestPaid + flat.sellingCosts), 6);
  });

  it('gives a break-even change where the gain is zero', () => {
    const [even] = sellLater(inputs, [result.breakEvenChange]).scenarios;
    expect(even!.gain).toBeCloseTo(0, 4);
    expect(Math.pow(1 + result.breakEvenGrowth, 5) - 1).toBeCloseTo(result.breakEvenChange, 9);
  });

  it('caps the deposit at the price (no loan, no payments)', () => {
    const cash = sellLater({ ...inputs, deposit: 400000 }, [0]);
    expect(cash.loan).toBe(0);
    expect(cash.payments).toBe(0);
    expect(cash.putIn).toBe(300000);
  });
});

describe('gainSeries', () => {
  it('falls each year by the interest paid when the sale price is fixed', () => {
    const series = gainSeries(inputs, [0.1], 10);
    expect(series).toHaveLength(11);
    for (let i = 1; i < series.length; i += 1) {
      expect(series[i]!.gains[0]!).toBeLessThan(series[i - 1]!.gains[0]!);
    }
  });
});
