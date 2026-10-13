/**
 * The rent v buy model: a pure monthly simulation of two households, as in the brief's
 * "Calculation spec". No DOM, no JSON imports, no figures: everything comes from `inputs` and
 * `taxRules`.
 *
 * Owner: model teammate. Conventions (each one checked against the brief's test cases, see
 * docs/decisions.md "Model conventions (phase 3)"):
 * - Day one: upfront costs U = tax + legal + survey + moving + product fee (only with a loan).
 *   The deposit is capped at the price. The renter's portfolio starts at D + U, the buyer's at 0.
 * - Each month, in this order:
 *   1. At the first month after the fix, the payment is recomputed on the remaining balance and
 *      remaining term at the rate after the fix.
 *   2. Mortgage: interest = balance × annual rate / 12, then the payment (end of month). The last
 *      month of the term clears whatever is left.
 *   3. Owning cost = payment + maintenance on the value at the start of the month + (insurance +
 *      service charge) / 12 uprated by inflation for each whole year elapsed. Maintenance is not
 *      uprated by inflation (it already follows the home's value).
 *   4. Rent = starting rent × (1 + rent growth)^(whole years elapsed).
 *   5. Home value grows by the monthly equivalent of house price growth.
 *   6. Both portfolios grow by the monthly equivalent of the investment return (the renter's
 *      starting portfolio grows from month 1), then whoever spent less that month invests the
 *      difference at the end of the month.
 * - Year-end: W_buy = V − B − S(V) + P_own, W_rent = P_rent. S(V) = V × agent fee + selling
 *   legal fees + Home Report (Scotland only). Selling costs are not uprated by inflation.
 * - Nothing is rounded inside the model; the UI formats.
 */
import { propertyTax } from './tax';
import type {
  FirstMonthCosts,
  Inputs,
  ModelOptions,
  ModelResult,
  SellingBreakdown,
  SensitivityRow,
  TaxRules,
  UpfrontBreakdown,
  YearPoint,
} from './types';

/** House price growth for the "what moves the answer" rows (the brief: 0-5%). */
const SENSITIVITY_GROWTH = [0, 0.01, 0.02, 0.03, 0.04, 0.05] as const;
/** Mortgage rate changes for the sensitivity rows (the brief: ±1 point). */
const SENSITIVITY_RATE = [-0.01, 0.01] as const;

/**
 * Standard repayment formula M = L·r / (1 − (1 + r)^−n), r = annualRate / 12, n = months.
 * Returns 0 when principal is 0, and principal / months when the rate is 0.
 */
export function monthlyPayment(principal: number, annualRate: number, months: number): number {
  if (principal <= 0) return 0;
  const n = Math.max(1, months);
  const r = annualRate / 12;
  if (r === 0) return principal / n;
  return (principal * r) / (1 - Math.pow(1 + r, -n));
}

/** Monthly equivalent of an annual rate: (1 + annual)^(1/12) − 1. */
const monthlyRate = (annual: number): number => Math.pow(1 + annual, 1 / 12) - 1;

/** The deposit actually used: between 0 and the price. */
const effectiveDeposit = (inputs: Inputs): number =>
  Math.min(Math.max(0, inputs.deposit), Math.max(0, inputs.price));

function buildUpfront(inputs: Inputs, tax: number): UpfrontBreakdown {
  const deposit = effectiveDeposit(inputs);
  const hasLoan = inputs.price - deposit > 0;
  const productFee = hasLoan ? inputs.productFee : 0;
  const costs = tax + inputs.legalBuying + inputs.survey + inputs.moving + productFee;
  return {
    deposit,
    tax,
    legal: inputs.legalBuying,
    survey: inputs.survey,
    moving: inputs.moving,
    productFee,
    costs,
    cashNeeded: deposit + costs,
  };
}

/** Upfront costs on day one: tax + legal + survey + moving + product fee (only with a loan). */
export function upfrontCosts(inputs: Inputs, taxRules: TaxRules): UpfrontBreakdown {
  const tax = propertyTax(
    { nation: inputs.nation, buyerType: inputs.buyerType, price: inputs.price },
    taxRules,
  );
  return buildUpfront(inputs, tax.total);
}

