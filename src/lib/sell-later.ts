/**
 * The "Sell later" model: buy with a repayment mortgage, sell after some years at a price some
 * percentage above or below what you paid, and see what comes back. Pure, no DOM, no JSON.
 *
 * Conventions:
 * - The deposit is capped at the price; the loan is the rest, repaid monthly over the term at
 *   one rate (monthlyPayment in model.ts). No fix or remortgage.
 * - Selling costs S(V) = V × agent fee + selling legal fees, as in the Rent v buy model.
 * - Cash back = sale price − selling costs − mortgage left.
 * - Put in = deposit + every monthly payment so far. Buying costs (tax, legal, survey, moving)
 *   are left out; so is the rent you would have paid anyway.
 * - Gain or loss = cash back − put in. With the sale price fixed relative to the purchase price,
 *   this falls every month by the interest paid that month: paying the mortgage down only turns
 *   cash into equity, and the interest is gone.
 */
import { monthlyPayment } from './model';

export interface SellLaterInputs {
  price: number;
  deposit: number;
  /** Annual mortgage rate, decimal. */
  mortgageRate: number;
  termYears: number;
  /** Whole years until the sale. */
  yearsHeld: number;
  agentFeeRate: number;
  legalSelling: number;
}

export interface SaleScenario {
  /** Change in price from what was paid, decimal (0.1 = 10% more). */
  change: number;
  salePrice: number;
  sellingCosts: number;
  /** Cash in hand after selling costs and clearing the mortgage. */
  cashBack: number;
  /** cashBack − put in. */
  gain: number;
}

export interface SellLaterResult {
  loan: number;
  payment: number;
  /** Mortgage left at the sale. */
  balance: number;
  /** Deposit plus payments. */
  putIn: number;
  payments: number;
  interestPaid: number;
  principalPaid: number;
  scenarios: SaleScenario[];
  /** Price change needed to get back everything put in. */
  breakEvenChange: number;
  /** The same as a yearly rate of growth. */
  breakEvenGrowth: number;
}

/** Whole months of a term, at least one. */
const termMonths = (inputs: SellLaterInputs) => Math.max(1, Math.round(inputs.termYears * 12));

/** Mortgage left after `months` payments (0 once the term is over). */
export function balanceAfter(loan: number, annualRate: number, term: number, months: number) {
  if (loan <= 0 || months >= term) return 0;
  const payment = monthlyPayment(loan, annualRate, term);
  const r = annualRate / 12;
  if (r === 0) return Math.max(0, loan - payment * months);
  const grow = Math.pow(1 + r, months);
  return Math.max(0, loan * grow - (payment * (grow - 1)) / r);
}

/** The result at a given number of years held (defaults to inputs.yearsHeld). */
export function sellLater(
  inputs: SellLaterInputs,
  changes: readonly number[],
  yearsHeld: number = inputs.yearsHeld,
): SellLaterResult {
  const price = Math.max(0, inputs.price);
  const deposit = Math.min(Math.max(0, inputs.deposit), price);
  const loan = price - deposit;
  const term = termMonths(inputs);
  const months = Math.max(0, Math.round(yearsHeld * 12));
  const payment = monthlyPayment(loan, inputs.mortgageRate, term);
  const balance = balanceAfter(loan, inputs.mortgageRate, term, months);
  const payments = payment * Math.min(months, term);
  const principalPaid = loan - balance;
  const putIn = deposit + payments;

  const scenarios = changes.map((change) => {
    const salePrice = price * (1 + change);
    const sellingCosts = salePrice * inputs.agentFeeRate + inputs.legalSelling;
    const cashBack = salePrice - sellingCosts - balance;
    return { change, salePrice, sellingCosts, cashBack, gain: cashBack - putIn };
  });

  const breakEvenPrice =
    (putIn + balance + inputs.legalSelling) / Math.max(1e-9, 1 - inputs.agentFeeRate);
  const breakEvenChange = price > 0 ? breakEvenPrice / price - 1 : 0;
  const breakEvenGrowth =
    yearsHeld > 0 && breakEvenChange > -1 ? Math.pow(1 + breakEvenChange, 1 / yearsHeld) - 1 : 0;

  return {
    loan,
    payment,
    balance,
    putIn,
    payments,
    interestPaid: payments - principalPaid,
    principalPaid,
    scenarios,
    breakEvenChange,
    breakEvenGrowth,
  };
}

export interface GainPoint {
  year: number;
  /** One gain per change, in the order given. */
  gains: number[];
}

/** Gain or loss for each change, selling at the end of each year from 0 to `toYear`. */
export function gainSeries(
  inputs: SellLaterInputs,
  changes: readonly number[],
  toYear: number,
): GainPoint[] {
  const points: GainPoint[] = [];
  for (let year = 0; year <= toYear; year += 1) {
    const { scenarios } = sellLater(inputs, changes, year);
    points.push({ year, gains: scenarios.map((s) => s.gain) });
  }
  return points;
}