/** Home Report applies only in Scotland, whatever the input holds. */
const homeReportFor = (inputs: Inputs): number => (inputs.nation === 'sco' ? inputs.homeReport : 0);

/** S(V) = V × agent fee + selling legal fees + Home Report (Scotland only). */
export function sellingCosts(value: number, year: number, inputs: Inputs): SellingBreakdown {
  const agentFee = value * inputs.agentFeeRate;
  const homeReport = homeReportFor(inputs);
  return {
    year,
    value,
    agentFee,
    legal: inputs.legalSelling,
    homeReport,
    total: agentFee + inputs.legalSelling + homeReport,
  };
}

interface Simulation {
  breakEvenYear: number | null;
  rentingOvertakesAgainYear: number | null;
}

interface Recording {
  series: YearPoint[];
  firstMonth: FirstMonthCosts | null;
}

/**
 * The monthly loop. With `recording` it fills the series and first month; without it, it returns
 * as soon as the break-even year is known (the sensitivity rows need nothing else).
 */
function simulate(inputs: Inputs, upfront: UpfrontBreakdown, recording: Recording | null) {
  const result: Simulation = { breakEvenYear: null, rentingOvertakesAgainYear: null };
  const years = Math.max(0, Math.floor(inputs.years));
  const termMonths = Math.max(1, Math.round(inputs.termYears * 12));
  const fixMonths = Math.max(0, Math.round(inputs.fixYears * 12));
  const loan = Math.max(0, inputs.price - upfront.deposit);
  const growth = monthlyRate(inputs.houseGrowth);
  const invest = monthlyRate(inputs.investmentReturn);
  const sellingFixed = inputs.legalSelling + homeReportFor(inputs);
  const fixedYearly = inputs.insurance + inputs.serviceCharge;
  const maintenanceMonthly = inputs.maintenanceRate / 12;

  let balance = loan;
  let value = inputs.price;
  let rentPortfolio = upfront.deposit + upfront.costs;
  let buyPortfolio = 0;
  let rate = fixMonths > 0 ? inputs.mortgageRate : inputs.rateAfterFix;
  let payment = monthlyPayment(loan, rate, termMonths);

  if (recording) {
    const selling = value * inputs.agentFeeRate + sellingFixed;
    recording.series.push({
      year: 0,
      buyWealth: value - balance - selling + buyPortfolio,
      rentWealth: rentPortfolio,
      homeValue: value,
      mortgageBalance: balance,
      sellingCosts: selling,
      buyPortfolio,
      owningPaid: 0,
      rentPaid: 0,
    });
  }

  for (let year = 1; year <= years; year++) {
    const elapsed = year - 1;
    const rent = inputs.rent * Math.pow(1 + inputs.rentGrowth, elapsed);
    const fixedMonthly = (fixedYearly / 12) * Math.pow(1 + inputs.inflation, elapsed);
    let owningPaid = 0;
    let rentPaid = 0;

    for (let month = 0; month < 12; month++) {
      const m = elapsed * 12 + month;
      if (m === fixMonths && m > 0 && m < termMonths && balance > 0) {
        rate = inputs.rateAfterFix;
        payment = monthlyPayment(balance, rate, termMonths - m);
      }
      let paid = 0;
      if (balance > 0) {
        const interest = (balance * rate) / 12;
        if (m >= termMonths - 1 || payment >= balance + interest) {
          paid = balance + interest;
          balance = 0;
        } else {
          paid = payment;
          balance = balance + interest - payment;
        }
      }
      const maintenance = maintenanceMonthly * value;
      const owning = paid + maintenance + fixedMonthly;
      if (recording && m === 0) {
        recording.firstMonth = {
          mortgage: paid,
          maintenance,
          insuranceAndCharges: fixedMonthly,
          owning,
          rent,
        };
      }
      value *= 1 + growth;
      rentPortfolio *= 1 + invest;
      buyPortfolio *= 1 + invest;
      const difference = owning - rent;
      if (difference > 0) rentPortfolio += difference;
      else buyPortfolio -= difference;
      owningPaid += owning;
      rentPaid += rent;
    }

    const selling = value * inputs.agentFeeRate + sellingFixed;
    const buyWealth = value - balance - selling + buyPortfolio;
    if (result.breakEvenYear === null) {
      if (buyWealth > rentPortfolio) {
        result.breakEvenYear = year;
        if (!recording) return result;
      }
    } else if (result.rentingOvertakesAgainYear === null && rentPortfolio >= buyWealth) {
      result.rentingOvertakesAgainYear = year;
    }
    if (recording) {
      recording.series.push({
        year,
        buyWealth,
        rentWealth: rentPortfolio,
        homeValue: value,
        mortgageBalance: balance,
        sellingCosts: selling,
        buyPortfolio,
        owningPaid,
        rentPaid,
      });
    }
  }
  return result;
}

/** First month's costs when the horizon is too short to simulate any month (years = 0). */
function firstMonthWithoutSimulating(inputs: Inputs, upfront: UpfrontBreakdown): FirstMonthCosts {
  const loan = Math.max(0, inputs.price - upfront.deposit);
  const rate = inputs.fixYears > 0 ? inputs.mortgageRate : inputs.rateAfterFix;
  const mortgage = monthlyPayment(loan, rate, Math.max(1, Math.round(inputs.termYears * 12)));
  const maintenance = (inputs.maintenanceRate / 12) * inputs.price;
  const insuranceAndCharges = (inputs.insurance + inputs.serviceCharge) / 12;
  return {
    mortgage,
    maintenance,
    insuranceAndCharges,
    owning: mortgage + maintenance + insuranceAndCharges,
    rent: inputs.rent,
  };
}

function sensitivityRows(inputs: Inputs, upfront: UpfrontBreakdown): SensitivityRow[] {
  const rows: SensitivityRow[] = [];
  for (const houseGrowth of SENSITIVITY_GROWTH) {
    const { breakEvenYear } = simulate({ ...inputs, houseGrowth }, upfront, null);
    rows.push({
      kind: 'growth',
      value: houseGrowth,
      houseGrowth,
      mortgageRate: inputs.mortgageRate,
      breakEvenYear,
    });
  }
  for (const change of SENSITIVITY_RATE) {
    const mortgageRate = Math.max(0, inputs.mortgageRate + change);
    const rateAfterFix = Math.max(0, inputs.rateAfterFix + change);
    const { breakEvenYear } = simulate({ ...inputs, mortgageRate, rateAfterFix }, upfront, null);
    rows.push({
      kind: 'rate',
      value: change,
      houseGrowth: inputs.houseGrowth,
      mortgageRate,
      breakEvenYear,
    });
  }
  return rows;
}

/** Run the simulation for inputs.years years. Sensitivity rows are included unless turned off. */
export function runModel(inputs: Inputs, taxRules: TaxRules, options?: ModelOptions): ModelResult {
  const tax = propertyTax(
    { nation: inputs.nation, buyerType: inputs.buyerType, price: inputs.price },
    taxRules,
  );
  const upfront = buildUpfront(inputs, tax.total);
  const recording: Recording = { series: [], firstMonth: null };
  const { breakEvenYear, rentingOvertakesAgainYear } = simulate(inputs, upfront, recording);
  const last = recording.series[recording.series.length - 1];
  return {
    breakEvenYear,
    rentingOvertakesAgainYear,
    series: recording.series,
    firstMonth: recording.firstMonth ?? firstMonthWithoutSimulating(inputs, upfront),
    upfront,
    tax,
    selling: sellingCosts(last?.homeValue ?? inputs.price, last?.year ?? 0, inputs),
    sensitivity: options?.sensitivity === false ? [] : sensitivityRows(inputs, upfront),
  };
}
